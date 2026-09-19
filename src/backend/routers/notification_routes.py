"""
Outbound notification routes (Telegram).

Endpoints
---------
GET  /api/notifications/status                       — channel + config health
POST /api/notifications/telegram/test                — send a test message
POST /api/notifications/telegram/send-alert/{id}     — send/resend one alert
POST /api/notifications/deliveries/{id}/retry        — retry a FAILED delivery
GET  /api/notifications/deliveries                   — delivery history
GET  /api/notifications/deliveries/{id}              — one delivery
POST /api/notifications/briefing/send                — push the operations brief

Security notes:

* Nothing here returns the bot token. `/status` reports only whether it is
  present, via `config.telegram_config_status()`.
* Sends are `require_operator`; history is readable by any signed-in user. A
  notification costs money/attention and reaches a phone, so it is not a
  crew-level action.
* There is deliberately no "send arbitrary text" endpoint. Every message is
  rendered by the service from stored rows, so the API cannot be used to push
  attacker-chosen content through the organisation's bot.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from .. import db
from ..deps import require_any_role, require_operator
from ..services import briefing as brief_svc
from ..services import telegram_notifications as telegram

router = APIRouter()

_VALID_STATUS = {"PENDING", "SENDING", "SENT", "FAILED", "SKIPPED", "DISABLED"}


class SendAlertRequest(BaseModel):
    # Deduplication is the default; an operator can override it deliberately.
    force: bool = False


def _delivery_response(row: dict) -> dict:
    """Shape a delivery row for the API.

    Explicit field list rather than `dict(row)`: it keeps the response stable if
    the table gains an internal column, and guarantees nothing sensitive is
    added to the payload by accident later.
    """
    return {
        "delivery_id": row.get("delivery_id"),
        "alert_id": row.get("alert_id"),
        "channel": row.get("channel"),
        "destination": row.get("destination_reference"),   # masked at write time
        "priority": row.get("priority"),
        "status": row.get("status"),
        "attempt_count": row.get("attempt_count"),
        "provider_message_id": row.get("provider_message_id"),
        "provider_response_code": row.get("provider_response_code"),
        "error_message": row.get("error_message"),
        "kind": row.get("notification_kind"),
        "summary": row.get("payload_summary"),
        "created_at": row.get("created_at"),
        "last_attempt_at": row.get("last_attempt_at"),
        "sent_at": row.get("sent_at"),
    }


@router.get("/status")
def notification_status(current=Depends(require_any_role)):
    """Channel health for the dashboard indicator. Contains no secret."""
    status = telegram.config_status()
    recent = db.query_one(
        "SELECT COUNT(*) total, "
        "SUM(CASE WHEN status='SENT' THEN 1 ELSE 0 END) sent, "
        "SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) failed "
        "FROM notification_deliveries WHERE channel=?", (telegram.CHANNEL,)) or {}
    return {
        "channels": {"telegram": status},
        "telegram": status,
        "deliveries": {
            "total": recent.get("total") or 0,
            "sent": recent.get("sent") or 0,
            "failed": recent.get("failed") or 0,
        },
    }


@router.post("/telegram/test")
def telegram_test(current=Depends(require_operator)):
    """Send a test message so an operator can verify their setup end to end."""
    status = telegram.config_status()
    if not status["enabled"]:
        raise HTTPException(
            409, "Telegram notifications are disabled. Set TELEGRAM_ENABLED=true and restart.")
    if not status["configured"]:
        raise HTTPException(
            409, f"Telegram is misconfigured: missing {', '.join(status['missing'])}.")

    row = telegram.test_connection()
    db.audit(current.get("email", "operator"), "telegram_test",
             {"delivery_id": row.get("delivery_id"), "status": row.get("status")})
    return {"success": row.get("status") == telegram.SENT, "delivery": _delivery_response(row)}


@router.post("/telegram/send-alert/{alert_id}")
def telegram_send_alert(alert_id: str, req: Optional[SendAlertRequest] = None,
                        current=Depends(require_operator)):
    """Send or resend one stored alert. 404 if the alert does not exist."""
    force = bool(req.force) if req else False
    row = telegram.send_alert_by_id(alert_id, force=force)
    if row is None:
        raise HTTPException(404, f"Alert {alert_id} not found")

    db.audit(current.get("email", "operator"), "telegram_send_alert",
             {"alert_id": alert_id, "delivery_id": row.get("delivery_id"),
              "status": row.get("status"), "force": force})
    return {"success": row.get("status") == telegram.SENT,
            "delivery": _delivery_response(row)}


@router.post("/deliveries/{delivery_id}/retry")
def retry_delivery(delivery_id: str, current=Depends(require_operator)):
    """Retry a FAILED delivery. A SENT one is returned untouched, not re-sent."""
    row = telegram.retry_failed_delivery(delivery_id)
    if row is None:
        raise HTTPException(404, f"Delivery {delivery_id} not found")
    if row.get("status") == telegram.SENT and row.get("sent_at"):
        db.audit(current.get("email", "operator"), "telegram_retry",
                 {"delivery_id": delivery_id, "status": row.get("status")})
    return {"success": row.get("status") == telegram.SENT,
            "delivery": _delivery_response(row)}


@router.get("/deliveries")
def deliveries(status: Optional[str] = None, channel: Optional[str] = None,
               priority: Optional[str] = None, alert_id: Optional[str] = None,
               limit: int = Query(50, ge=1, le=500),
               current=Depends(require_any_role)):
    if status and status.upper() not in _VALID_STATUS:
        raise HTTPException(422, f"status must be one of: {', '.join(sorted(_VALID_STATUS))}")
    rows = telegram.list_deliveries(
        status=status.upper() if status else None,
        channel=channel, priority=priority.upper() if priority else None,
        alert_id=alert_id, limit=limit)
    return {"count": len(rows), "deliveries": [_delivery_response(r) for r in rows]}


@router.get("/deliveries/{delivery_id}")
def delivery_detail(delivery_id: str, current=Depends(require_any_role)):
    row = telegram.get_delivery(delivery_id)
    if not row:
        raise HTTPException(404, f"Delivery {delivery_id} not found")
    return _delivery_response(row)


@router.post("/briefing/send")
def send_briefing(current=Depends(require_operator)):
    """Push the current operations briefing to Telegram."""
    status = telegram.config_status()
    if not status["enabled"]:
        raise HTTPException(409, "Telegram notifications are disabled.")
    if not status["configured"]:
        raise HTTPException(
            409, f"Telegram is misconfigured: missing {', '.join(status['missing'])}.")

    brief = brief_svc.generate_brief()
    row = telegram.send_briefing(brief)
    db.audit(current.get("email", "operator"), "telegram_send_briefing",
             {"delivery_id": row.get("delivery_id"), "status": row.get("status")})
    return {"success": row.get("status") == telegram.SENT,
            "delivery": _delivery_response(row)}
