"""
Grid Risk Command Center - FastAPI application.

Serves the JSON REST API under /api. The operator UI is a separate Next.js app
(src/frontend-next) which proxies /api/* here.
Run:  uvicorn backend.main:app --reload --port 8000
"""
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from pydantic import BaseModel, Field

from . import config, db
from .services import (impact as impact_svc, crew as crew_svc, simulation as sim_svc,
                       briefing as brief_svc, copilot as copilot_svc, maintenance as maint_svc,
                       operations as ops_svc, auth as auth_svc)

app = FastAPI(title=config.API_TITLE, version=config.API_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])

# Keep the schema current (adds work_orders / alert-ack columns to older databases).
db.init_db()


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class SimulationRequest(BaseModel):
    type: str                       # "asset_failure" | "weather_event"
    asset_id: Optional[str] = None
    area_id: Optional[str] = None
    event: Optional[str] = "severe"


class CopilotRequest(BaseModel):
    query: str


class DispatchRequest(BaseModel):
    asset_id: str
    crew_id: Optional[str] = None


class ScheduleRequest(BaseModel):
    asset_id: str
    hours: Optional[int] = None


class DeferRequest(BaseModel):
    asset_id: str
    reason: Optional[str] = None


class RepositionRequest(BaseModel):
    crew_id: str
    area_id: str


class SignupRequest(BaseModel):
    display_name: str = Field(default="Operator", min_length=2, max_length=80)
    email: str
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: str
    password: str


def _require_seeded():
    if not db.query_one("SELECT 1 FROM assets LIMIT 1"):
        raise HTTPException(503, "Database not seeded. Run: python -m scripts.seed")


# ---------------------------------------------------------------------------
# Meta / health
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health():
    seeded = bool(db.query_one("SELECT 1 FROM assets LIMIT 1"))
    return {"status": "ok", "seeded": seeded, "is_simulation": config.IS_SIMULATION,
            "llm_enabled": config.LLM_ENABLED, "now": db.get_meta("now")}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@app.post("/api/auth/signup")
def auth_signup(req: SignupRequest):
    user = auth_svc.signup(req.display_name, req.email, req.password)
    return {"token": auth_svc.issue_token(user), "user": auth_svc.public_user(user)}


@app.post("/api/auth/login")
def auth_login(req: LoginRequest):
    user = auth_svc.login(req.email, req.password)
    return {"token": auth_svc.issue_token(user), "user": auth_svc.public_user(user)}


@app.get("/api/auth/me")
def auth_me(current=Depends(auth_svc.get_current_user)):
    return {"id": current["uid"], "email": current["email"], "role": current["role"]}


@app.get("/api/model/metrics")
def model_metrics():
    return db.get_meta("model_metrics", {})


# ---------------------------------------------------------------------------
# Dashboard summary
# ---------------------------------------------------------------------------
@app.get("/api/dashboard/summary")
def dashboard_summary():
    _require_seeded()
    brief = brief_svc.generate_brief()
    counts = db.query_one(
        """SELECT
            SUM(CASE WHEN priority='CRITICAL' THEN 1 ELSE 0 END) crit,
            SUM(CASE WHEN priority='HIGH' THEN 1 ELSE 0 END) high,
            SUM(CASE WHEN failure_probability>=? THEN 1 ELSE 0 END) predicted_failures,
            COUNT(*) total
           FROM predictions""", (config.RISK_BANDS["MEDIUM"],))
    top = db.query(
        """SELECT p.asset_id, a.asset_type, a.geographic_area area, p.failure_probability,
                  p.grid_impact_score, p.priority, p.weather_risk, a.customers_served
           FROM predictions p JOIN assets a ON a.asset_id=p.asset_id
           ORDER BY p.grid_impact_score DESC LIMIT 10""")
    alerts = db.query("SELECT * FROM alerts ORDER BY "
                      "CASE priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END LIMIT 8")
    areas = db.query("SELECT * FROM area_risk ORDER BY outage_probability DESC")
    return {
        "as_of": db.get_meta("now"), "is_simulation": True,
        "overall_grid_risk": brief["overall_grid_risk"],
        "critical_assets": counts["crit"] or 0, "high_risk_assets": counts["high"] or 0,
        "predicted_failures": counts["predicted_failures"] or 0,
        "total_assets": counts["total"] or 0,
        "customers_at_risk": brief["customers_at_risk"],
        "weather_exposed_zones": brief["weather_exposed_zones"],
        "active_alerts": len(alerts), "alerts": alerts,
        "top_assets": top, "areas": areas,
        "recommended_actions": brief["recommended_immediate_actions"],
        "major_risk_driver": brief["major_risk_driver"],
    }


# ---------------------------------------------------------------------------
# Assets
# ---------------------------------------------------------------------------
@app.get("/api/assets")
def list_assets(area: Optional[str] = None, asset_type: Optional[str] = None,
                priority: Optional[str] = None, limit: int = 500):
    _require_seeded()
    sql = """SELECT a.*, p.failure_probability, p.risk_level, p.grid_impact_score,
                    p.priority, p.weather_risk, p.predicted_failure_window,
                    p.recommended_action, p.anomaly_score
             FROM assets a LEFT JOIN predictions p ON p.asset_id=a.asset_id WHERE 1=1"""
    params = []
    if area:
        sql += " AND a.geographic_area=?"; params.append(area)
    if asset_type:
        sql += " AND a.asset_type=?"; params.append(asset_type)
    if priority:
        sql += " AND p.priority=?"; params.append(priority)
    sql += " ORDER BY p.grid_impact_score DESC LIMIT ?"; params.append(limit)
    return db.query(sql, tuple(params))


@app.get("/api/assets/{asset_id}")
def asset_detail(asset_id: str):
    a = db.query_one("SELECT * FROM assets WHERE asset_id=?", (asset_id,))
    if not a:
        raise HTTPException(404, f"Asset {asset_id} not found")
    p = db.query_one("SELECT * FROM predictions WHERE asset_id=?", (asset_id,))
    incidents = db.query("SELECT * FROM incidents WHERE asset_id=? ORDER BY incident_timestamp DESC",
                         (asset_id,))
    maint = db.query("SELECT * FROM maintenance_history WHERE asset_id=? ORDER BY date DESC",
                     (asset_id,))
    return {"asset": a, "prediction": p, "incidents": incidents, "maintenance": maint,
            "weather": impact_svc.area_weather_risk().get(a["geographic_area"])}


@app.get("/api/assets/{asset_id}/risk")
def asset_risk(asset_id: str):
    p = db.query_one("SELECT * FROM predictions WHERE asset_id=?", (asset_id,))
    if not p:
        raise HTTPException(404, f"No prediction for {asset_id}")
    return p


@app.get("/api/assets/{asset_id}/sensors")
def asset_sensors(asset_id: str, hours: int = Query(168, le=1000)):
    rows = db.query("SELECT * FROM sensor_data WHERE asset_id=? ORDER BY timestamp DESC LIMIT ?",
                    (asset_id, hours))
    return list(reversed(rows))


@app.get("/api/assets/{asset_id}/history")
def asset_history(asset_id: str):
    return {
        "incidents": db.query("SELECT * FROM incidents WHERE asset_id=? ORDER BY incident_timestamp DESC",
                              (asset_id,)),
        "maintenance": db.query("SELECT * FROM maintenance_history WHERE asset_id=? ORDER BY date DESC",
                                (asset_id,)),
    }


# ---------------------------------------------------------------------------
# Risks / areas / weather / incidents
# ---------------------------------------------------------------------------
@app.get("/api/risks")
def risks(limit: int = 500):
    return db.query(
        """SELECT p.*, a.asset_type, a.geographic_area area, a.customers_served
           FROM predictions p JOIN assets a ON a.asset_id=p.asset_id
           ORDER BY p.grid_impact_score DESC LIMIT ?""", (limit,))


@app.get("/api/risks/critical")
def critical_risks():
    return db.query(
        """SELECT p.*, a.asset_type, a.geographic_area area, a.customers_served
           FROM predictions p JOIN assets a ON a.asset_id=p.asset_id
           WHERE p.priority IN ('CRITICAL','HIGH') ORDER BY p.grid_impact_score DESC""")


@app.get("/api/areas/risk")
def areas_risk():
    return db.query("SELECT * FROM area_risk ORDER BY outage_probability DESC")


@app.get("/api/weather")
def weather(area: Optional[str] = None):
    wx = impact_svc.area_weather_risk()
    if area:
        return wx.get(area) or {}
    return wx


@app.get("/api/weather/series")
def weather_series(area: str, hours: int = 96):
    return db.query(
        """SELECT * FROM weather_data WHERE geographic_area=?
           ORDER BY timestamp DESC LIMIT ?""", (area, hours))


@app.get("/api/incidents")
def incidents(limit: int = 200):
    return db.query(
        """SELECT i.*, a.asset_type, a.geographic_area area FROM incidents i
           JOIN assets a ON a.asset_id=i.asset_id ORDER BY i.incident_timestamp DESC LIMIT ?""",
        (limit,))


@app.get("/api/alerts")
def alerts():
    return db.query("SELECT * FROM alerts ORDER BY "
                    "CASE priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END, created_at DESC")


# ---------------------------------------------------------------------------
# Maintenance / crews
# ---------------------------------------------------------------------------
@app.get("/api/maintenance/priorities")
def maintenance_priorities(area: Optional[str] = None, asset_type: Optional[str] = None,
                           priority: Optional[str] = None, min_prob: float = 0.0,
                           min_customers: int = 0, limit: int = 100):
    _require_seeded()
    return maint_svc.priority_queue(area=area, asset_type=asset_type, priority=priority,
                                    min_prob=min_prob, min_customers=min_customers, limit=limit)


@app.get("/api/crews")
def crews():
    return db.query("SELECT * FROM crews")


@app.get("/api/crews/recommendations")
def crew_recommendations():
    _require_seeded()
    return crew_svc.recommend_crews()


# Note: crew dispatch and pre-positioning are handled by the work-orders API
# below (ops_svc.dispatch_crew / ops_svc.reposition_crew), which checks crew
# availability, computes a real travel-time ETA, and updates lat/lon — not
# just a free-text label.


# ---------------------------------------------------------------------------
# Map data
# ---------------------------------------------------------------------------
@app.get("/api/map")
def map_data():
    _require_seeded()
    assets = db.query(
        """SELECT a.asset_id, a.asset_type, a.geographic_area area, a.latitude, a.longitude,
                  a.customers_served, p.failure_probability, p.priority, p.grid_impact_score,
                  p.weather_risk
           FROM assets a LEFT JOIN predictions p ON p.asset_id=a.asset_id""")
    crews = db.query("SELECT crew_id, current_area, latitude, longitude, skill_type, availability FROM crews")
    areas = db.query("SELECT * FROM area_risk")
    centroids = {g["area_id"]: g for g in config.GEO_AREAS}
    for ar in areas:
        c = centroids.get(ar["area_id"])
        if c:
            ar["lat"] = c["lat"]; ar["lon"] = c["lon"]
    return {"assets": assets, "crews": crews, "areas": areas}


# ---------------------------------------------------------------------------
# Simulation / copilot / brief
# ---------------------------------------------------------------------------
@app.post("/api/simulation")
def run_simulation(req: SimulationRequest):
    _require_seeded()
    if req.type == "asset_failure":
        if not req.asset_id:
            raise HTTPException(400, "asset_id required for asset_failure")
        r = sim_svc.simulate_asset_failure(req.asset_id)
    elif req.type == "weather_event":
        if not req.area_id:
            raise HTTPException(400, "area_id required for weather_event")
        r = sim_svc.simulate_weather_event(req.area_id, req.event or "severe")
    else:
        raise HTTPException(400, "type must be 'asset_failure' or 'weather_event'")
    if isinstance(r, dict) and r.get("error"):
        raise HTTPException(404, r["error"])
    return r


@app.post("/api/copilot/query")
def copilot_query(req: CopilotRequest):
    _require_seeded()
    if not req.query or not req.query.strip():
        raise HTTPException(400, "query is required")
    return copilot_svc.answer(req.query.strip())


@app.get("/api/brief")
def brief():
    _require_seeded()
    return brief_svc.generate_brief()


@app.get("/api/brief/text", response_class=PlainTextResponse)
def brief_text():
    _require_seeded()
    return ops_svc.brief_text()


# ---------------------------------------------------------------------------
# Operator actions — every one mutates real state and is audit-logged
# ---------------------------------------------------------------------------
def _ok_or_409(result):
    if isinstance(result, dict) and result.get("error"):
        raise HTTPException(409, result["error"])
    return result


@app.post("/api/work-orders/dispatch")
def wo_dispatch(req: DispatchRequest):
    _require_seeded()
    return _ok_or_409(ops_svc.dispatch_crew(req.asset_id, req.crew_id))


@app.post("/api/work-orders/schedule")
def wo_schedule(req: ScheduleRequest):
    _require_seeded()
    return _ok_or_409(ops_svc.schedule_job(req.asset_id, req.hours))


@app.post("/api/work-orders/defer")
def wo_defer(req: DeferRequest):
    _require_seeded()
    return _ok_or_409(ops_svc.defer_job(req.asset_id, req.reason))


@app.get("/api/work-orders")
def wo_list(limit: int = 100, status: Optional[str] = None, asset_id: Optional[str] = None):
    return ops_svc.list_work_orders(limit=limit, status=status, asset_id=asset_id)


@app.post("/api/crews/reposition")
def crew_reposition(req: RepositionRequest):
    _require_seeded()
    return _ok_or_409(ops_svc.reposition_crew(req.crew_id, req.area_id))


@app.post("/api/crews/{crew_id}/release")
def crew_release(crew_id: str):
    return _ok_or_409(ops_svc.release_crew(crew_id))


@app.post("/api/dispatch/emergency")
def emergency_dispatch(limit: int = 5):
    _require_seeded()
    return ops_svc.emergency_dispatch(limit=limit)


@app.post("/api/alerts/{alert_id}/ack")
def alert_ack(alert_id: str):
    return _ok_or_409(ops_svc.acknowledge_alert(alert_id))


@app.get("/api/audit")
def audit_log(limit: int = 50):
    return ops_svc.operations_log(limit=limit)


@app.get("/api/system/stats")
def system_stats():
    return ops_svc.system_stats()


@app.get("/api/export/{kind}")
def export(kind: str):
    _require_seeded()
    filename, body = ops_svc.export_csv(kind)
    if not filename:
        raise HTTPException(404, f"Unknown export '{kind}'. "
                                 f"Valid: {', '.join(ops_svc.EXPORTS)}")
    return Response(content=body, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ---------------------------------------------------------------------------
# 404s
# ---------------------------------------------------------------------------
# The Next.js app (src/frontend-next) serves the UI and generates its own
# robots.txt / sitemap.xml / 404 page. FastAPI is API-only, so anything that is
# not an /api route is simply not found here.
@app.exception_handler(404)
def not_found(request, exc):
    return JSONResponse({"detail": "Not found"}, status_code=404)
