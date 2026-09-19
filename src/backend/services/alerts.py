"""Intelligent alert generation from model outputs + weather."""
import logging
import uuid
from datetime import datetime

from .. import config, db

log = logging.getLogger("grid.alerts")


def generate_alerts(notify: bool = True):
    """Rebuild the alert set from current model output, then push the urgent ones.

    `notify` exists so the seed pipeline and tests can rebuild alerts without
    sending anything. Notification is strictly a side effect: alerts are
    committed first and a Telegram outage can never roll them back.
    """
    now = db.get_meta("now")
    alerts = []

    # 1. Critical / high asset failure alerts
    preds = db.query(
        """SELECT p.*, a.geographic_area area, a.asset_type type, a.customers_served cust
           FROM predictions p JOIN assets a ON a.asset_id=p.asset_id
           WHERE p.risk_level IN ('CRITICAL','HIGH')
           ORDER BY p.grid_impact_score DESC""")
    for p in preds:
        pr = "CRITICAL" if p["risk_level"] == "CRITICAL" else "HIGH"
        alerts.append({
            "alert_id": f"AL-{uuid.uuid4().hex[:8]}", "created_at": now, "priority": pr,
            "asset_id": p["asset_id"], "area_id": p["area"],
            "title": f"{p['asset_id']} predicted failure {p['failure_probability']*100:.0f}%",
            "reason": f"{p['type']} in {p['area']} has a {p['failure_probability']*100:.0f}% "
                      f"failure probability within {config.PREDICTION_HORIZON_HOURS}h "
                      f"(impact score {p['grid_impact_score']:.0f}, "
                      f"{p['cust']:,} customers served).",
            "recommended_action": p["recommended_action"],
        })

    # 2. Weather-exposed area alerts
    areas = db.query("SELECT * FROM area_risk WHERE weather_risk >= 45 ORDER BY weather_risk DESC")
    for ar in areas:
        alerts.append({
            "alert_id": f"AL-{uuid.uuid4().hex[:8]}", "created_at": now,
            "priority": "HIGH" if ar["weather_risk"] >= 60 else "MEDIUM",
            "asset_id": None, "area_id": ar["area_id"],
            "title": f"Severe weather approaching {ar['area_id']}",
            "reason": f"Weather risk {ar['weather_risk']:.0f}/100 in {ar['area_id']} with "
                      f"{ar['high_risk_assets']} high-risk assets exposed.",
            "recommended_action": "Pre-position crews and inspect exposed assets before the window.",
        })

    # 3. Rising-trend (anomaly) medium alerts for non-high assets
    trend = db.query(
        """SELECT p.*, a.geographic_area area, a.asset_type type FROM predictions p
           JOIN assets a ON a.asset_id=p.asset_id
           WHERE p.risk_level='MEDIUM' AND p.anomaly_score >= 0.6
           ORDER BY p.anomaly_score DESC LIMIT 10""")
    for p in trend:
        alerts.append({
            "alert_id": f"AL-{uuid.uuid4().hex[:8]}", "created_at": now, "priority": "MEDIUM",
            "asset_id": p["asset_id"], "area_id": p["area"],
            "title": f"{p['asset_id']} anomalous sensor trend",
            "reason": f"{p['type']} shows an elevated anomaly score "
                      f"({p['anomaly_score']:.2f}); early degradation signature.",
            "recommended_action": p["recommended_action"],
        })

    with db.session() as conn:
        conn.execute("DELETE FROM alerts")
        for a in alerts:
            conn.execute(
                """INSERT INTO alerts(alert_id,created_at,priority,asset_id,area_id,
                   title,reason,recommended_action)
                   VALUES(:alert_id,:created_at,:priority,:asset_id,:area_id,
                   :title,:reason,:recommended_action)""", a)

    result = {"alerts": len(alerts)}

    # Alerts are durable at this point. Everything below is best-effort: the
    # notification layer already swallows its own errors, and this guard is the
    # backstop so an unexpected one still cannot fail alert generation.
    if notify:
        try:
            from . import telegram_notifications as telegram
            result["notifications"] = telegram.notify_alerts(alerts)
        except Exception as exc:
            log.warning("alert notification dispatch failed: %s", exc)
            result["notifications"] = {"error": str(exc)}

    return result
