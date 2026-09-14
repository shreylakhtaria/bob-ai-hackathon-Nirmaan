"""
Grid Impact Score + area outage risk + alerts.

Grid Impact Score (0-100) is an INTERPRETABLE weighted blend, computed on top of
the ML failure probability. This encodes the core product thesis: a 20% asset
serving 100k customers can outrank a 60% asset serving 1k.

    GIS = 100 * ( w_f*failure + w_c*criticality + w_cu*customers
                  + w_n*network + w_w*weather )

All component sub-scores are normalised to 0-1 and are stored alongside the
score so the UI can show the breakdown.
"""
import json
from datetime import datetime, timedelta

import numpy as np

from .. import config, db


def _band(value, bands):
    for label, lo in sorted(bands.items(), key=lambda kv: -kv[1]):
        if value >= lo:
            return label
    return "LOW"


def _area_weather_risk():
    """area_id -> {risk, wind, rainfall, storm, ews} over now..now+24h."""
    now = datetime.fromisoformat(db.get_meta("now"))
    horizon = (now + timedelta(hours=24)).isoformat()
    rows = db.query(
        """SELECT geographic_area,
                  MAX(extreme_weather_score) ews, MAX(wind_speed) wind,
                  SUM(rainfall) rain, MAX(storm_indicator) storm,
                  MAX(lightning_indicator) lightning
           FROM weather_data
           WHERE timestamp > ? AND timestamp <= ?
           GROUP BY geographic_area""",
        (now.isoformat(), horizon))
    out = {}
    for r in rows:
        out[r["geographic_area"]] = {
            "weather_risk": round(r["ews"], 1), "wind_speed": round(r["wind"], 1),
            "rainfall": round(r["rain"], 1), "storm": int(r["storm"]),
            "lightning": int(r["lightning"]),
        }
    return out


def compute_impact():
    """Compute grid impact + priority for every scored asset; persist."""
    assets = {a["asset_id"]: a for a in db.query("SELECT * FROM assets")}
    preds = db.query("SELECT * FROM predictions")
    wx = _area_weather_risk()

    cust = np.array([assets[p["asset_id"]]["customers_served"] for p in preds], dtype=float)
    log_cust = np.log1p(cust)
    cust_norm = (log_cust - log_cust.min()) / (np.ptp(log_cust) or 1.0)
    down = np.array([assets[p["asset_id"]]["downstream_assets"] for p in preds], dtype=float)
    down_norm = (down - down.min()) / (np.ptp(down) or 1.0)

    w = config.IMPACT_WEIGHTS
    updates = []
    for i, p in enumerate(preds):
        a = assets[p["asset_id"]]
        area_wx = wx.get(a["geographic_area"], {"weather_risk": 10.0})
        comp = {
            "failure": round(float(p["failure_probability"]), 3),
            "criticality": round(a["criticality_score"] / 100.0, 3),
            "customers": round(float(cust_norm[i]), 3),
            "network": round(float(down_norm[i]), 3),
            "weather": round(area_wx["weather_risk"] / 100.0, 3),
        }
        gis = 100.0 * (w["failure"] * comp["failure"] + w["criticality"] * comp["criticality"]
                       + w["customers"] * comp["customers"] + w["network"] * comp["network"]
                       + w["weather"] * comp["weather"])
        gis = round(float(np.clip(gis, 0, 100)), 1)
        priority = _band(gis, config.IMPACT_BANDS)
        # priority never lower than the raw failure risk band if that is higher
        risk_rank = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
        if risk_rank[p["risk_level"]] > risk_rank[priority]:
            priority = p["risk_level"]
        updates.append({
            "asset_id": p["asset_id"], "grid_impact_score": gis,
            "impact_components": json.dumps(comp),
            "weather_risk": area_wx["weather_risk"], "priority": priority,
        })

    with db.session() as conn:
        for u in updates:
            conn.execute(
                """UPDATE predictions SET grid_impact_score=:grid_impact_score,
                   impact_components=:impact_components, weather_risk=:weather_risk,
                   priority=:priority WHERE asset_id=:asset_id""", u)
    return {"impact_scored": len(updates)}


def compute_area_risk():
    """Aggregate asset + weather + history into area-level outage risk."""
    now = db.get_meta("now")
    wx = _area_weather_risk()
    rows = db.query(
        """SELECT a.geographic_area area, p.asset_id, p.failure_probability fp,
                  p.risk_level, a.customers_served cust, a.criticality_score crit
           FROM predictions p JOIN assets a ON a.asset_id=p.asset_id""")
    # historical incident rate per area (last window)
    hist = {r["area"]: r["c"] for r in db.query(
        """SELECT a.geographic_area area, COUNT(*) c
           FROM incidents i JOIN assets a ON a.asset_id=i.asset_id
           GROUP BY a.geographic_area""")}

    by_area = {}
    for r in rows:
        by_area.setdefault(r["area"], []).append(r)

    out = []
    max_hist = max(hist.values()) if hist else 1
    for area, items in by_area.items():
        fps = np.array([x["fp"] for x in items])
        high = [x for x in items if x["risk_level"] in ("HIGH", "CRITICAL")]
        n_high = len(high)
        exp_cust = int(sum(x["cust"] for x in high))
        wr = wx.get(area, {"weather_risk": 10.0})["weather_risk"]
        hist_rate = hist.get(area, 0) / max_hist
        # blended outage probability
        top_fp = float(np.sort(fps)[-5:].mean()) if len(fps) >= 1 else 0.0
        outage = float(np.clip(
            0.45 * top_fp + 0.25 * (wr / 100.0)
            + 0.20 * min(n_high / 8.0, 1.0) + 0.10 * hist_rate, 0, 1))
        level = _band(outage, config.RISK_BANDS)
        factors = []
        if wr >= 50:
            factors.append(f"Severe weather (score {wr:.0f})")
        if n_high:
            factors.append(f"{n_high} high-risk assets")
        if top_fp >= 0.5:
            factors.append(f"Elevated equipment failure probability ({top_fp:.0%})")
        if hist_rate >= 0.6:
            factors.append("Above-average historical incident rate")
        if not factors:
            factors.append("Nominal conditions")
        out.append({
            "area_id": area, "as_of": now, "outage_probability": round(outage, 4),
            "risk_level": level, "expected_customers_affected": exp_cust,
            "weather_risk": wr, "high_risk_assets": n_high,
            "contributing_factors": json.dumps(factors),
        })

    with db.session() as conn:
        conn.execute("DELETE FROM area_risk")
        for o in out:
            conn.execute(
                """INSERT INTO area_risk(area_id,as_of,outage_probability,risk_level,
                   expected_customers_affected,weather_risk,high_risk_assets,contributing_factors)
                   VALUES(:area_id,:as_of,:outage_probability,:risk_level,
                   :expected_customers_affected,:weather_risk,:high_risk_assets,
                   :contributing_factors)""", o)
    return {"areas": len(out)}


def area_weather_risk():
    return _area_weather_risk()
