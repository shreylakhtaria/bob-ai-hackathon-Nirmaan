"""
Jira / Enterprise Work Management integration.

Two modes (auto-selected):

  REAL MODE  — JIRA_HOST, JIRA_EMAIL and JIRA_API_TOKEN are set in .env.
                Calls Atlassian Jira Cloud REST API v3.
                Tickets are created in the project identified by JIRA_PROJECT_KEY
                (default: GRID).

  SIMULATED  — Default. No external calls. Tickets are stored in the SQLite
  (default)    meta table under key "jira_tickets" (JSON list). Every response
                mirrors the Jira REST shape so callers are unaware of the mode.

The simulated mode provides 100% test isolation and zero cloud dependency,
making the demo self-contained.  Set the three env vars to switch to live Jira.
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from .. import config, db

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
JIRA_HOST    = os.getenv("JIRA_HOST", "")           # e.g. https://your-org.atlassian.net
JIRA_EMAIL   = os.getenv("JIRA_EMAIL", "")
JIRA_TOKEN   = os.getenv("JIRA_API_TOKEN", "")
JIRA_PROJECT = os.getenv("JIRA_PROJECT_KEY", "GRID")
JIRA_ENABLED = bool(JIRA_HOST and JIRA_EMAIL and JIRA_TOKEN)

# Field-crew workflow states (Jira transition names → IDs resolved on first call)
_STATUS_MAP = {
    "DISPATCHED":  "To Do",
    "EN_ROUTE":    "In Progress",
    "ON_SITE":     "In Progress",
    "RESOLVING":   "Under Review",
    "COMPLETED":   "Done",
}

# Severity → Jira priority label
_PRIORITY_MAP = {
    "CRITICAL": "Highest",
    "HIGH":     "High",
    "MEDIUM":   "Medium",
    "LOW":      "Low",
}

# Simulated ticket counter key stored in meta
_META_KEY = "jira_tickets"


# ---------------------------------------------------------------------------
# Internal helpers — simulated mode
# ---------------------------------------------------------------------------
def _sim_load() -> list:
    raw = db.get_meta(_META_KEY, [])
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            raw = []
    return raw if isinstance(raw, list) else []


def _sim_save(tickets: list) -> None:
    db.set_meta(_META_KEY, tickets)


def _sim_next_key() -> str:
    tickets = _sim_load()
    n = max((int(t["key"].split("-")[1]) for t in tickets if "-" in t["key"]), default=0) + 1
    return f"{JIRA_PROJECT}-{n}"


# ---------------------------------------------------------------------------
# Internal helpers — real Jira mode
# ---------------------------------------------------------------------------
def _jira_headers() -> dict:
    import base64
    cred = base64.b64encode(f"{JIRA_EMAIL}:{JIRA_TOKEN}".encode()).decode()
    return {
        "Authorization": f"Basic {cred}",
        "Content-Type":  "application/json",
        "Accept":        "application/json",
    }


def _jira_post(path: str, body: dict) -> dict:
    import httpx
    url = f"{JIRA_HOST}/rest/api/3{path}"
    r = httpx.post(url, headers=_jira_headers(), json=body, timeout=15)
    r.raise_for_status()
    return r.json()


def _jira_get(path: str) -> dict:
    import httpx
    url = f"{JIRA_HOST}/rest/api/3{path}"
    r = httpx.get(url, headers=_jira_headers(), timeout=15)
    r.raise_for_status()
    return r.json()


def _jira_put(path: str, body: dict) -> dict:
    import httpx
    url = f"{JIRA_HOST}/rest/api/3{path}"
    r = httpx.put(url, headers=_jira_headers(), json=body, timeout=15)
    r.raise_for_status()
    return r.json() if r.content else {}


def _jira_transition(issue_key: str, target_status: str) -> None:
    """Transition a Jira issue to the named status."""
    import httpx
    status_name = _STATUS_MAP.get(target_status, target_status)
    transitions = _jira_get(f"/issue/{issue_key}/transitions")
    match = next(
        (t for t in transitions.get("transitions", [])
         if t["to"]["name"].lower() == status_name.lower()),
        None,
    )
    if match:
        _jira_post(f"/issue/{issue_key}/transitions", {"transition": {"id": match["id"]}})


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def get_config() -> dict:
    """Return Jira connectivity configuration (sanitised — no token)."""
    return {
        "jira_enabled": JIRA_ENABLED,
        "host":         JIRA_HOST or None,
        "email":        JIRA_EMAIL or None,
        "project":      JIRA_PROJECT,
        "mode":         "real" if JIRA_ENABLED else "simulated",
    }


def test_connection() -> dict:
    """Probe the Jira API. Returns {ok, mode, message}."""
    if not JIRA_ENABLED:
        tickets = _sim_load()
        return {
            "ok": True,
            "mode": "simulated",
            "message": f"Simulated Jira — {len(tickets)} ticket(s) in local store.",
        }
    try:
        myself = _jira_get("/myself")
        return {
            "ok": True,
            "mode": "real",
            "message": f"Connected to {JIRA_HOST} as {myself.get('displayName', JIRA_EMAIL)}",
        }
    except Exception as exc:
        return {"ok": False, "mode": "real", "message": str(exc)}


def create_ticket(
    work_order_id: str,
    asset_id: str,
    crew_id: Optional[str],
    priority: str,
    asset_type: str,
    area: str,
    risk_summary: str,
    telemetry: Optional[dict] = None,
) -> dict:
    """
    Create a work-management ticket for a dispatched / scheduled work order.

    Returns a dict with at least: key, url, status, mode.
    """
    title   = f"[{priority}] Grid Asset {asset_id} — {asset_type} ({area})"
    body    = _build_description(work_order_id, asset_id, crew_id, priority,
                                 asset_type, area, risk_summary, telemetry)
    jira_priority = _PRIORITY_MAP.get(priority, "Medium")
    created_at = datetime.now(timezone.utc).isoformat()

    if JIRA_ENABLED:
        payload = {
            "fields": {
                "project":     {"key": JIRA_PROJECT},
                "summary":     title,
                "description": {
                    "type":    "doc",
                    "version": 1,
                    "content": [{"type": "paragraph",
                                 "content": [{"type": "text", "text": body}]}],
                },
                "issuetype": {"name": "Task"},
                "priority":  {"name": jira_priority},
                "labels":    ["grid-risk", priority.lower(), asset_type.lower()],
            }
        }
        result   = _jira_post("/issue", payload)
        key      = result["key"]
        url      = f"{JIRA_HOST}/browse/{key}"
        status   = "To Do"
        mode     = "real"
    else:
        key    = _sim_next_key()
        url    = f"https://simulated-jira.example.com/browse/{key}"
        status = "To Do"
        mode   = "simulated"
        ticket = {
            "key":          key,
            "url":          url,
            "title":        title,
            "description":  body,
            "priority":     jira_priority,
            "status":       status,
            "work_order_id": work_order_id,
            "asset_id":     asset_id,
            "crew_id":      crew_id,
            "created_at":   created_at,
            "updated_at":   created_at,
            "resolution":   None,
        }
        tickets = _sim_load()
        tickets.append(ticket)
        _sim_save(tickets)

    # Stamp the work order with the Jira key + URL
    with db.session() as conn:
        conn.execute(
            "UPDATE work_orders SET jira_key=?, jira_url=? WHERE wo_id=?",
            (key, url, work_order_id),
        )

    db.audit("jira", "ticket_created", {
        "wo_id": work_order_id, "asset_id": asset_id,
        "jira_key": key, "mode": mode,
    })

    return {"key": key, "url": url, "status": status, "mode": mode, "created_at": created_at}


def sync_status(work_order_id: str, target_field_status: str,
                resolution_notes: Optional[str] = None) -> dict:
    """
    Sync a field-crew status change back to Jira.

    target_field_status: DISPATCHED | EN_ROUTE | ON_SITE | RESOLVING | COMPLETED
    """
    wo = db.query_one("SELECT jira_key FROM work_orders WHERE wo_id=?", (work_order_id,))
    if not wo or not wo.get("jira_key"):
        return {"ok": False, "reason": "No Jira ticket linked to this work order"}

    jira_key = wo["jira_key"]

    if JIRA_ENABLED:
        _jira_transition(jira_key, target_field_status)
        if resolution_notes and target_field_status == "COMPLETED":
            _jira_post(f"/issue/{jira_key}/comment", {
                "body": {
                    "type": "doc", "version": 1,
                    "content": [{"type": "paragraph",
                                 "content": [{"type": "text", "text": resolution_notes}]}],
                }
            })
        mode = "real"
    else:
        tickets = _sim_load()
        new_status = _STATUS_MAP.get(target_field_status, target_field_status)
        for t in tickets:
            if t["key"] == jira_key:
                t["status"] = new_status
                t["updated_at"] = datetime.now(timezone.utc).isoformat()
                if resolution_notes:
                    t["resolution"] = resolution_notes
                break
        _sim_save(tickets)
        mode = "simulated"

    # Also stamp the work_orders.field_status column
    with db.session() as conn:
        conn.execute(
            "UPDATE work_orders SET field_status=? WHERE wo_id=?",
            (target_field_status, work_order_id),
        )

    return {"ok": True, "jira_key": jira_key, "new_status": target_field_status, "mode": mode}


def attach_proof(work_order_id: str, proof_items: list) -> dict:
    """
    Record proof-of-work evidence items (file metadata or base64 snippets).

    proof_items: list of {name, type, size, url_or_data, uploaded_at}
    Stored in work_orders.proof_attachments as a JSON array.
    Also updates the linked Jira ticket with a comment.
    """
    wo = db.query_one(
        "SELECT jira_key, proof_attachments FROM work_orders WHERE wo_id=?",
        (work_order_id,),
    )
    if not wo:
        return {"ok": False, "reason": "Work order not found"}

    existing = wo.get("proof_attachments") or []
    if isinstance(existing, str):
        try:
            existing = json.loads(existing)
        except ValueError:
            existing = []

    updated = existing + proof_items
    with db.session() as conn:
        conn.execute(
            "UPDATE work_orders SET proof_attachments=? WHERE wo_id=?",
            (json.dumps(updated), work_order_id),
        )

    # Jira comment listing the evidence
    jira_key = wo.get("jira_key")
    if jira_key:
        names = ", ".join(p.get("name", "file") for p in proof_items)
        note  = f"Field evidence attached: {names}"
        if JIRA_ENABLED:
            _jira_post(f"/issue/{jira_key}/comment", {
                "body": {
                    "type": "doc", "version": 1,
                    "content": [{"type": "paragraph",
                                 "content": [{"type": "text", "text": note}]}],
                }
            })
        else:
            tickets = _sim_load()
            for t in tickets:
                if t["key"] == jira_key:
                    t["updated_at"] = datetime.now(timezone.utc).isoformat()
                    t.setdefault("proof_comments", []).append(note)
            _sim_save(tickets)

    return {"ok": True, "total_attachments": len(updated), "jira_key": jira_key}


def list_tickets(limit: int = 50) -> list:
    """Return all tracked tickets (simulated or fetched from Jira)."""
    if JIRA_ENABLED:
        result = _jira_get(
            f"/search?jql=project={JIRA_PROJECT}+ORDER+BY+created+DESC&maxResults={limit}"
        )
        issues = result.get("issues", [])
        return [
            {
                "key":        i["key"],
                "url":        f"{JIRA_HOST}/browse/{i['key']}",
                "title":      i["fields"]["summary"],
                "status":     i["fields"]["status"]["name"],
                "priority":   i["fields"]["priority"]["name"],
                "created_at": i["fields"]["created"],
            }
            for i in issues
        ]
    return list(reversed(_sim_load()))[:limit]


def get_ticket(jira_key: str) -> Optional[dict]:
    """Fetch a single ticket by key."""
    if JIRA_ENABLED:
        try:
            i = _jira_get(f"/issue/{jira_key}")
            return {
                "key":      i["key"],
                "url":      f"{JIRA_HOST}/browse/{i['key']}",
                "title":    i["fields"]["summary"],
                "status":   i["fields"]["status"]["name"],
                "priority": i["fields"]["priority"]["name"],
            }
        except Exception:
            return None
    tickets = _sim_load()
    return next((t for t in tickets if t["key"] == jira_key), None)


# ---------------------------------------------------------------------------
# Private: description builder
# ---------------------------------------------------------------------------
def _build_description(wo_id, asset_id, crew_id, priority,
                        asset_type, area, risk_summary, telemetry):
    lines = [
        f"Work Order: {wo_id}",
        f"Asset: {asset_id} ({asset_type}) — {area}",
        f"Priority: {priority}",
        f"Assigned Crew: {crew_id or 'TBD'}",
        "",
        "Risk Summary:",
        risk_summary,
    ]
    if telemetry:
        lines += ["", "Latest Telemetry Readings:"]
        for k, v in telemetry.items():
            if v is not None:
                lines.append(f"  • {k}: {v}")
    lines += ["", "[AUTO-GENERATED by Grid Risk Command Center]"]
    return "\n".join(lines)
