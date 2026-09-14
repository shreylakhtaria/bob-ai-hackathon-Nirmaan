"""
Operator actions: work orders, crew dispatch, pre-positioning, alert
acknowledgement, CSV exports and live system statistics.

Every function here mutates real persisted state (work_orders / crews / alerts)
and writes to the audit log, so no button in the UI has to fake its result.
"""
import csv
import io
import uuid
from datetime import datetime, timedelta, timezone

from .. import config, db
from . import briefing, maintenance
from .crew import SKILL_FOR_TYPE, _travel_min

# How far ahead each priority band is scheduled when an operator books a job.
SCHEDULE_HOURS = {"CRITICAL": 4, "HIGH": 24, "MEDIUM": 72, "LOW": 168}


def _now():
    return db.get_meta("now") or datetime.now(timezone.utc).isoformat()


def _parse(ts):
    try:
        return datetime.fromisoformat(ts)
    except (TypeError, ValueError):
        return datetime.now(timezone.utc)


def _wo_id():
    return f"WO-{uuid.uuid4().hex[:8].upper()}"


def _asset(asset_id):
    return db.query_one("SELECT * FROM assets WHERE asset_id=?", (asset_id,))


def best_crew_for(asset):
    """Nearest AVAILABLE crew, with a penalty for a skill mismatch.

    Same cost model as the pre-positioning optimiser in crew.py, so a dispatch
    made from the UI agrees with what the optimiser recommends.
    """
    crews = db.query("SELECT * FROM crews WHERE availability='AVAILABLE'")
    if not crews:
        return None, None
    required = SKILL_FOR_TYPE.get(asset["asset_type"], "General")
    scored = []
    for c in crews:
        travel = _travel_min(c["latitude"], c["longitude"],
                             asset["latitude"], asset["longitude"])
        penalty = 0 if c["skill_type"] == required else (12 if c["skill_type"] == "General" else 30)
        scored.append((travel + penalty, travel, c))
    scored.sort(key=lambda x: x[0])
    _, travel, crew = scored[0]
    return crew, round(travel + (crew["base_response_min"] or 0), 1)


def _insert_wo(**wo):
    wo.setdefault("wo_id", _wo_id())
    wo.setdefault("created_at", _now())
    wo.setdefault("status", "OPEN")
    cols = ("wo_id", "created_at", "asset_id", "area_id", "crew_id", "wo_type",
            "status", "priority", "scheduled_for", "eta_min", "notes")
    row = {c: wo.get(c) for c in cols}
    with db.session() as conn:
        conn.execute(
            f"INSERT INTO work_orders({','.join(cols)}) "
            f"VALUES({','.join(':' + c for c in cols)})", row)
    return row


def dispatch_crew(asset_id, crew_id=None):
    """Send a crew to an asset: creates a work order and marks the crew ON_JOB."""
    asset = _asset(asset_id)
    if not asset:
        return {"error": f"Asset {asset_id} not found"}
    pred = db.query_one("SELECT * FROM predictions WHERE asset_id=?", (asset_id,))

    if crew_id:
        crew = db.query_one("SELECT * FROM crews WHERE crew_id=?", (crew_id,))
        if not crew:
            return {"error": f"Crew {crew_id} not found"}
        if crew["availability"] != "AVAILABLE":
            return {"error": f"Crew {crew_id} is {crew['availability']} and cannot be dispatched"}
        travel = _travel_min(crew["latitude"], crew["longitude"],
                             asset["latitude"], asset["longitude"])
        eta = round(travel + (crew["base_response_min"] or 0), 1)
    else:
        crew, eta = best_crew_for(asset)
        if not crew:
            return {"error": "No crew is currently AVAILABLE — free a crew or defer the job"}

    wo = _insert_wo(asset_id=asset_id, area_id=asset["geographic_area"],
                    crew_id=crew["crew_id"], wo_type="DISPATCH",
                    priority=(pred or {}).get("priority") or "MEDIUM", eta_min=eta,
                    notes=(pred or {}).get("recommended_action") or "Field inspection")

    with db.session() as conn:
        conn.execute("UPDATE crews SET availability='ON_JOB', active_assignment=? WHERE crew_id=?",
                     (asset_id, crew["crew_id"]))

    db.audit("operator", "dispatch_crew",
             {"asset_id": asset_id, "crew_id": crew["crew_id"], "eta_min": eta, "wo": wo["wo_id"]})
    return {"work_order": wo, "crew_id": crew["crew_id"], "crew_skill": crew["skill_type"],
            "from_area": crew["current_area"], "eta_min": eta, "asset_id": asset_id,
            "message": f"{crew['crew_id']} dispatched to {asset_id} — ETA {eta:.0f} min"}


def schedule_job(asset_id, hours=None):
    """Book a maintenance job in the window implied by the asset's priority band."""
    asset = _asset(asset_id)
    if not asset:
        return {"error": f"Asset {asset_id} not found"}
    pred = db.query_one("SELECT * FROM predictions WHERE asset_id=?", (asset_id,)) or {}
    priority = pred.get("priority") or "MEDIUM"
    horizon = hours if hours is not None else SCHEDULE_HOURS.get(priority, 72)
    when = (_parse(_now()) + timedelta(hours=horizon)).isoformat()

    wo = _insert_wo(asset_id=asset_id, area_id=asset["geographic_area"], wo_type="SCHEDULED",
                    priority=priority, scheduled_for=when,
                    notes=pred.get("recommended_action") or "Scheduled inspection")
    db.audit("operator", "schedule_job",
             {"asset_id": asset_id, "scheduled_for": when, "wo": wo["wo_id"]})
    return {"work_order": wo, "scheduled_for": when, "horizon_hours": horizon,
            "message": f"{asset_id} scheduled within {horizon}h ({priority} band)"}


def defer_job(asset_id, reason=None):
    asset = _asset(asset_id)
    if not asset:
        return {"error": f"Asset {asset_id} not found"}
    pred = db.query_one("SELECT * FROM predictions WHERE asset_id=?", (asset_id,)) or {}
    wo = _insert_wo(asset_id=asset_id, area_id=asset["geographic_area"], wo_type="DEFERRED",
                    status="DEFERRED", priority=pred.get("priority") or "MEDIUM",
                    notes=reason or "Deferred by operator")
    db.audit("operator", "defer_job", {"asset_id": asset_id, "reason": reason, "wo": wo["wo_id"]})
    return {"work_order": wo, "message": f"{asset_id} deferred — logged as {wo['wo_id']}"}


def reposition_crew(crew_id, area_id):
    """Authorise an ML pre-positioning recommendation: actually move the crew."""
    crew = db.query_one("SELECT * FROM crews WHERE crew_id=?", (crew_id,))
    if not crew:
        return {"error": f"Crew {crew_id} not found"}
    area = next((g for g in config.GEO_AREAS if g["area_id"] == area_id), None)
    if not area:
        return {"error": f"Area {area_id} not found"}

    with db.session() as conn:
        conn.execute("UPDATE crews SET current_area=?, latitude=?, longitude=? WHERE crew_id=?",
                     (area_id, area["lat"], area["lon"], crew_id))
    wo = _insert_wo(asset_id=None, area_id=area_id, crew_id=crew_id, wo_type="PRE_POSITION",
                    priority="HIGH", notes=f"Pre-positioned from {crew['current_area']} to {area_id}")
    db.audit("operator", "reposition_crew",
             {"crew_id": crew_id, "from": crew["current_area"], "to": area_id})
    return {"work_order": wo, "crew_id": crew_id, "from_area": crew["current_area"],
            "to_area": area_id,
            "message": f"{crew_id} pre-positioned {crew['current_area']} → {area_id}"}


def emergency_dispatch(limit=5):
    """Bulk-dispatch available crews to the highest grid-impact CRITICAL assets."""
    targets = db.query(
        """SELECT p.asset_id FROM predictions p JOIN assets a ON a.asset_id=p.asset_id
           WHERE p.priority='CRITICAL' ORDER BY p.grid_impact_score DESC LIMIT ?""", (limit,))
    dispatched, skipped = [], []
    for t in targets:
        r = dispatch_crew(t["asset_id"])
        if r.get("error"):
            skipped.append({"asset_id": t["asset_id"], "reason": r["error"]})
        else:
            dispatched.append(r)
    db.audit("operator", "emergency_dispatch",
             {"dispatched": len(dispatched), "skipped": len(skipped)})
    return {"dispatched": dispatched, "skipped": skipped,
            "message": f"{len(dispatched)} crew(s) dispatched to critical assets"
                       + (f", {len(skipped)} could not be staffed" if skipped else "")}


def acknowledge_alert(alert_id):
    row = db.query_one("SELECT * FROM alerts WHERE alert_id=?", (alert_id,))
    if not row:
        return {"error": f"Alert {alert_id} not found"}
    with db.session() as conn:
        conn.execute("UPDATE alerts SET acknowledged=1, acknowledged_at=? WHERE alert_id=?",
                     (_now(), alert_id))
    db.audit("operator", "acknowledge_alert", {"alert_id": alert_id})
    return {"alert_id": alert_id, "acknowledged": True, "message": f"{alert_id} acknowledged"}


def list_work_orders(limit=100, status=None, asset_id=None):
    sql = """SELECT w.*, a.asset_type, a.customers_served FROM work_orders w
             LEFT JOIN assets a ON a.asset_id=w.asset_id WHERE 1=1"""
    params = []
    if status:
        sql += " AND w.status=?"
        params.append(status)
    if asset_id:
        sql += " AND w.asset_id=?"
        params.append(asset_id)
    sql += " ORDER BY w.created_at DESC, w.rowid DESC LIMIT ?"
    params.append(limit)
    return db.query(sql, tuple(params))


def release_crew(crew_id):
    """Close a crew's active work order and return it to AVAILABLE."""
    crew = db.query_one("SELECT * FROM crews WHERE crew_id=?", (crew_id,))
    if not crew:
        return {"error": f"Crew {crew_id} not found"}
    with db.session() as conn:
        conn.execute("UPDATE work_orders SET status='CLOSED' WHERE crew_id=? AND status='OPEN'",
                     (crew_id,))
        conn.execute("UPDATE crews SET availability='AVAILABLE', active_assignment=NULL "
                     "WHERE crew_id=?", (crew_id,))
    db.audit("operator", "release_crew", {"crew_id": crew_id})
    return {"crew_id": crew_id, "message": f"{crew_id} released and available"}


def system_stats():
    """Live counters the UI header/sidebar render instead of hardcoded telemetry."""
    counts = db.query_one(
        """SELECT (SELECT COUNT(*) FROM assets)       AS assets,
                  (SELECT COUNT(*) FROM sensor_data)  AS sensor_rows,
                  (SELECT COUNT(*) FROM weather_data) AS weather_rows,
                  (SELECT COUNT(*) FROM incidents)    AS incidents,
                  (SELECT COUNT(*) FROM crews)        AS crews,
                  (SELECT COUNT(*) FROM crews WHERE availability='AVAILABLE') AS crews_available,
                  (SELECT COUNT(*) FROM work_orders WHERE status='OPEN')      AS open_work_orders,
                  (SELECT COUNT(*) FROM alerts WHERE COALESCE(acknowledged,0)=0) AS unacked_alerts,
                  (SELECT COUNT(*) FROM predictions WHERE priority='CRITICAL') AS critical_assets,
                  (SELECT MAX(timestamp) FROM sensor_data) AS last_sensor_ts""") or {}
    metrics = db.get_meta("model_metrics", {}) or {}
    horizon_h = max(1, config.HISTORY_DAYS * 24)
    counts["telemetry_rows_per_hour"] = round((counts.get("sensor_rows") or 0) / horizon_h, 1)
    counts["model"] = metrics.get("model")
    counts["roc_auc"] = metrics.get("roc_auc")
    counts["n_features"] = metrics.get("n_features")
    counts["trained_at"] = metrics.get("trained_at") or db.get_meta("now")
    counts["as_of"] = db.get_meta("now")
    counts["is_simulation"] = config.IS_SIMULATION
    counts["llm_enabled"] = config.LLM_ENABLED
    try:
        counts["db_size_mb"] = round(config.DB_PATH.stat().st_size / 1_048_576, 1)
    except OSError:
        counts["db_size_mb"] = None
    return counts


# ---------------------------------------------------------------------------
# CSV exports
# ---------------------------------------------------------------------------
def _csv(rows, columns):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow({c: r.get(c) for c in columns})
    return buf.getvalue()


EXPORTS = {
    "maintenance": ["rank", "asset_id", "asset_type", "area", "priority",
                    "failure_probability", "grid_impact_score", "customers_served",
                    "due_window", "recommended_action"],
    "assets": ["asset_id", "asset_type", "geographic_area", "substation_id",
               "customers_served", "downstream_assets", "criticality_score",
               "installation_year", "last_maintenance_date", "current_status"],
    "work_orders": ["wo_id", "created_at", "wo_type", "status", "priority", "asset_id",
                    "area_id", "crew_id", "eta_min", "scheduled_for", "notes"],
    "alerts": ["alert_id", "created_at", "priority", "asset_id", "area_id", "title",
               "reason", "recommended_action", "acknowledged"],
    "audit": ["ts", "actor", "action", "detail"],
}


def export_csv(kind):
    """Return (filename, csv_text) for a real data export — no client-side mocking."""
    if kind == "maintenance":
        rows = maintenance.priority_queue(limit=500)
    elif kind == "assets":
        rows = db.query("SELECT * FROM assets ORDER BY customers_served DESC")
    elif kind == "work_orders":
        rows = list_work_orders(limit=1000)
    elif kind == "alerts":
        rows = db.query("SELECT * FROM alerts ORDER BY created_at DESC")
    elif kind == "audit":
        rows = db.query("SELECT ts,actor,action,detail FROM audit_log ORDER BY id DESC LIMIT 1000")
        rows = [{**r, "detail": str(r.get("detail"))} for r in rows]
    else:
        return None, None
    stamp = _parse(_now()).strftime("%Y%m%d-%H%M")
    db.audit("operator", "export_csv", {"kind": kind, "rows": len(rows)})
    return f"grid-{kind}-{stamp}.csv", _csv(rows, EXPORTS[kind])


def operations_log(limit=50):
    """Recent operator + engine actions, for the Runs Log / audit views."""
    return db.query(
        "SELECT id, ts, actor, action, detail FROM audit_log ORDER BY id DESC LIMIT ?", (limit,))


def brief_text():
    """Plain-text operator brief (used by the Operator Brief export)."""
    b = briefing.generate_brief()
    lines = [
        "GRID RISK COMMAND CENTER — OPERATOR BRIEF",
        f"Generated: {_now()}   (SIMULATION DATA)",
        "",
        f"Overall grid risk      : {b['overall_grid_risk']}",
        f"Critical assets        : {b['critical_assets']}",
        f"High-risk assets       : {b['high_risk_assets']}",
        f"High-risk areas        : {b['high_risk_areas']}",
        f"Weather-exposed zones  : {b['weather_exposed_zones']}",
        f"Customers at risk      : {b['customers_at_risk']:,}",
        "",
        f"Major risk driver: {b['major_risk_driver']}",
        "",
        "Recommended immediate actions:",
    ]
    lines += [f"  {i + 1}. {a}" for i, a in enumerate(b["recommended_immediate_actions"])]
    return "\n".join(lines)
