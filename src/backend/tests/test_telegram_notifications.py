"""
Telegram notification tests.

No test here touches the real Telegram API: every provider call is intercepted
at the httpx boundary, so the suite runs offline, deterministically, and without
credentials. What is exercised is the part that actually goes wrong in
production — retry classification, delivery-status truthfulness, deduplication,
and the guarantee that the bot token never escapes config.

Run:  pytest backend/tests/test_telegram_notifications.py -q
"""
from __future__ import annotations

import uuid

import httpx
import pytest
from fastapi.testclient import TestClient

from backend import config, db
from backend.main import app
from backend.services import auth as auth_svc
from backend.services import telegram_notifications as telegram

config.RATE_LIMIT_ENABLED = False
if hasattr(app.state, "limiter"):
    app.state.limiter.enabled = False

client = TestClient(app)

FAKE_TOKEN = "123456789:FAKE-TEST-TOKEN-DO-NOT-USE"
FAKE_CHAT = "987654321"


# ---------------------------------------------------------------------------
# Harness
# ---------------------------------------------------------------------------
class FakeResponse:
    """Minimal stand-in for httpx.Response covering what the service reads."""

    def __init__(self, status_code=200, payload=None, headers=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.headers = headers or {}
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError("no json body")
        return self._payload


def ok_response(message_id=4321):
    return FakeResponse(200, {"ok": True, "result": {"message_id": message_id}})


class FakeTransport:
    """Records calls and replays a scripted sequence of responses/exceptions."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, url, json=None, **_kwargs):
        self.calls.append({"url": url, "payload": json})
        item = self.responses.pop(0) if self.responses else ok_response()
        if isinstance(item, Exception):
            raise item
        return item


@pytest.fixture
def transport(monkeypatch):
    """Patch the single HTTP call site and make retries instant."""
    fake = FakeTransport()

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, url, json=None, **kwargs):
            return fake(url, json=json, **kwargs)

    monkeypatch.setattr(httpx, "Client", FakeClient)
    monkeypatch.setattr(telegram.time, "sleep", lambda *_: None)
    return fake


@pytest.fixture
def enabled(monkeypatch):
    """Telegram fully configured, with a token that is obviously not real."""
    monkeypatch.setattr(config, "TELEGRAM_ENABLED", True)
    monkeypatch.setattr(config, "TELEGRAM_BOT_TOKEN", FAKE_TOKEN)
    monkeypatch.setattr(config, "TELEGRAM_DEFAULT_CHAT_ID", FAKE_CHAT)
    monkeypatch.setattr(config, "TELEGRAM_MAX_RETRIES", 3)
    monkeypatch.setattr(config, "TELEGRAM_RETRY_BASE_SECONDS", 0)
    monkeypatch.setattr(config, "TELEGRAM_NOTIFY_PRIORITIES", ("CRITICAL", "HIGH"))
    monkeypatch.setattr(config, "TELEGRAM_DEDUP_WINDOW_MINUTES", 30)
    return config


def make_alert(priority="CRITICAL", asset_id="T-1024", area_id="NORTH-04") -> dict:
    """A real alert row, inserted so the endpoints can find it."""
    alert = {
        "alert_id": f"AL-{uuid.uuid4().hex[:8]}",
        "created_at": db.get_meta("now") or "2026-09-18T18:30:00+00:00",
        "priority": priority,
        "asset_id": asset_id,
        "area_id": area_id,
        "title": f"{asset_id} predicted failure",
        "reason": "Partial discharge rising over 72h.",
        "recommended_action": "Immediate detailed inspection.",
    }
    with db.session() as conn:
        conn.execute(
            """INSERT INTO alerts(alert_id,created_at,priority,asset_id,area_id,
               title,reason,recommended_action)
               VALUES(:alert_id,:created_at,:priority,:asset_id,:area_id,
               :title,:reason,:recommended_action)""", alert)
    return alert


def _token(role="operator"):
    email = f"tg-{uuid.uuid4().hex[:10]}@example.com"
    auth_svc.signup(f"TG {role}", email, "password123")
    if role != config.DEFAULT_ROLE:
        with db.session() as conn:
            conn.execute("UPDATE users SET role=? WHERE email=?", (role, email))
    r = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tokens():
    return {r: _token(r) for r in ("admin", "operator", "crew")}


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(autouse=True)
def isolate_deliveries():
    """Each test starts with an empty delivery table.

    Deduplication is keyed on content and persists in the shared demo database,
    so without this a send in one test silently suppresses an unrelated send in
    the next and the suite passes or fails depending on collection order. The
    dedup behaviour itself is asserted explicitly by the dedup tests, which
    perform both sends themselves.
    """
    with db.session() as conn:
        conn.execute("DELETE FROM notification_deliveries")
    yield
    with db.session() as conn:
        conn.execute("DELETE FROM notification_deliveries")


# ---------------------------------------------------------------------------
# Configuration gating
# ---------------------------------------------------------------------------
def test_disabled_records_disabled_and_sends_nothing(monkeypatch, transport):
    monkeypatch.setattr(config, "TELEGRAM_ENABLED", False)
    row = telegram.send_alert(make_alert())
    assert row["status"] == telegram.DISABLED
    assert transport.calls == [], "a disabled channel must not contact the provider"


def test_missing_bot_token_is_misconfigured_not_sent(monkeypatch, transport):
    monkeypatch.setattr(config, "TELEGRAM_ENABLED", True)
    monkeypatch.setattr(config, "TELEGRAM_BOT_TOKEN", "")
    monkeypatch.setattr(config, "TELEGRAM_DEFAULT_CHAT_ID", FAKE_CHAT)
    row = telegram.send_alert(make_alert())
    assert row["status"] == telegram.FAILED
    assert "TELEGRAM_BOT_TOKEN" in row["error_message"]
    assert transport.calls == []


def test_missing_chat_id_is_misconfigured_not_sent(monkeypatch, transport):
    monkeypatch.setattr(config, "TELEGRAM_ENABLED", True)
    monkeypatch.setattr(config, "TELEGRAM_BOT_TOKEN", FAKE_TOKEN)
    monkeypatch.setattr(config, "TELEGRAM_DEFAULT_CHAT_ID", "")
    row = telegram.send_alert(make_alert())
    assert row["status"] == telegram.FAILED
    assert "TELEGRAM_DEFAULT_CHAT_ID" in row["error_message"]
    assert transport.calls == []


# ---------------------------------------------------------------------------
# Successful delivery
# ---------------------------------------------------------------------------
def test_successful_send_persists_sent_with_message_id(enabled, transport):
    transport.responses = [ok_response(999)]
    row = telegram.send_alert(make_alert())

    assert row["status"] == telegram.SENT
    assert row["provider_message_id"] == "999"
    assert row["provider_response_code"] == 200
    assert row["sent_at"], "a SENT delivery must record when it was sent"
    assert row["error_message"] is None
    assert row["attempt_count"] == 1
    assert len(transport.calls) == 1

    payload = transport.calls[0]["payload"]
    assert payload["chat_id"] == FAKE_CHAT
    assert payload["disable_web_page_preview"] is True
    assert payload["parse_mode"] == config.TELEGRAM_PARSE_MODE


def test_message_contains_real_alert_data(enabled, transport):
    alert = make_alert(asset_id="T-1024", area_id="NORTH-04")
    transport.responses = [ok_response()]
    telegram.send_alert(alert, force=True)
    text = transport.calls[0]["payload"]["text"]
    assert "T-1024" in text and "NORTH-04" in text
    assert alert["alert_id"] in text, "the alert id is the traceability anchor"
    assert "None" not in text and "nan" not in text.lower()


# ---------------------------------------------------------------------------
# Provider error classification
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("status,description", [
    (400, "Bad Request: chat not found"),
    (401, "Unauthorized"),
    (403, "Forbidden: bot was blocked by the user"),
])
def test_permanent_errors_fail_without_retrying(enabled, transport, status, description):
    """Retrying a bad token or a blocked bot just burns time — it fails forever."""
    transport.responses = [FakeResponse(status, {"ok": False, "description": description})] * 5
    row = telegram.send_alert(make_alert(), force=True)

    assert row["status"] == telegram.FAILED
    assert row["provider_response_code"] == status
    assert len(transport.calls) == 1, f"HTTP {status} must not be retried"
    assert row["sent_at"] is None
    assert row["provider_message_id"] is None


def test_rate_limit_respects_retry_after_then_succeeds(enabled, transport):
    transport.responses = [
        FakeResponse(429, {"ok": False, "description": "Too Many Requests",
                           "parameters": {"retry_after": 1}}),
        ok_response(555),
    ]
    row = telegram.send_alert(make_alert(), force=True)
    assert row["status"] == telegram.SENT
    assert row["provider_message_id"] == "555"
    assert len(transport.calls) == 2
    assert row["attempt_count"] == 2


def test_server_error_then_success(enabled, transport):
    transport.responses = [FakeResponse(500, {"ok": False, "description": "Internal"}),
                           ok_response(777)]
    row = telegram.send_alert(make_alert(), force=True)
    assert row["status"] == telegram.SENT
    assert len(transport.calls) == 2


def test_timeout_then_success(enabled, transport):
    transport.responses = [httpx.ReadTimeout("timed out"), ok_response(888)]
    row = telegram.send_alert(make_alert(), force=True)
    assert row["status"] == telegram.SENT
    assert len(transport.calls) == 2


def test_retries_are_bounded(enabled, transport, monkeypatch):
    """The loop must terminate. An unbounded retry would wedge the worker."""
    monkeypatch.setattr(config, "TELEGRAM_MAX_RETRIES", 3)
    transport.responses = [FakeResponse(503, {"ok": False, "description": "down"})] * 20
    row = telegram.send_alert(make_alert(), force=True)

    assert row["status"] == telegram.FAILED
    assert len(transport.calls) == 3, "must stop at TELEGRAM_MAX_RETRIES"
    assert row["attempt_count"] == 3
    assert row["error_message"], "a FAILED delivery must say why"


def test_http_200_with_ok_false_is_a_failure_not_a_success(enabled, transport):
    """Telegram signals content errors with 200 + ok:false. Trusting the status
    code alone would record a send that never reached anyone."""
    transport.responses = [FakeResponse(200, {"ok": False, "description": "chat not found"})]
    row = telegram.send_alert(make_alert(), force=True)
    assert row["status"] == telegram.FAILED
    assert row["provider_message_id"] is None
    assert row["sent_at"] is None


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------
def test_duplicate_within_window_is_skipped(enabled, transport):
    alert = make_alert(asset_id="T-DEDUP", area_id="NORTH-04")
    transport.responses = [ok_response(), ok_response()]

    first = telegram.send_alert(alert)
    second = telegram.send_alert(alert)

    assert first["status"] == telegram.SENT
    assert second["status"] == telegram.SKIPPED
    assert len(transport.calls) == 1, "the duplicate must not reach the provider"


def test_dedup_survives_alert_id_changing(enabled, transport):
    """generate_alerts() recreates every alert with a new uuid, so the key has
    to be content-based or each pipeline run would re-notify everything."""
    transport.responses = [ok_response(), ok_response()]
    first = telegram.send_alert(make_alert(asset_id="T-SAME", area_id="EAST-03"))
    # Same condition, different alert_id — exactly what a re-run produces.
    second = telegram.send_alert(make_alert(asset_id="T-SAME", area_id="EAST-03"))

    assert first["status"] == telegram.SENT
    assert second["status"] == telegram.SKIPPED
    assert first["alert_id"] != second["alert_id"]


def test_force_bypasses_deduplication(enabled, transport):
    alert = make_alert(asset_id="T-FORCE", area_id="WEST-05")
    transport.responses = [ok_response(), ok_response()]
    telegram.send_alert(alert)
    forced = telegram.send_alert(alert, force=True)
    assert forced["status"] == telegram.SENT
    assert len(transport.calls) == 2


# ---------------------------------------------------------------------------
# Priority filtering
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("priority,expected", [
    ("CRITICAL", telegram.SENT),
    ("HIGH", telegram.SENT),
    ("MEDIUM", telegram.SKIPPED),
    ("LOW", telegram.SKIPPED),
])
def test_only_configured_priorities_are_pushed(enabled, transport, priority, expected):
    transport.responses = [ok_response()]
    row = telegram.send_alert(make_alert(priority=priority, asset_id=f"T-{priority}"),
                              force=True)
    assert row["status"] == expected


def test_bulk_notify_ignores_low_priority(enabled, transport):
    transport.responses = [ok_response()] * 10
    result = telegram.notify_alerts([
        {"alert_id": "AL-1", "priority": "CRITICAL", "asset_id": "T-B1", "area_id": "NORTH-04"},
        {"alert_id": "AL-2", "priority": "MEDIUM", "asset_id": "T-B2", "area_id": "NORTH-04"},
        {"alert_id": "AL-3", "priority": "LOW", "asset_id": "T-B3", "area_id": "NORTH-04"},
    ])
    assert result["attempted"] == 1


# ---------------------------------------------------------------------------
# Content safety
# ---------------------------------------------------------------------------
def test_dynamic_values_are_html_escaped(enabled, transport):
    """An unescaped `<` makes Telegram reject the whole message with 400."""
    alert = make_alert(asset_id="T-<script>alert('x')</script>")
    transport.responses = [ok_response()]
    telegram.send_alert(alert, force=True)
    text = transport.calls[0]["payload"]["text"]
    assert "<script>" not in text
    assert "&lt;script&gt;" in text


def test_long_messages_are_truncated_below_the_provider_limit(enabled, transport):
    alert = make_alert()
    alert["reason"] = "x" * 20000
    transport.responses = [ok_response()]
    telegram.send_alert(alert, force=True)
    text = transport.calls[0]["payload"]["text"]
    assert len(text) <= config.TELEGRAM_MAX_MESSAGE_CHARS
    assert "truncated" in text


def test_missing_fields_are_omitted_not_rendered_as_none(enabled, transport):
    """A field with no value anywhere must vanish, not print "None".

    The asset id is deliberately one with no `assets`/`predictions` row, so the
    documented fallback to the prediction's recommended_action has nothing to
    find either — otherwise this would pass on real data rather than on the
    omission logic.
    """
    alert = make_alert(asset_id="T-NO-SUCH-ASSET")
    alert["reason"] = None
    alert["recommended_action"] = None
    transport.responses = [ok_response()]
    telegram.send_alert(alert, force=True)
    text = transport.calls[0]["payload"]["text"]

    assert "None" not in text
    assert "nan" not in text.lower()
    assert "Recommended Action" not in text
    assert "Customers Served" not in text, "no asset row means no customer count"
    # What is known is still present.
    assert "T-NO-SUCH-ASSET" in text
    assert alert["alert_id"] in text


# ---------------------------------------------------------------------------
# Secret hygiene
# ---------------------------------------------------------------------------
def test_token_is_redacted_from_provider_errors(enabled, transport):
    """Telegram echoes the request URL — which embeds the token — in some error
    bodies. That must never reach the database."""
    leaky = f"Error calling https://api.telegram.org/bot{FAKE_TOKEN}/sendMessage"
    transport.responses = [FakeResponse(400, {"ok": False, "description": leaky})]
    row = telegram.send_alert(make_alert(), force=True)

    assert FAKE_TOKEN not in (row["error_message"] or "")
    assert "REDACTED" in row["error_message"]


def test_token_never_enters_the_database(enabled, transport):
    transport.responses = [ok_response()]
    telegram.send_alert(make_alert(), force=True)
    secret_half = FAKE_TOKEN.split(":", 1)[1]
    with db.session() as conn:
        for (name,) in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'").fetchall():
            dumped = str(conn.execute(f"SELECT * FROM {name}").fetchall())
            assert FAKE_TOKEN not in dumped, f"token leaked into {name}"
            assert secret_half not in dumped, f"token secret leaked into {name}"


def test_destination_is_stored_masked(enabled, transport):
    transport.responses = [ok_response()]
    row = telegram.send_alert(make_alert(), force=True)
    assert row["destination_reference"] != FAKE_CHAT
    assert row["destination_reference"].startswith("***")
    assert FAKE_CHAT[-4:] in row["destination_reference"]


def test_status_endpoint_exposes_no_secret(enabled, tokens):
    body = client.get("/api/notifications/status", headers=_h(tokens["operator"])).json()
    dumped = str(body)
    assert FAKE_TOKEN not in dumped
    assert FAKE_TOKEN.split(":", 1)[1] not in dumped
    assert FAKE_CHAT not in dumped
    assert body["telegram"]["enabled"] is True
    assert body["telegram"]["configured"] is True


def test_no_secret_in_any_delivery_response(enabled, transport, tokens):
    transport.responses = [ok_response()]
    telegram.send_alert(make_alert(), force=True)
    body = client.get("/api/notifications/deliveries?limit=20",
                      headers=_h(tokens["operator"])).json()
    dumped = str(body)
    assert FAKE_TOKEN not in dumped and FAKE_CHAT not in dumped


# ---------------------------------------------------------------------------
# API surface
# ---------------------------------------------------------------------------
def test_status_requires_authentication():
    assert client.get("/api/notifications/status").status_code == 401


def test_crew_cannot_send(enabled, tokens):
    alert = make_alert()
    r = client.post(f"/api/notifications/telegram/send-alert/{alert['alert_id']}",
                    json={"force": True}, headers=_h(tokens["crew"]))
    assert r.status_code == 403


def test_sending_an_unknown_alert_is_404(enabled, transport, tokens):
    r = client.post("/api/notifications/telegram/send-alert/AL-DOESNOTEXIST",
                    json={"force": True}, headers=_h(tokens["operator"]))
    assert r.status_code == 404


def test_test_endpoint_rejects_disabled_channel(monkeypatch, tokens):
    monkeypatch.setattr(config, "TELEGRAM_ENABLED", False)
    r = client.post("/api/notifications/telegram/test", headers=_h(tokens["operator"]))
    assert r.status_code == 409
    assert "disabled" in r.json()["error"]["message"].lower()


def test_test_endpoint_sends_when_configured(enabled, transport, tokens):
    transport.responses = [ok_response(1234)]
    r = client.post("/api/notifications/telegram/test", headers=_h(tokens["operator"]))
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["delivery"]["status"] == telegram.SENT
    assert body["delivery"]["provider_message_id"] == "1234"


def test_send_alert_endpoint_end_to_end(enabled, transport, tokens):
    alert = make_alert(asset_id="T-E2E")
    transport.responses = [ok_response(2468)]
    r = client.post(f"/api/notifications/telegram/send-alert/{alert['alert_id']}",
                    json={"force": True}, headers=_h(tokens["operator"]))
    assert r.status_code == 200
    delivery = r.json()["delivery"]
    assert delivery["status"] == telegram.SENT
    assert delivery["alert_id"] == alert["alert_id"]

    detail = client.get(f"/api/notifications/deliveries/{delivery['delivery_id']}",
                        headers=_h(tokens["operator"]))
    assert detail.status_code == 200
    assert detail.json()["provider_message_id"] == "2468"


def test_delivery_filters(enabled, transport, tokens):
    transport.responses = [ok_response()]
    telegram.send_alert(make_alert(asset_id="T-FILTER"), force=True)
    r = client.get("/api/notifications/deliveries?status=SENT&limit=5",
                   headers=_h(tokens["operator"]))
    assert r.status_code == 200
    assert all(d["status"] == "SENT" for d in r.json()["deliveries"])

    bad = client.get("/api/notifications/deliveries?status=NOPE",
                     headers=_h(tokens["operator"]))
    assert bad.status_code == 422


# ---------------------------------------------------------------------------
# Retry
# ---------------------------------------------------------------------------
def test_failed_delivery_can_be_retried_to_sent(enabled, transport, tokens):
    alert = make_alert(asset_id="T-RETRY")
    transport.responses = [FakeResponse(503, {"ok": False, "description": "down"})] * 3
    failed = telegram.send_alert(alert, force=True)
    assert failed["status"] == telegram.FAILED

    transport.responses = [ok_response(31337)]
    r = client.post(f"/api/notifications/deliveries/{failed['delivery_id']}/retry",
                    headers=_h(tokens["operator"]))
    assert r.status_code == 200
    delivery = r.json()["delivery"]
    assert delivery["status"] == telegram.SENT
    assert delivery["provider_message_id"] == "31337"
    assert delivery["attempt_count"] > failed["attempt_count"], "attempts accumulate"
    assert delivery["sent_at"]


def test_retrying_a_sent_delivery_does_not_resend(enabled, transport, tokens):
    transport.responses = [ok_response()]
    sent = telegram.send_alert(make_alert(asset_id="T-NORESEND"), force=True)
    before = len(transport.calls)

    r = client.post(f"/api/notifications/deliveries/{sent['delivery_id']}/retry",
                    headers=_h(tokens["operator"]))
    assert r.status_code == 200
    assert len(transport.calls) == before, "a SENT delivery must not be re-sent"


def test_retrying_unknown_delivery_is_404(enabled, tokens):
    r = client.post("/api/notifications/deliveries/ND-NOPE/retry",
                    headers=_h(tokens["operator"]))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Pipeline integration
# ---------------------------------------------------------------------------
def test_alert_generation_survives_telegram_failure(enabled, transport, monkeypatch):
    """The alert pipeline must not depend on an external service being up."""
    def explode(*_a, **_k):
        raise RuntimeError("telegram is on fire")

    monkeypatch.setattr(telegram, "send_message", explode)
    transport.responses = [ok_response()]

    from backend.services import alerts as alerts_svc
    result = alerts_svc.generate_alerts()

    assert result["alerts"] > 0, "alerts must still be generated"
    assert db.query_one("SELECT COUNT(*) c FROM alerts")["c"] == result["alerts"]


def test_alert_generation_can_skip_notification(enabled, transport):
    from backend.services import alerts as alerts_svc
    result = alerts_svc.generate_alerts(notify=False)
    assert result["alerts"] > 0
    assert "notifications" not in result
    assert transport.calls == []


# ---------------------------------------------------------------------------
# Simulation integration
# ---------------------------------------------------------------------------
def _seeded():
    return bool(db.query_one("SELECT 1 FROM assets LIMIT 1"))


@pytest.mark.skipif(not _seeded(), reason="run python -m scripts.seed first")
def test_simulation_is_backward_compatible(enabled, transport, tokens):
    """An existing client body with no notify_telegram must behave as before."""
    asset = db.query_one("SELECT asset_id FROM assets LIMIT 1")
    r = client.post("/api/simulation",
                    json={"type": "asset_failure", "asset_id": asset["asset_id"]},
                    headers=_h(tokens["operator"]))
    assert r.status_code == 200
    assert "notification" not in r.json()
    assert transport.calls == [], "a simulation must not notify unless asked"


@pytest.mark.skipif(not _seeded(), reason="run python -m scripts.seed first")
def test_simulation_notifies_only_when_requested(enabled, transport, tokens):
    asset = db.query_one("SELECT asset_id FROM assets LIMIT 1")
    transport.responses = [ok_response(5150)]
    r = client.post("/api/simulation",
                    json={"type": "asset_failure", "asset_id": asset["asset_id"],
                          "notify_telegram": True},
                    headers=_h(tokens["operator"]))
    assert r.status_code == 200
    body = r.json()
    # The simulation result itself is untouched.
    assert body["scenario"] == "asset_failure"
    assert body["notification"]["status"] == telegram.SENT
    assert len(transport.calls) == 1


# ---------------------------------------------------------------------------
# Data consistency invariants
# ---------------------------------------------------------------------------
def test_delivery_status_invariants_hold(enabled, transport):
    """Every row in the table must be internally consistent."""
    transport.responses = [ok_response(), FakeResponse(400, {"ok": False, "description": "bad"})]
    telegram.send_alert(make_alert(asset_id="T-INV1"), force=True)
    telegram.send_alert(make_alert(asset_id="T-INV2"), force=True)

    for row in db.query("SELECT * FROM notification_deliveries"):
        if row["status"] == telegram.SENT:
            assert row["sent_at"], f"{row['delivery_id']}: SENT without sent_at"
            assert row["provider_message_id"], f"{row['delivery_id']}: SENT without message id"
            assert row["error_message"] is None
        if row["status"] == telegram.FAILED:
            assert row["error_message"], f"{row['delivery_id']}: FAILED without a reason"
            assert row["sent_at"] is None, f"{row['delivery_id']}: FAILED but has sent_at"
            assert row["provider_message_id"] is None
        assert row["status"] in {telegram.PENDING, telegram.SENDING, telegram.SENT,
                                 telegram.FAILED, telegram.SKIPPED, telegram.DISABLED}
        assert isinstance(row["error_message"], (str, type(None))), \
            "error_message must stay a string (db.rows_to_dicts parses JSON-ish text)"


def test_error_message_starting_with_brace_stays_a_string(enabled, transport):
    """db.rows_to_dicts() json-decodes any stored value starting with { or [."""
    transport.responses = [FakeResponse(400, {"ok": False, "description": '{"raw": "body"}'})]
    row = telegram.send_alert(make_alert(asset_id="T-JSONERR"), force=True)
    assert isinstance(row["error_message"], str)
    reread = telegram.get_delivery(row["delivery_id"])
    assert isinstance(reread["error_message"], str)
