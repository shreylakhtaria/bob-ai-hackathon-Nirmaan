"""
What-if simulation engine.

simulate_asset_failure(asset_id):
    Estimates blast radius using the network model (same-substation downstream
    assets), customer impact, severity, nearest-crew response, required skills
    and mitigation steps - all grounded in stored data, not free text.

simulate_weather_event(area_id, severity):
    Recomputes area outage risk and per-asset weather exposure under an injected
    extreme-weather score, returning the delta vs current.
"""
import math

from .. import config, db
from .crew import _travel_min, SKILL_FOR_TYPE


def simulate_asset_failure(asset_id):
    asset = db.query_one("SELECT * FROM assets WHERE asset_id=?", (asset_id,))
    if not asset:
        return {"error": f"Asset {asset_id} not found"}
    pred = db.query_one("SELECT * FROM predictions WHERE asset_id=?", (asset_id,))

    # downstream = other assets on the same substation (network proxy)
    downstream = db.query(
        """SELECT asset_id, asset_type, customers_served, geographic_area
           FROM assets WHERE substation_id=? AND asset_id<>?""",
        (asset["substation_id"], asset_id))
    # if it's a substation, everything it feeds in its area is affected more broadly
    direct_customers = asset["customers_served"]
    downstream_customers = sum(d["customers_served"] for d in downstream)
    # substations / high fan-out cascade to a fraction of downstream
    cascade_factor = 1.0 if asset["asset_type"] == "Substation" else 0.5
    total_customers = int(direct_customers + cascade_factor * downstream_customers)

    affected_areas = sorted({asset["geographic_area"]} | {d["geographic_area"] for d in downstream})

    # nearest available crew
    crews = db.query("SELECT * FROM crews WHERE availability='AVAILABLE'")
    req_skill = SKILL_FOR_TYPE.get(asset["asset_type"], "General")
    best = None
    for c in crews:
        tmin = _travel_min(c["latitude"], c["longitude"], asset["latitude"], asset["longitude"])
        penalty = 0 if c["skill_type"] in (req_skill, "General") else 15
        score = tmin + penalty
        if best is None or score < best[0]:
            best = (score, tmin, c)
    resp = None
    if best:
        resp = {"crew_id": best[2]["crew_id"], "response_min": round(best[1] + best[2]["base_response_min"], 1),
                "skill": best[2]["skill_type"]}

    # severity
    if total_customers > 30000:
        severity = "CRITICAL"
    elif total_customers > 10000:
        severity = "HIGH"
    elif total_customers > 2000:
        severity = "MEDIUM"
    else:
        severity = "LOW"

    # estimated outage duration from historical incidents of same type
    hist = db.query(
        """SELECT AVG(outage_duration) d, AVG(recovery_time) r FROM incidents
           WHERE asset_id IN (SELECT asset_id FROM assets WHERE asset_type=?)""",
        (asset["asset_type"],))
    avg_dur = round(hist[0]["d"] or 180.0, 0) if hist and hist[0]["d"] else 180.0

    mitigation = [
        f"Dispatch {req_skill.lower()}-skilled crew to {asset_id} immediately",
        "Reroute load via adjacent feeders to reduce customer impact",
        f"Notify {len(affected_areas)} affected area control desks",
    ]
    if pred and pred.get("recommended_action"):
        mitigation.insert(0, f"Pre-failure: {pred['recommended_action'].lower()}")

    result = {
        "scenario": "asset_failure", "asset_id": asset_id,
        "asset_type": asset["asset_type"], "area": asset["geographic_area"],
        "failure_probability": pred["failure_probability"] if pred else None,
        "grid_impact_score": pred["grid_impact_score"] if pred else None,
        "direct_customers": direct_customers,
        "downstream_customers": int(cascade_factor * downstream_customers),
        "total_customers_affected": total_customers,
        "affected_areas": affected_areas,
        "downstream_assets": [
            {"asset_id": d["asset_id"], "type": d["asset_type"],
             "customers": d["customers_served"]} for d in downstream],
        "severity": severity,
        "estimated_outage_minutes": avg_dur,
        "required_skill": req_skill,
        "nearest_crew": resp,
        "recommended_mitigation": mitigation,
        "is_simulation": True,
    }
    db.audit("simulator", "simulate_asset_failure",
             {"asset_id": asset_id, "customers": total_customers})
    return result


def simulate_weather_event(area_id, severity="severe"):
    """Inject an extreme-weather score and recompute area outage risk."""
    inject = {"mild": 40, "moderate": 65, "severe": 88, "extreme": 97}.get(severity, 88)
    baseline = db.query_one("SELECT * FROM area_risk WHERE area_id=?", (area_id,))
    if not baseline:
        return {"error": f"Area {area_id} not found"}

    # recompute outage probability with injected weather (same blend as impact.py)
    assets = db.query(
        """SELECT p.failure_probability fp, p.risk_level, a.customers_served cust
           FROM predictions p JOIN assets a ON a.asset_id=p.asset_id
           WHERE a.geographic_area=?""", (area_id,))
    import numpy as np
    fps = np.array([a["fp"] for a in assets]) if assets else np.array([0.0])
    high = [a for a in assets if a["risk_level"] in ("HIGH", "CRITICAL")]
    top_fp = float(np.sort(fps)[-5:].mean())
    n_high = len(high)
    new_outage = float(np.clip(
        0.45 * top_fp + 0.25 * (inject / 100.0) + 0.20 * min(n_high / 8.0, 1.0) + 0.10, 0, 1))

    from .impact import _band
    exposed = db.query(
        """SELECT p.asset_id, p.failure_probability fp, p.grid_impact_score gis, a.asset_type type
           FROM predictions p JOIN assets a ON a.asset_id=p.asset_id
           WHERE a.geographic_area=? ORDER BY p.grid_impact_score DESC LIMIT 10""", (area_id,))

    result = {
        "scenario": "weather_event", "area_id": area_id, "injected_severity": severity,
        "injected_weather_score": inject,
        "baseline_outage_probability": baseline["outage_probability"],
        "baseline_risk_level": baseline["risk_level"],
        "new_outage_probability": round(new_outage, 4),
        "new_risk_level": _band(new_outage, config.RISK_BANDS),
        "delta": round(new_outage - baseline["outage_probability"], 4),
        "high_risk_assets": n_high,
        "top_exposed_assets": exposed,
        "recommended_actions": [
            f"Pre-position crews in {area_id} before the weather window",
            "Inspect the top exposed assets listed",
            "Prepare mobile substation / load-transfer plan",
        ],
        "is_simulation": True,
    }
    db.audit("simulator", "simulate_weather_event", {"area_id": area_id, "severity": severity})
    return result
