"""
Outbound notification routes (Direct Email).

Provides alert dispatch, test notification, operations brief delivery,
and delivery history inspection.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from .. import db, config
from ..deps import require_any_role, require_operator
from ..services import briefing as brief_svc
from ..services import email_notifications as email_notif

router = APIRouter()

_VALID_STATUS = {"PENDING", "SENDING", "SENT", "FAILED", "SKIPPED", "DISABLED"}


class SendAlertRequest(BaseModel):
    # Deduplication is the default; an operator can override it deliberately.
    force: bool = False


class TestNotificationRequest(BaseModel):
    recipient: Optional[str] = None


def _delivery_response(row: dict) -> dict:
    """Shape a delivery row for the API."""
    return {
        "delivery_id": row.get("delivery_id"),
        "alert_id": row.get("alert_id"),
        "channel": row.get("channel") or "email",
        "destination": row.get("destination") or row.get("destination_reference"),
        "priority": row.get("priority"),
        "status": row.get("status"),
        "attempt_count": row.get("attempt_count"),
        "provider_message_id": row.get("provider_message_id"),
        "provider_response_code": row.get("provider_response_code"),
        "error_message": row.get("error_message"),
        "kind": row.get("kind") or row.get("notification_kind"),
        "summary": row.get("summary") or row.get("payload_summary"),
        "subject": row.get("subject"),
        "rendered_html": row.get("rendered_html"),
        "rendered_text": row.get("rendered_text"),
        "delivery_mode": row.get("delivery_mode") or ("smtp" if config.SMTP_HOST else "direct_dispatch"),
        "created_at": row.get("created_at"),
        "last_attempt_at": row.get("last_attempt_at"),
        "sent_at": row.get("sent_at"),
    }


@router.get("/status")
def notification_status(current=Depends(require_any_role)):
    """Channel health for the dashboard indicator."""
    status = email_notif.config_status()
    recent = db.query_one(
        "SELECT COUNT(*) total, "
        "SUM(CASE WHEN status='SENT' THEN 1 ELSE 0 END) sent, "
        "SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) failed "
        "FROM notification_deliveries", ()
    ) or {}
    deliveries_summary = {
        "total": recent.get("total") or 0,
        "sent": recent.get("sent") or 0,
        "failed": recent.get("failed") or 0,
    }
    return {
        "channel": "email",
        "email": status,
        "telegram": status,  # Backward compatibility for existing UI components
        "channels": {
            "email": status,
            "telegram": status,
        },
        "deliveries": deliveries_summary,
    }


@router.post("/test")
@router.post("/email/test")
@router.post("/telegram/test")
def send_test_notification(req: Optional[TestNotificationRequest] = None, current=Depends(require_operator)):
    """Send test email to verified operators and dispatchers or a specific recipient."""
    recipient = req.recipient if req else None
    row = email_notif.test_connection(recipient=recipient)
    db.audit(current.get("email", "operator"), "email_test",
             {"delivery_id": row.get("delivery_id"), "status": row.get("status"), "recipient": recipient})
    return {"success": row.get("status") == email_notif.SENT, "delivery": _delivery_response(row)}


@router.post("/send-alert/{alert_id}")
@router.post("/email/send-alert/{alert_id}")
@router.post("/telegram/send-alert/{alert_id}")
def send_alert_notification(alert_id: str, req: Optional[SendAlertRequest] = None,
                            current=Depends(require_operator)):
    """Send or resend one stored alert via email. 404 if the alert does not exist."""
    force = req.force if req is not None else True
    alert = db.query_one("SELECT * FROM alerts WHERE alert_id = ?", (alert_id,))
    if not alert:
        raise HTTPException(404, f"Alert {alert_id} not found")

    row = email_notif.send_alert(alert, force=force)
    db.audit(current.get("email", "operator"), "email_send_alert",
             {"alert_id": alert_id, "delivery_id": row.get("delivery_id"),
              "status": row.get("status"), "force": force})
    return {"success": row.get("status") == email_notif.SENT,
            "delivery": _delivery_response(row)}


@router.post("/deliveries/{delivery_id}/retry")
def retry_delivery(delivery_id: str, current=Depends(require_operator)):
    """Retry a FAILED delivery."""
    row = email_notif.retry_failed_delivery(delivery_id)
    if row is None:
        raise HTTPException(404, f"Delivery {delivery_id} not found")
    if row.get("status") == email_notif.SENT and row.get("sent_at"):
        db.audit(current.get("email", "operator"), "email_retry",
                 {"delivery_id": delivery_id, "status": row.get("status")})
    return {"success": row.get("status") == email_notif.SENT,
            "delivery": _delivery_response(row)}


@router.get("/deliveries")
def deliveries(status: Optional[str] = None, channel: Optional[str] = None,
               priority: Optional[str] = None, alert_id: Optional[str] = None,
               limit: int = Query(50, ge=1, le=500),
               current=Depends(require_any_role)):
    if status and status.upper() not in _VALID_STATUS:
        raise HTTPException(422, f"status must be one of: {', '.join(sorted(_VALID_STATUS))}")
    rows = email_notif.list_deliveries(limit=limit, status=status.upper() if status else None)
    return {"count": len(rows), "deliveries": [_delivery_response(r) for r in rows]}


@router.get("/deliveries/{delivery_id}")
def delivery_detail(delivery_id: str, current=Depends(require_any_role)):
    row = email_notif.get_delivery(delivery_id)
    if not row:
        raise HTTPException(404, f"Delivery {delivery_id} not found")
    return _delivery_response(row)


@router.post("/briefing/send")
def send_briefing(current=Depends(require_operator)):
    """Push the current operations briefing via email."""
    brief = brief_svc.generate_brief()
    row = email_notif.send_briefing(brief, force=True)
    db.audit(current.get("email", "operator"), "email_send_briefing",
             {"delivery_id": row.get("delivery_id"), "status": row.get("status")})
    return {"success": row.get("status") == email_notif.SENT,
            "delivery": _delivery_response(row)}
