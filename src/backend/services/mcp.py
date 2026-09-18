"""
MCP tool registry: the only surface through which the AI may touch this system.

The rules that matter, in order of how badly they fail if broken:

1. **Allowlist, not reflection.** Tools are looked up in an explicit registry.
   The model never names a Python callable, a SQL string, a shell command or a
   URL. An unknown tool name is refused — it is never resolved dynamically.
2. **Authorization is per tool, per caller, server-side.** Every execution
   checks the caller's role from their signed token. The model does not get to
   assert who it is acting for.
3. **Mutating tools never fire on inference alone.** They are marked
   `write=True` and require an explicit human confirmation token, so a sentence
   that merely *sounds* like approval cannot dispatch a crew.
4. **Everything is audited** — caller, tool, arguments, authorization outcome
   and result — including the calls that were refused, because a blocked
   attempt is the one you most want a record of.

Arguments are validated against each tool's declared schema before the
underlying service is called, so a malformed or injected argument is rejected at
the boundary rather than inside business logic.
"""
import logging
import time
import uuid

from fastapi import HTTPException

from .. import db
from . import copilot, crew as crew_svc, impact as impact_svc, maintenance as maint_svc
from . import operations as ops_svc, resolution as resolution_svc, simulation as sim_svc

log = logging.getLogger("grid.mcp")

# Confirmations are short-lived and single-use: a stale token should not be able
# to authorise an action minutes later, in a conversation that has moved on.
_PENDING: dict[str, dict] = {}
CONFIRMATION_TTL_SECONDS = 300


def _param(type_, description, required=True, enum=None):
    return {"type": type_, "description": description, "required": required, "enum": enum}


# ---------------------------------------------------------------------------
# Tool implementations (thin wrappers over the existing services)
# ---------------------------------------------------------------------------
def _get_asset_status(asset_id: str):
    return copilot.get_asset_details(asset_id)


def _get_risk_summary(limit: int = 10):
    return copilot.get_high_risk_assets(limit)


def _get_area_risk(area_id: str = None):
    return copilot.get_area_risk(area_id)


def _get_crew_availability():
    return crew_svc.recommend_crews()


def _get_maintenance_queue(limit: int = 10):
    return maint_svc.priority_queue(limit=limit)


def _get_maintenance_history(asset_id: str):
    return db.query(
        "SELECT * FROM maintenance_history WHERE asset_id=? ORDER BY date DESC LIMIT 50",
        (asset_id,))


def _simulate_asset_failure(asset_id: str):
    return sim_svc.simulate_asset_failure(asset_id)


def _simulate_weather_event(area_id: str, event: str = "severe"):
    return sim_svc.simulate_weather_event(area_id, event)


def _assign_crew(asset_id: str, crew_id: str = None, _actor: dict = None):
    result = ops_svc.dispatch_crew(asset_id, crew_id)
    if isinstance(result, dict) and result.get("error"):
        raise HTTPException(409, result["error"])
    return result


def _mark_asset_resolved(wo_id: str, notes: str = None, _actor: dict = None):
    return resolution_svc.complete_work_order(wo_id, _actor or {}, notes=notes)


# ---------------------------------------------------------------------------
# The registry. Adding a tool is a deliberate act: name, schema, roles, and
# whether it writes.
# ---------------------------------------------------------------------------
TOOLS = {
    "get_asset_status": {
        "fn": _get_asset_status,
        "description": "Full detail and current prediction for one asset.",
        "params": {"asset_id": _param("string", "Asset identifier, e.g. T-1024")},
        "write": False,
        "roles": ("admin", "operator", "crew"),
    },
    "get_risk_summary": {
        "fn": _get_risk_summary,
        "description": "Highest-risk assets ranked by grid impact.",
        "params": {"limit": _param("integer", "How many assets (1-50)", required=False)},
        "write": False,
        "roles": ("admin", "operator", "crew"),
    },
    "get_area_risk": {
        "fn": _get_area_risk,
        "description": "Outage risk for one area, or all areas if omitted.",
        "params": {"area_id": _param("string", "Area identifier, e.g. NORTH-04", required=False)},
        "write": False,
        "roles": ("admin", "operator", "crew"),
    },
    "get_crew_availability": {
        "fn": _get_crew_availability,
        "description": "Crew roster with availability and pre-positioning recommendations.",
        "params": {},
        "write": False,
        "roles": ("admin", "operator", "crew"),
    },
    "get_maintenance_queue": {
        "fn": _get_maintenance_queue,
        "description": "Impact-ranked maintenance queue.",
        "params": {"limit": _param("integer", "How many entries (1-50)", required=False)},
        "write": False,
        "roles": ("admin", "operator", "crew"),
    },
    "get_maintenance_history": {
        "fn": _get_maintenance_history,
        "description": "Past maintenance records for one asset.",
        "params": {"asset_id": _param("string", "Asset identifier")},
        "write": False,
        "roles": ("admin", "operator", "crew"),
    },
    "simulate_asset_failure": {
        "fn": _simulate_asset_failure,
        "description": "Model the impact if an asset failed. Read-only: changes nothing.",
        "params": {"asset_id": _param("string", "Asset identifier")},
        "write": False,
        "roles": ("admin", "operator", "crew"),
    },
    "simulate_weather_event": {
        "fn": _simulate_weather_event,
        "description": "Model a severe weather event on an area. Read-only.",
        "params": {
            "area_id": _param("string", "Area identifier"),
            "event": _param("string", "Severity", required=False,
                            enum=["mild", "moderate", "severe", "extreme"]),
        },
        "write": False,
        "roles": ("admin", "operator", "crew"),
    },
    # ---- mutating: confirmation required ----
    "assign_crew": {
        "fn": _assign_crew,
        "description": "Dispatch a crew to an asset. Creates a work order and puts the crew on job.",
        "params": {
            "asset_id": _param("string", "Asset to dispatch to"),
            "crew_id": _param("string", "Specific crew, or omit for the best available",
                              required=False),
        },
        "write": True,
        "roles": ("admin", "operator"),
    },
    "mark_asset_resolved": {
        "fn": _mark_asset_resolved,
        "description": "Complete a work order: records maintenance, releases the crew, "
                       "and recalculates risk.",
        "params": {
            "wo_id": _param("string", "Work order identifier"),
            "notes": _param("string", "Completion notes", required=False),
        },
        "write": True,
        "roles": ("admin", "operator", "crew"),
    },
}


def list_tools(user: dict) -> list[dict]:
    """Tools this caller may use. The model is only ever shown what it can run."""
    role = user.get("role")
    return [
        {"name": name, "description": spec["description"], "parameters": spec["params"],
         "write": spec["write"], "requires_confirmation": spec["write"]}
        for name, spec in TOOLS.items() if role in spec["roles"]
    ]


def _validate_args(name: str, spec: dict, args: dict) -> dict:
    """Check arguments against the declared schema and drop anything undeclared."""
    args = args or {}
    unknown = set(args) - set(spec["params"])
    if unknown:
        raise HTTPException(422, f"{name}: unexpected argument(s): {', '.join(sorted(unknown))}")

    clean = {}
    for pname, pspec in spec["params"].items():
        if pname not in args or args[pname] is None:
            if pspec["required"]:
                raise HTTPException(422, f"{name}: missing required argument '{pname}'")
            continue
        value = args[pname]
        if pspec["type"] == "integer":
            try:
                value = int(value)
            except (TypeError, ValueError):
                raise HTTPException(422, f"{name}: '{pname}' must be an integer")
            value = max(1, min(value, 50))
        elif pspec["type"] == "string":
            value = str(value).strip()
            if not value:
                raise HTTPException(422, f"{name}: '{pname}' must not be empty")
            if len(value) > 120:
                raise HTTPException(422, f"{name}: '{pname}' is too long")
        if pspec["enum"] and value not in pspec["enum"]:
            raise HTTPException(422, f"{name}: '{pname}' must be one of {pspec['enum']}")
        clean[pname] = value
    return clean


def _audit(user, name, args, allowed, outcome, detail=None):
    db.audit(user.get("email", "unknown"), "mcp_tool_call", {
        "tool": name, "arguments": args, "authorized": allowed,
        "outcome": outcome, "detail": detail, "role": user.get("role"),
    })


def prepare_confirmation(name: str, args: dict, user: dict) -> dict:
    """Describe a pending mutating action and hand back a single-use token.

    The model proposes; a person disposes. Nothing is executed here.
    """
    spec = TOOLS.get(name)
    if not spec:
        raise HTTPException(404, f"Unknown tool '{name}'")
    if not spec["write"]:
        raise HTTPException(400, f"{name} does not require confirmation")
    if user.get("role") not in spec["roles"]:
        _audit(user, name, args, False, "denied")
        raise HTTPException(403, f"{name} requires one of: {', '.join(spec['roles'])}")

    clean = _validate_args(name, spec, args)
    token = uuid.uuid4().hex
    _PENDING[token] = {"tool": name, "args": clean, "user_id": user.get("id"),
                       "created": time.time()}
    _audit(user, name, clean, True, "confirmation_requested")
    return {"confirmation_token": token, "tool": name, "arguments": clean,
            "summary": f"{spec['description']} Arguments: {clean}",
            "expires_in": CONFIRMATION_TTL_SECONDS}


def execute(name: str, args: dict, user: dict, confirmation_token: str = None) -> dict:
    """Run an allowlisted tool for an authorized caller."""
    spec = TOOLS.get(name)
    if not spec:
        # Never fall back to resolving the name some other way.
        _audit(user, name, args, False, "unknown_tool")
        raise HTTPException(404, f"Unknown tool '{name}'")

    if user.get("role") not in spec["roles"]:
        _audit(user, name, args, False, "denied")
        raise HTTPException(403, f"{name} requires one of: {', '.join(spec['roles'])}")

    clean = _validate_args(name, spec, args)

    if spec["write"]:
        pending = _PENDING.get(confirmation_token or "")
        if not pending:
            _audit(user, name, clean, True, "confirmation_required")
            raise HTTPException(428, f"{name} is a mutating action and needs explicit confirmation")
        if time.time() - pending["created"] > CONFIRMATION_TTL_SECONDS:
            _PENDING.pop(confirmation_token, None)
            raise HTTPException(428, "Confirmation expired — please confirm again")
        # Bind the token to its tool, arguments and requester, so a confirmation
        # for one action cannot be replayed to authorise a different one.
        if (pending["tool"] != name or pending["args"] != clean
                or pending["user_id"] != user.get("id")):
            _audit(user, name, clean, False, "confirmation_mismatch")
            raise HTTPException(403, "Confirmation does not match this action")
        _PENDING.pop(confirmation_token, None)   # single use

    started = time.time()
    try:
        fn = spec["fn"]
        result = fn(**clean, _actor=user) if spec["write"] else fn(**clean)
    except HTTPException as exc:
        _audit(user, name, clean, True, "error", str(exc.detail))
        raise
    except Exception as exc:
        log.exception("mcp tool %s failed", name)
        _audit(user, name, clean, True, "error", str(exc))
        raise HTTPException(500, f"Tool '{name}' failed")

    _audit(user, name, clean, True, "ok")
    return {"tool": name, "arguments": clean, "write": spec["write"],
            "elapsed_seconds": round(time.time() - started, 3), "result": result}
