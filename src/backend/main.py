"""
Grid Risk Command Center - FastAPI application.

Serves the JSON REST API under /api. The operator UI is a separate Next.js app
(src/frontend-next) which proxies /api/* here.
Run:  uvicorn backend.main:app --reload --port 8000
"""
from typing import Optional

from fastapi import (Depends, FastAPI, File, HTTPException, Query, Request,
                     Response as FastAPIResponse, UploadFile)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from pydantic import BaseModel, Field

from . import config, db, errors
from .deps import require_admin, require_any_role, require_operator
from .services import (impact as impact_svc, crew as crew_svc, simulation as sim_svc,
                       briefing as brief_svc, copilot as copilot_svc, maintenance as maint_svc,
                       operations as ops_svc, auth as auth_svc, ingest as ingest_svc,
                       resolution as resolution_svc, risk as risk_svc,
                       mcp as mcp_svc, jira as jira_svc)
from .routers.ingest import router as ingest_router

app = FastAPI(title=config.API_TITLE, version=config.API_VERSION)

# Explicit origins, and credentials allowed so the refresh cookie can be set.
# A wildcard is invalid with credentials and would expose a cookie-authed API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", config.CSRF_HEADER_NAME],
)

app.include_router(ingest_router, prefix="/api/ingest", tags=["ingest"])

errors.register(app)

# Rate limiting, applied only to credential endpoints — the rest of the app is
# internal traffic and limiting it would just break the dashboard's polling.
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.util import get_remote_address

    limiter = Limiter(key_func=get_remote_address, enabled=config.RATE_LIMIT_ENABLED)
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def _rate_limited(request: Request, exc: RateLimitExceeded):
        return errors.error_response(429, "Too many attempts. Please wait and try again.")
except ImportError:  # slowapi not installed — run unlimited rather than crash
    limiter = None

    class _NoLimit:
        def limit(self, *_a, **_k):
            return lambda f: f
    limiter = _NoLimit()


def _auth_response(user: dict, response: FastAPIResponse) -> dict:
    """Issue an access token in the body and the refresh + CSRF pair as cookies."""
    csrf = auth_svc.issue_csrf_token()
    auth_svc.set_auth_cookies(response, auth_svc.issue_refresh_token(user), csrf)
    return {"access_token": auth_svc.issue_access_token(user),
            "token_type": "bearer",
            "expires_in": config.ACCESS_TOKEN_TTL_MINUTES * 60,
            "csrf_token": csrf,
            "user": auth_svc.public_user(user)}


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


class McpCallRequest(BaseModel):
    tool: str = Field(max_length=64)
    arguments: dict = Field(default_factory=dict)
    # Required for mutating tools; issued by /api/mcp/confirm.
    confirmation_token: Optional[str] = Field(default=None, max_length=64)


class CompleteWorkOrderRequest(BaseModel):
    action_taken: Optional[str] = Field(default=None, max_length=500)
    parts_replaced: Optional[str] = Field(default=None, max_length=300)
    notes: Optional[str] = Field(default=None, max_length=1000)
    # Constrained rather than free text so the maintenance record stays queryable.
    result: str = Field(default="COMPLETED", pattern="^(COMPLETED|PARTIAL|NO_FAULT_FOUND)$")
    # Proof-of-work fields (optional — can also be set via /work-orders/{id}/proof)
    proof_attachments: Optional[list] = None
    technician_signature: Optional[str] = Field(default=None, max_length=200)
    field_status: str = Field(default="COMPLETED")


class WorkOrderStatusRequest(BaseModel):
    field_status: str  # DISPATCHED | EN_ROUTE | ON_SITE | RESOLVING | COMPLETED


class ProofOfWorkRequest(BaseModel):
    attachments: list  # [{name, type, size, url_or_data, uploaded_at}]


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


@app.get("/api/public/stats")
def public_stats():
    """Deliberately unauthenticated: headline figures for the public landing page.

    Aggregates only — no asset ids, locations, crews, alerts or per-record data.
    Everything here is already implied by the product description, so it reveals
    nothing an anonymous visitor shouldn't see, and it keeps the landing page on
    live numbers instead of hardcoded marketing figures.
    """
    if not db.query_one("SELECT 1 FROM assets LIMIT 1"):
        return {"seeded": False, "is_simulation": config.IS_SIMULATION}
    totals = db.query_one(
        """SELECT COUNT(*) assets,
                  SUM(CASE WHEN p.priority IN ('CRITICAL','HIGH') THEN 1 ELSE 0 END) at_risk,
                  SUM(a.customers_served) customers
           FROM assets a LEFT JOIN predictions p ON p.asset_id = a.asset_id""") or {}
    metrics = db.get_meta("model_metrics", {}) or {}
    return {
        "seeded": True,
        "is_simulation": config.IS_SIMULATION,
        "assets_monitored": totals.get("assets") or 0,
        "assets_at_risk": totals.get("at_risk") or 0,
        "customers_protected": totals.get("customers") or 0,
        "areas_monitored": len(config.GEO_AREAS),
        "model": metrics.get("model"),
        "roc_auc": metrics.get("roc_auc"),
        "prediction_horizon_hours": config.PREDICTION_HORIZON_HOURS,
        "as_of": db.get_meta("now"),
    }


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@app.post("/api/auth/signup")
@limiter.limit(config.RATE_LIMIT_SIGNUP)
def auth_signup(request: Request, req: SignupRequest, response: FastAPIResponse):
    user = auth_svc.signup(req.display_name, req.email, req.password)
    return _auth_response(user, response)


@app.post("/api/auth/login")
@limiter.limit(config.RATE_LIMIT_LOGIN)
def auth_login(request: Request, req: LoginRequest, response: FastAPIResponse):
    user = auth_svc.login(req.email, req.password)
    return _auth_response(user, response)


@app.post("/api/auth/refresh")
@limiter.limit(config.RATE_LIMIT_REFRESH)
def auth_refresh(request: Request, response: FastAPIResponse):
    """Exchange the refresh cookie for a fresh access token, rotating the cookie.

    CSRF-checked: this endpoint authenticates from a cookie, so without the
    double-submit check any site could silently mint tokens for a logged-in user.
    """
    auth_svc.verify_csrf(request)
    token = request.cookies.get(config.REFRESH_COOKIE_NAME)
    if not token:
        raise HTTPException(401, "No refresh token")
    user, new_refresh = auth_svc.rotate_refresh_token(token)
    csrf = auth_svc.issue_csrf_token()
    auth_svc.set_auth_cookies(response, new_refresh, csrf)
    return {"access_token": auth_svc.issue_access_token(user),
            "token_type": "bearer",
            "expires_in": config.ACCESS_TOKEN_TTL_MINUTES * 60,
            "csrf_token": csrf,
            "user": auth_svc.public_user(user)}


@app.post("/api/auth/logout")
def auth_logout(request: Request, response: FastAPIResponse):
    """Revoke the refresh token server-side and clear both cookies."""
    auth_svc.verify_csrf(request)
    token = request.cookies.get(config.REFRESH_COOKIE_NAME)
    if token:
        try:
            payload = auth_svc._decode(token, "refresh")
            auth_svc.revoke_refresh_token(payload["jti"])
        except HTTPException:
            pass  # already invalid: clearing the cookies is still the right outcome
    auth_svc.clear_auth_cookies(response)
    return {"success": True}


@app.post("/api/auth/logout-all")
def auth_logout_all(request: Request, response: FastAPIResponse,
                    current=Depends(require_any_role)):
    """Revoke every session for the caller (e.g. after a suspected compromise)."""
    auth_svc.verify_csrf(request)
    revoked = auth_svc.revoke_all_for_user(current["id"])
    auth_svc.clear_auth_cookies(response)
    db.audit(current["email"], "LOGOUT_ALL", {"sessions_revoked": revoked})
    return {"success": True, "sessions_revoked": revoked}


@app.get("/api/auth/me")
def auth_me(current=Depends(require_any_role)):
    return current


@app.get("/api/model/metrics")
def model_metrics(current=Depends(require_any_role)):
    return db.get_meta("model_metrics", {})


# ---------------------------------------------------------------------------
# Dashboard summary
# ---------------------------------------------------------------------------
@app.get("/api/dashboard/summary")
def dashboard_summary(current=Depends(require_any_role)):
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
                priority: Optional[str] = None, limit: int = 500, current=Depends(require_any_role)):
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
def asset_detail(asset_id: str, current=Depends(require_any_role)):
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
def asset_risk(asset_id: str, current=Depends(require_any_role)):
    p = db.query_one("SELECT * FROM predictions WHERE asset_id=?", (asset_id,))
    if not p:
        raise HTTPException(404, f"No prediction for {asset_id}")
    return p


@app.get("/api/assets/{asset_id}/sensors")
def asset_sensors(asset_id: str, hours: int = Query(168, le=1000), current=Depends(require_any_role)):
    rows = db.query("SELECT * FROM sensor_data WHERE asset_id=? ORDER BY timestamp DESC LIMIT ?",
                    (asset_id, hours))
    return list(reversed(rows))


@app.get("/api/assets/{asset_id}/history")
def asset_history(asset_id: str, current=Depends(require_any_role)):
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
def risks(limit: int = 500, current=Depends(require_any_role)):
    return db.query(
        """SELECT p.*, a.asset_type, a.geographic_area area, a.customers_served
           FROM predictions p JOIN assets a ON a.asset_id=p.asset_id
           ORDER BY p.grid_impact_score DESC LIMIT ?""", (limit,))


@app.get("/api/risks/critical")
def critical_risks(current=Depends(require_any_role)):
    return db.query(
        """SELECT p.*, a.asset_type, a.geographic_area area, a.customers_served
           FROM predictions p JOIN assets a ON a.asset_id=p.asset_id
           WHERE p.priority IN ('CRITICAL','HIGH') ORDER BY p.grid_impact_score DESC""")


@app.get("/api/areas/risk")
def areas_risk(current=Depends(require_any_role)):
    return db.query("SELECT * FROM area_risk ORDER BY outage_probability DESC")


@app.get("/api/weather")
def weather(area: Optional[str] = None, current=Depends(require_any_role)):
    wx = impact_svc.area_weather_risk()
    if area:
        return wx.get(area) or {}
    return wx


@app.get("/api/weather/series")
def weather_series(area: str, hours: int = 96, current=Depends(require_any_role)):
    return db.query(
        """SELECT * FROM weather_data WHERE geographic_area=?
           ORDER BY timestamp DESC LIMIT ?""", (area, hours))


@app.get("/api/incidents")
def incidents(limit: int = 200, current=Depends(require_any_role)):
    return db.query(
        """SELECT i.*, a.asset_type, a.geographic_area area FROM incidents i
           JOIN assets a ON a.asset_id=i.asset_id ORDER BY i.incident_timestamp DESC LIMIT ?""",
        (limit,))


@app.get("/api/alerts")
def alerts(current=Depends(require_any_role)):
    return db.query("SELECT * FROM alerts ORDER BY "
                    "CASE priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END, created_at DESC")


# ---------------------------------------------------------------------------
# Maintenance / crews
# ---------------------------------------------------------------------------
@app.get("/api/maintenance/priorities")
def maintenance_priorities(area: Optional[str] = None, asset_type: Optional[str] = None,
                           priority: Optional[str] = None, min_prob: float = 0.0,
                           min_customers: int = 0, limit: int = 100, current=Depends(require_any_role)):
    _require_seeded()
    return maint_svc.priority_queue(area=area, asset_type=asset_type, priority=priority,
                                    min_prob=min_prob, min_customers=min_customers, limit=limit)


@app.get("/api/crews")
def crews(current=Depends(require_any_role)):
    return db.query("SELECT * FROM crews")


@app.get("/api/crews/recommendations")
def crew_recommendations(current=Depends(require_any_role)):
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
def map_data(current=Depends(require_any_role)):
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
def run_simulation(req: SimulationRequest, current=Depends(require_operator)):
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
def copilot_query(req: CopilotRequest, current=Depends(require_any_role)):
    _require_seeded()
    if not req.query or not req.query.strip():
        raise HTTPException(400, "query is required")
    return copilot_svc.answer(req.query.strip())


@app.get("/api/brief")
def brief(current=Depends(require_any_role)):
    _require_seeded()
    return brief_svc.generate_brief()


@app.get("/api/brief/text", response_class=PlainTextResponse)
def brief_text(current=Depends(require_any_role)):
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
def wo_dispatch(req: DispatchRequest, current=Depends(require_operator)):
    _require_seeded()
    return _ok_or_409(ops_svc.dispatch_crew(req.asset_id, req.crew_id))


@app.post("/api/work-orders/schedule")
def wo_schedule(req: ScheduleRequest, current=Depends(require_operator)):
    _require_seeded()
    return _ok_or_409(ops_svc.schedule_job(req.asset_id, req.hours))


@app.post("/api/work-orders/defer")
def wo_defer(req: DeferRequest, current=Depends(require_operator)):
    _require_seeded()
    return _ok_or_409(ops_svc.defer_job(req.asset_id, req.reason))


@app.get("/api/work-orders")
def wo_list(limit: int = 100, status: Optional[str] = None, asset_id: Optional[str] = None, current=Depends(require_any_role)):
    return ops_svc.list_work_orders(limit=limit, status=status, asset_id=asset_id)


@app.post("/api/crews/reposition")
def crew_reposition(req: RepositionRequest, current=Depends(require_operator)):
    _require_seeded()
    return _ok_or_409(ops_svc.reposition_crew(req.crew_id, req.area_id))


@app.post("/api/crews/{crew_id}/release")
def crew_release(crew_id: str, current=Depends(require_operator)):
    """Complete whatever the crew is on and free it. Runs the full resolution
    loop — maintenance history, asset stamp, risk recalculation — so the map
    reflects the repair rather than just showing the crew as available."""
    return _ok_or_409(ops_svc.release_crew(crew_id, current))


@app.post("/api/dispatch/emergency")
def emergency_dispatch(limit: int = 5, current=Depends(require_operator)):
    _require_seeded()
    return ops_svc.emergency_dispatch(limit=limit)


@app.post("/api/alerts/{alert_id}/ack")
def alert_ack(alert_id: str, current=Depends(require_operator)):
    return _ok_or_409(ops_svc.acknowledge_alert(alert_id))


@app.get("/api/audit")
def audit_log(limit: int = 50, current=Depends(require_operator)):
    """Runs Log. Operators see operational actions; admins additionally see
    authentication events, which are not theirs to read."""
    return ops_svc.operations_log(limit=limit, include_security=current["role"] == "admin")


@app.get("/api/system/stats")
def system_stats(current=Depends(require_any_role)):
    return ops_svc.system_stats()


@app.get("/api/export/{kind}")
def export(kind: str, current=Depends(require_operator)):
    _require_seeded()
    filename, body = ops_svc.export_csv(kind)
    if not filename:
        raise HTTPException(404, f"Unknown export '{kind}'. "
                                 f"Valid: {', '.join(ops_svc.EXPORTS)}")
    return Response(content=body, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ---------------------------------------------------------------------------
# CSV bulk ingestion
# ---------------------------------------------------------------------------
async def _ingest(kind: str, file: UploadFile, actor: str, commit: bool):
    # Read one byte past the cap only: enough to detect an oversized upload
    # without ever buffering it. The client-supplied filename and content-type
    # are not trusted — decode() and the CSV parser decide what this file is.
    raw = await file.read(config.MAX_UPLOAD_BYTES + 1)
    try:
        return ingest_svc.run(kind, raw, actor, commit=commit)
    except ingest_svc.IngestError as exc:
        raise HTTPException(exc.status, exc.message)


@app.post("/api/ingest/{kind}/validate")
async def ingest_validate(kind: str, file: UploadFile = File(...),
                          current=Depends(require_operator)):
    """Dry run: full validation report, nothing written."""
    return await _ingest(kind, file, current["email"], commit=False)


@app.post("/api/ingest/{kind}/commit")
async def ingest_commit(kind: str, file: UploadFile = File(...),
                        current=Depends(require_operator)):
    """Import the valid rows (one transaction) and report every rejected row."""
    return await _ingest(kind, file, current["email"], commit=True)


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Resolution workflow (maintenance completion -> risk recalculation)
# ---------------------------------------------------------------------------
@app.post("/api/work-orders/{wo_id}/complete")
def wo_complete(wo_id: str, req: CompleteWorkOrderRequest,
                current=Depends(require_any_role)):
    """Close the loop: complete the work, record it, release the crew, re-derive risk.

    Open to crew as well as operators — the crew who did the job is the right
    person to report it done, and withholding that would push them to ask an
    operator to file it for them, which is worse provenance, not better.
    """
    _require_seeded()
    return resolution_svc.complete_work_order(
        wo_id, current,
        action_taken=req.action_taken, parts_replaced=req.parts_replaced,
        notes=req.notes, result=req.result,
        proof_attachments=req.proof_attachments,
        technician_signature=req.technician_signature,
        field_status=req.field_status)


@app.post("/api/work-orders/{wo_id}/status")
def wo_update_status(wo_id: str, req: WorkOrderStatusRequest,
                     current=Depends(require_any_role)):
    """Update the field-crew status for a work order and sync to Jira."""
    _require_seeded()
    resolution_svc.get_work_order(wo_id)   # raises 404 if missing
    result = jira_svc.sync_status(wo_id, req.field_status)
    db.audit(current.get("email", "system"), "wo_status_update",
             {"wo_id": wo_id, "field_status": req.field_status})
    return result


@app.post("/api/work-orders/{wo_id}/proof")
async def wo_upload_proof(wo_id: str, files: list[UploadFile] = File(default=[]),
                          current=Depends(require_any_role)):
    """Attach proof-of-work evidence files to a work order."""
    _require_seeded()
    resolution_svc.get_work_order(wo_id)   # 404 guard

    from datetime import datetime, timezone
    items = []
    for f in files:
        raw = await f.read()
        items.append({
            "name":        f.filename,
            "type":        f.content_type,
            "size":        len(raw),
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            # For demo: store as base64 data-URI (real deployments should S3/blob-store)
            "url_or_data": f"data:{f.content_type};base64,__binary_omitted__",
        })

    result = jira_svc.attach_proof(wo_id, items)
    db.audit(current.get("email", "system"), "wo_proof_upload",
             {"wo_id": wo_id, "files": [i["name"] for i in items]})
    return result


@app.post("/api/work-orders/{wo_id}/resolve")
def wo_resolve_with_proof(wo_id: str, req: CompleteWorkOrderRequest,
                           current=Depends(require_any_role)):
    """Full resolution with proof-of-work payload — alias for /complete with
    explicit proof fields, named to match the UI's field resolution flow."""
    _require_seeded()
    return resolution_svc.complete_work_order(
        wo_id, current,
        action_taken=req.action_taken, parts_replaced=req.parts_replaced,
        notes=req.notes, result=req.result,
        proof_attachments=req.proof_attachments,
        technician_signature=req.technician_signature,
        field_status=req.field_status)


# ---------------------------------------------------------------------------
# Jira / enterprise work management
# ---------------------------------------------------------------------------
@app.get("/api/jira/status")
def jira_status(current=Depends(require_any_role)):
    """Return Jira integration mode + connectivity probe."""
    return jira_svc.test_connection()


@app.get("/api/jira/tickets")
def jira_tickets(limit: int = Query(50, le=200),
                 current=Depends(require_any_role)):
    """List tracked enterprise tickets (real or simulated)."""
    return {"tickets": jira_svc.list_tickets(limit=limit),
            "mode": "real" if jira_svc.JIRA_ENABLED else "simulated"}


@app.post("/api/risk/recalculate")
def risk_recalculate(current=Depends(require_operator)):
    """Force a full re-derivation of asset and area risk.

    Operator/admin only: it rewrites every prediction row and takes several
    seconds, so it is not something to leave open to incidental callers.
    """
    _require_seeded()
    result = risk_svc.recalculate(reason=f"manual:{current['email']}")
    db.audit(current["email"], "risk_recalculate", result)
    return result


# ---------------------------------------------------------------------------
# MCP tool surface
# ---------------------------------------------------------------------------
@app.get("/api/mcp/tools")
def mcp_tools(current=Depends(require_any_role)):
    """Tools this caller is allowed to use — the model is never offered more."""
    return {"tools": mcp_svc.list_tools(current)}


@app.post("/api/mcp/confirm")
def mcp_confirm(req: McpCallRequest, current=Depends(require_any_role)):
    """Describe a mutating action and issue a single-use confirmation token.

    Nothing executes here. This is the step that keeps a person between the
    model's inference and a crew actually being dispatched.
    """
    return mcp_svc.prepare_confirmation(req.tool, req.arguments, current)


@app.post("/api/mcp/call")
def mcp_call(req: McpCallRequest, current=Depends(require_any_role)):
    """Execute an allowlisted tool. Mutating tools require a confirmation token."""
    _require_seeded()
    return mcp_svc.execute(req.tool, req.arguments, current, req.confirmation_token)


# 404s
# ---------------------------------------------------------------------------
# The Next.js app (src/frontend-next) serves the UI and generates its own
# robots.txt / sitemap.xml / 404 page. FastAPI is API-only, so anything that is
# not an /api route is simply not found here.
#
# No handler is registered for it: errors.register() already handles
# StarletteHTTPException, which covers 404, so a dedicated one here would
# override the standard envelope and emit a differently-shaped body.
