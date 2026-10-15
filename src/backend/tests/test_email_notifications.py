"""
Direct Email Notification Tests.
"""
import uuid
import pytest
from fastapi.testclient import TestClient

from backend import config, db
from backend.main import app
from backend.services import auth as auth_svc, email_notifications as email_notif

config.RATE_LIMIT_ENABLED = False
if hasattr(app.state, "limiter"):
    app.state.limiter.enabled = False

client = TestClient(app)


def _mk_user(role="operator"):
    email = f"emailtest-{uuid.uuid4().hex[:10]}@example.com"
    password = "password123"
    auth_svc.signup(f"Email Test {role}", email, password)
    if role != config.DEFAULT_ROLE:
        with db.session() as conn:
            conn.execute("UPDATE users SET role=? WHERE email=?", (role, email))
    return email, password


def _login(email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200
    return r.json()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def operator_token():
    email, pw = _mk_user("operator")
    return _login(email, pw)["access_token"]


def test_notification_status_returns_email_channel(operator_token):
    r = client.get("/api/notifications/status", headers=_auth(operator_token))
    assert r.status_code == 200
    data = r.json()
    assert data["channel"] == "email"
    assert data["email"]["enabled"] is True
    assert "deliveries" in data


def test_send_test_email(operator_token):
    r = client.post("/api/notifications/test", headers=_auth(operator_token))
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["delivery"]["status"] == "SENT"
    assert "email" in data["delivery"]["channel"]


def test_send_briefing_email(operator_token):
    r = client.post("/api/notifications/briefing/send", headers=_auth(operator_token))
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["delivery"]["status"] == "SENT"


def test_send_alert_email(operator_token):
    # Insert a dummy alert
    alert_id = f"AL-{uuid.uuid4().hex[:8]}"
    with db.session() as conn:
        conn.execute(
            """INSERT INTO alerts(alert_id, created_at, priority, asset_id, area_id, title, reason, recommended_action)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?)""",
            (alert_id, "2026-10-14T12:00:00Z", "CRITICAL", "T-1024", "EAST-03", "Test Alert", "Failure risk", "Inspect immediately"),
        )

    r = client.post(f"/api/notifications/send-alert/{alert_id}", headers=_auth(operator_token))
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["delivery"]["status"] == "SENT"
    assert data["delivery"]["subject"] is not None
    assert "HTML" in (data["delivery"]["rendered_html"] or "").upper() or "<" in (data["delivery"]["rendered_html"] or "")


def test_send_test_email_with_custom_recipient(operator_token):
    custom_email = "operator.test@gridrisk.internal"
    r = client.post("/api/notifications/test", json={"recipient": custom_email}, headers=_auth(operator_token))
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["delivery"]["destination"] == custom_email
    assert data["delivery"]["delivery_mode"] in ("direct_dispatch", "smtp")
    assert data["delivery"]["rendered_html"] is not None

