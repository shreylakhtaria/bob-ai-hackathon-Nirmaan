"""
Grid Risk Command Center - FastAPI application.

Serves the REST API under /api and the operator dashboard (static SPA) at /.
Run:  uvicorn backend.main:app --reload --port 8000
"""
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from . import config, db
from .services import (impact as impact_svc, crew as crew_svc, simulation as sim_svc,
                       briefing as brief_svc, copilot as copilot_svc, maintenance as maint_svc)

app = FastAPI(title=config.API_TITLE, version=config.API_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])


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


# ---------------------------------------------------------------------------
# Static frontend (mounted last so it doesn't shadow /api)
# ---------------------------------------------------------------------------
if config.FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(config.FRONTEND_DIR), html=True), name="frontend")


@app.exception_handler(404)
def spa_fallback(request, exc):
    # let API 404s be JSON; serve index for unknown non-api paths
    if request.url.path.startswith("/api"):
        return JSONResponse({"detail": "Not found"}, status_code=404)
    index = config.FRONTEND_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse({"detail": "Not found"}, status_code=404)
