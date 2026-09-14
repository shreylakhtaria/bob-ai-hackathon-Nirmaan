"""Auto-generated operator briefing from live application data."""
from datetime import datetime

from .. import config, db
from . import crew as crew_svc


def _overall_risk(critical, high_areas, weather_zones):
    if critical >= 5 or weather_zones >= 2:
        return "HIGH"
    if critical >= 1 or high_areas >= 1:
        return "ELEVATED"
    return "NORMAL"


def generate_brief():
    now = db.get_meta("now")
    critical_assets = db.query(
        """SELECT p.asset_id, a.asset_type, a.geographic_area area,
                  p.failure_probability, p.grid_impact_score, p.recommended_action,
                  a.customers_served
           FROM predictions p JOIN assets a ON a.asset_id=p.asset_id
           WHERE p.priority='CRITICAL' ORDER BY p.grid_impact_score DESC""")
    high_assets = db.query("SELECT COUNT(*) c FROM predictions WHERE priority='HIGH'")[0]["c"]
    areas = db.query("SELECT * FROM area_risk ORDER BY outage_probability DESC")
    high_areas = [a for a in areas if a["risk_level"] in ("HIGH", "CRITICAL")]
    weather_zones = [a for a in areas if a["weather_risk"] >= 50]

    crew = crew_svc.recommend_crews()
    total_at_risk_customers = sum(c["customers_served"] for c in critical_assets)

    # immediate actions (deduped, ordered)
    actions = []
    for c in critical_assets[:3]:
        actions.append(f"{c['recommended_action']} on {c['asset_id']} ({c['area']}, "
                       f"{c['customers_served']:,} customers)")
    for rec in crew["recommendations"][:2]:
        actions.append(f"Pre-position {rec['crew_id']} to {rec['recommended_area']} "
                       f"(-{rec['response_reduction_min']:.0f} min response)")
    for z in weather_zones[:1]:
        actions.append(f"Increase monitoring of {z['area_id']} ahead of the weather window")

    # primary risk driver
    driver = "Nominal grid conditions."
    if critical_assets and weather_zones:
        driver = (f"Severe weather in {weather_zones[0]['area_id']} combined with elevated "
                  f"equipment degradation on {critical_assets[0]['asset_id']}.")
    elif critical_assets:
        top = critical_assets[0]
        driver = f"Equipment degradation on {top['asset_id']} in {top['area']}."
    elif weather_zones:
        driver = f"Severe weather approaching {weather_zones[0]['area_id']}."

    overall = _overall_risk(len(critical_assets), len(high_areas), len(weather_zones))

    return {
        "as_of": now,
        "overall_grid_risk": overall,
        "critical_assets": len(critical_assets),
        "high_risk_assets": high_assets,
        "high_risk_areas": len(high_areas),
        "weather_exposed_zones": len(weather_zones),
        "customers_at_risk": total_at_risk_customers,
        "recommended_immediate_actions": actions,
        "major_risk_driver": driver,
        "top_critical_assets": [
            {"asset_id": c["asset_id"], "type": c["asset_type"], "area": c["area"],
             "failure_probability": c["failure_probability"],
             "grid_impact_score": c["grid_impact_score"],
             "customers_served": c["customers_served"]} for c in critical_assets[:5]],
        "crew_recommendations": crew["recommendations"][:3],
        "horizon_hours": config.PREDICTION_HORIZON_HOURS,
        "is_simulation": True,
    }
