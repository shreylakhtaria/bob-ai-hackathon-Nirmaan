"""
Crew pre-positioning optimiser.

Framed as an assignment/optimisation problem (not text generation):
  * Identify high-impact assets needing attention (top by grid impact score).
  * Cluster demand by area, weighting each area by summed impact + weather.
  * Greedy min-cost assignment of AVAILABLE crews to the highest-priority
    demand areas, cost = travel time (haversine / speed) with a skill-match
    bonus. Reports response-time reduction vs the crew's current position.

Greedy is used for transparency and speed; the scoring is explicit so an
OR-Tools / LP swap is a drop-in if desired (documented in README).
"""
import math
from datetime import datetime

from .. import config, db


def _haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _travel_min(lat1, lon1, lat2, lon2):
    km = _haversine(lat1, lon1, lat2, lon2)
    return km / config.CREW_SPEED_KMPH * 60.0


SKILL_FOR_TYPE = {
    "Transformer": "Transformer", "Switchgear": "Switchgear",
    "CircuitBreaker": "Switchgear", "Substation": "HighVoltage", "Feeder": "Feeder",
}


def _demand_areas():
    """Return list of {area_id, lat, lon, weight, high_assets, top_asset,...}."""
    rows = db.query(
        """SELECT a.geographic_area area, a.latitude lat, a.longitude lon,
                  p.asset_id, p.grid_impact_score gis, p.priority, a.asset_type type,
                  p.weather_risk wr
           FROM predictions p JOIN assets a ON a.asset_id=p.asset_id
           WHERE p.priority IN ('HIGH','CRITICAL')""")
    by_area = {}
    for r in rows:
        d = by_area.setdefault(r["area"], {
            "area_id": r["area"], "lats": [], "lons": [], "weight": 0.0,
            "high_assets": 0, "top_asset": None, "top_gis": -1, "weather_risk": r["wr"],
            "skills": {}})
        d["lats"].append(r["lat"]); d["lons"].append(r["lon"])
        d["weight"] += r["gis"]
        d["high_assets"] += 1
        skill = SKILL_FOR_TYPE.get(r["type"], "General")
        d["skills"][skill] = d["skills"].get(skill, 0) + r["gis"]
        if r["gis"] > d["top_gis"]:
            d["top_gis"] = r["gis"]; d["top_asset"] = r["asset_id"]
    for d in by_area.values():
        d["lat"] = sum(d["lats"]) / len(d["lats"])
        d["lon"] = sum(d["lons"]) / len(d["lons"])
        d["req_skill"] = max(d["skills"], key=d["skills"].get)
        del d["lats"], d["lons"], d["skills"]
    return sorted(by_area.values(), key=lambda x: -x["weight"])


def recommend_crews():
    crews = db.query("SELECT * FROM crews")
    available = [c for c in crews if c["availability"] == "AVAILABLE"]
    demand = _demand_areas()

    recs = []
    used = set()
    for area in demand:
        # candidate available crews, prefer skill match then travel time
        cand = []
        for c in available:
            if c["crew_id"] in used:
                continue
            tmin = _travel_min(c["latitude"], c["longitude"], area["lat"], area["lon"])
            # strong preference for exact skill match; General is a soft fallback
            if c["skill_type"] == area["req_skill"]:
                skill_bonus = 0
            elif c["skill_type"] == "General":
                skill_bonus = 12
            else:
                skill_bonus = 30
            cand.append((tmin + skill_bonus, tmin, c))
        if not cand:
            continue
        cand.sort(key=lambda x: x[0])
        cost, tmin, crew = cand[0]
        used.add(crew["crew_id"])
        current_resp = _travel_min(crew["latitude"], crew["longitude"], area["lat"], area["lon"]) \
            + crew["base_response_min"]
        # after repositioning, crew is on-site: response ~ base only
        new_resp = crew["base_response_min"]
        recs.append({
            "crew_id": crew["crew_id"], "current_area": crew["current_area"],
            "recommended_area": area["area_id"], "req_skill": area["req_skill"],
            "crew_skill": crew["skill_type"],
            "high_risk_assets": area["high_assets"], "top_asset": area["top_asset"],
            "weather_risk": area["weather_risk"],
            "current_response_min": round(current_resp, 1),
            "projected_response_min": round(new_resp, 1),
            "response_reduction_min": round(current_resp - new_resp, 1),
            "travel_min": round(tmin, 1),
            "rationale": (f"{area['high_assets']} high-risk assets near {area['area_id']} "
                          f"(top {area['top_asset']}); weather risk "
                          f"{area['weather_risk']:.0f}. Repositioning {crew['crew_id']} cuts "
                          f"response from {current_resp:.0f} to {new_resp:.0f} min."),
        })
    db.audit("crew_optimizer", "recommend_crews", {"recommendations": len(recs)})
    return {"available_crews": len(available), "demand_areas": len(demand),
            "recommendations": recs, "crews": crews}
