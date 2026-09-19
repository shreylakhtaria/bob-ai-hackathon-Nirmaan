"""
Maintenance resolution: closing the loop from "this asset is risky" back to
"the work was done, and here is what that changed".

The sequence is: close the work order, write maintenance history, stamp the
asset's last-maintenance date, release the crew — then re-derive risk.

The first four steps happen inside ONE transaction. Half-applying them is the
failure that matters: a closed work order with a crew still marked ON_JOB takes
that crew out of service until someone notices, and a maintenance record with no
date stamp leaves `days_since_maint` (a live model feature) wrong.

Risk recalculation runs *after* the commit, deliberately: it rewrites every row
in `predictions` and takes seconds, and holding SQLite's write lock for that long
would block every other operator action.
"""
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from .. import db
from . import risk as risk_svc
from . import jira as jira_svc

OPEN_STATUSES = ("OPEN", "DEFERRED")
RESULTS = ("COMPLETED", "PARTIAL", "NO_FAULT_FOUND")


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def get_work_order(wo_id: str) -> dict:
    wo = db.query_one("SELECT * FROM work_orders WHERE wo_id=?", (wo_id,))
    if not wo:
        raise HTTPException(404, f"Work order {wo_id} not found")
    return wo


def complete_work_order(wo_id: str, user: dict, *, action_taken: str = None,
                        parts_replaced: str = None, notes: str = None,
                        result: str = "COMPLETED", recalculate: bool = True,
                        proof_attachments: Optional[list] = None,
                        technician_signature: Optional[str] = None,
                        field_status: str = "COMPLETED") -> dict:
    """Mark a work order complete and re-derive the affected risk.

    Idempotent by refusal: a work order that is already CLOSED raises 409 rather
    than writing a second maintenance record and releasing a crew that has since
    been dispatched elsewhere.
    """
    if result not in RESULTS:
        raise HTTPException(422, f"result must be one of: {', '.join(RESULTS)}")

    wo = get_work_order(wo_id)
    if wo["status"] == "CLOSED":
        raise HTTPException(409, f"Work order {wo_id} is already closed")

    asset_id = wo["asset_id"]
    crew_id = wo["crew_id"]
    before = risk_svc.snapshot_asset_risk(asset_id) if asset_id else {}
    completed_at = _now_iso()
    maintenance_id = f"MNT-{uuid.uuid4().hex[:8].upper()}"

    with db.session() as conn:
        # Re-read inside the transaction: between the check above and here another
        # request could have closed it, which would otherwise double-write.
        current = conn.execute("SELECT status FROM work_orders WHERE wo_id=?", (wo_id,)).fetchone()
        if current is None:
            raise HTTPException(404, f"Work order {wo_id} not found")
        if current["status"] == "CLOSED":
            raise HTTPException(409, f"Work order {wo_id} is already closed")

        conn.execute(
            "UPDATE work_orders SET status='CLOSED', notes=? WHERE wo_id=?",
            (notes or wo["notes"], wo_id))

        if asset_id:
            conn.execute(
                """INSERT INTO maintenance_history
                   (maintenance_id, asset_id, date, maintenance_type, technician,
                    issue_found, action_taken, parts_replaced, result)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (maintenance_id, asset_id, completed_at,
                 wo["wo_type"] or "CORRECTIVE",
                 crew_id or user.get("email"),
                 wo["notes"],
                 action_taken or "Work order completed",
                 parts_replaced,
                 result))

            # Feeds days_since_maint, which is a real model feature — without
            # this the recalculation below would see no change at all.
            conn.execute("UPDATE assets SET last_maintenance_date=? WHERE asset_id=?",
                         (completed_at[:10], asset_id))

        # Release the crew only if nothing else still needs it. Blindly setting
        # AVAILABLE would free a crew that is mid-job on another work order.
        crew_released = False
        if crew_id:
            remaining = conn.execute(
                "SELECT COUNT(*) n FROM work_orders "
                "WHERE crew_id=? AND status IN (?,?) AND wo_id<>?",
                (crew_id, *OPEN_STATUSES, wo_id)).fetchone()["n"]
            if remaining == 0:
                conn.execute(
                    "UPDATE crews SET availability='AVAILABLE', active_assignment=NULL "
                    "WHERE crew_id=?", (crew_id,))
                crew_released = True

    # Persist proof-of-work evidence + technician sign-off + completed_at timestamp.
    # completed_at is ALWAYS written so downstream queries can rely on it being set
    # on any CLOSED work order — not only those with proof files attached.
    with db.session() as conn:
        if proof_attachments:
            existing = db.query_one(
                "SELECT proof_attachments FROM work_orders WHERE wo_id=?", (wo_id,)
            ) or {}
            raw_prev = existing.get("proof_attachments") or []
            # rows_to_dicts auto-parses JSON columns, so prev may already be a list
            if isinstance(raw_prev, str):
                try:
                    raw_prev = json.loads(raw_prev)
                except ValueError:
                    raw_prev = []
            conn.execute(
                "UPDATE work_orders SET proof_attachments=? WHERE wo_id=?",
                (json.dumps(raw_prev + proof_attachments), wo_id),
            )
        if technician_signature:
            conn.execute(
                "UPDATE work_orders SET technician_signature=? WHERE wo_id=?",
                (technician_signature, wo_id),
            )
        conn.execute(
            "UPDATE work_orders SET completed_at=? WHERE wo_id=?",
            (completed_at, wo_id),
        )

    db.audit(user.get("email", "system"), "complete_work_order", {
        "wo_id": wo_id, "asset_id": asset_id, "crew_id": crew_id,
        "result": result, "maintenance_id": maintenance_id,
        "crew_released": crew_released,
    })

    # Sync final status to Jira (best-effort — never block resolution on ticket failure)
    jira_result = None
    try:
        resolution_notes = (
            f"Result: {result}. Action: {action_taken or 'N/A'}. "
            f"Parts: {parts_replaced or 'None'}."
        )
        jira_result = jira_svc.sync_status(wo_id, field_status, resolution_notes)
    except Exception:
        pass

    recalc = risk_svc.recalculate(reason=f"maintenance:{wo_id}") if recalculate else None
    after = risk_svc.snapshot_asset_risk(asset_id) if asset_id else {}

    return {
        "work_order": wo_id,
        "asset_id": asset_id,
        "maintenance_id": maintenance_id,
        "result": result,
        "completed_at": completed_at,
        "crew_id": crew_id,
        "crew_released": crew_released,
        "risk_before": before,
        "risk_after": after,
        "recalculation": recalc,
        "jira": jira_result,
    }
