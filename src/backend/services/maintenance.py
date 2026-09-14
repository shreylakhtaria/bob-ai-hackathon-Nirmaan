"""Predictive-maintenance prioritisation queue with filters."""
from .. import db


def _due_window(priority):
    return {"CRITICAL": "0-24h", "HIGH": "24-72h", "MEDIUM": "3-7 days",
            "LOW": "routine"}.get(priority, "routine")


def priority_queue(area=None, asset_type=None, min_prob=0.0, priority=None,
                   min_customers=0, limit=100):
    sql = """SELECT p.asset_id, a.asset_type, a.geographic_area area,
                    p.failure_probability, p.grid_impact_score, p.weather_risk,
                    p.priority, p.risk_level, p.predicted_failure_window,
                    p.recommended_action, a.customers_served, a.criticality_score,
                    p.confidence
             FROM predictions p JOIN assets a ON a.asset_id=p.asset_id
             WHERE p.failure_probability >= ? AND a.customers_served >= ?"""
    params = [min_prob, min_customers]
    if area:
        sql += " AND a.geographic_area=?"; params.append(area)
    if asset_type:
        sql += " AND a.asset_type=?"; params.append(asset_type)
    if priority:
        sql += " AND p.priority=?"; params.append(priority)
    sql += " ORDER BY p.grid_impact_score DESC, p.failure_probability DESC LIMIT ?"
    params.append(limit)
    rows = db.query(sql, tuple(params))

    # attach crew suggestion (nearest available, computed lazily for the top items)
    for i, r in enumerate(rows):
        r["rank"] = i + 1
        r["due_window"] = _due_window(r["priority"])
    return rows
