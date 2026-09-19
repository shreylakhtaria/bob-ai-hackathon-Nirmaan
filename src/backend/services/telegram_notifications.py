"""
Telegram live alert notifications.

Design rules, in the order they matter:

1. **Never claim a send that did not happen.** Every attempt writes a row in
   `notification_deliveries` and the status reflects what the Telegram API
   actually returned. A transport failure is recorded as FAILED with the error;
   it is never smoothed into SENT.
2. **Never take the alert pipeline down.** `send_alert()` catches everything.
   Alerts are persisted first and notification is a side effect: if Telegram is
   down, the alert still exists and the dashboard still works.
3. **Never leak the bot token.** The token is a bearer credential for the whole
   bot. It lives in config only — it is not returned by any endpoint, not
   written to the database, not sent to the browser, and `_redact()` scrubs it
   out of any provider error text before that text is stored or logged.
4. **Do not notify the same condition twice.** `generate_alerts()` deletes and
   recreates every alert row with a fresh uuid on each run, so `alert_id` is
   useless for deduplication. The key is a hash of the *content* (kind, asset,
   area, priority), scoped to a time window.
5. **Retry only what is worth retrying.** A bad token or a blocked bot will
   fail identically forever; retrying those just delays the failure and burns
   rate limit. Only transient transport/server conditions are retried, with
   bounded exponential backoff and respect for Telegram's `retry_after`.

Synchronous on purpose: every route in this app is a sync `def`, which FastAPI
runs in a threadpool. An `async def` route doing blocking HTTP would stall the
event loop for every other request.
"""
from __future__ import annotations

import hashlib
import html
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional

import httpx

from .. import config, db

log = logging.getLogger("grid.telegram")

CHANNEL = "telegram"

# Delivery lifecycle.
PENDING, SENDING, SENT, FAILED, SKIPPED, DISABLED = (
    "PENDING", "SENDING", "SENT", "FAILED", "SKIPPED", "DISABLED")

# HTTP statuses worth another attempt. 429 is included because Telegram tells us
# how long to wait; the 5xx family and 408 are transient by definition.
RETRYABLE_STATUS = frozenset({408, 429, 500, 502, 503, 504})

# Telegram's HTML subset. Anything else in dynamic text is escaped.
_ALLOWED_TAGS = ("b", "i", "u", "s", "code", "pre", "a")


# ---------------------------------------------------------------------------
# Secret hygiene
# ---------------------------------------------------------------------------
def _mask_destination(chat_id: Any) -> str:
    """A chat id is enough to message someone, so only a tail fragment is kept.

    Stored in the database and shown in the UI; the raw value never is.
    """
    text = str(chat_id or "")
    if not text:
        return "unset"
    visible = text[-4:] if len(text) > 4 else text[-2:]
    return f"***{visible}"


def _redact(text: Any) -> str:
    """Strip the bot token out of arbitrary text before storing or logging it.

    Telegram echoes the request URL in some error bodies, and the URL contains
    the token. This is the last line of defence for that.
    """
    out = "" if text is None else str(text)
    token = config.TELEGRAM_BOT_TOKEN
    if token:
        out = out.replace(token, "***REDACTED***")
        # The bot id prefix (digits before the colon) is not itself secret, but
        # the secret half must never survive.
        if ":" in token:
            out = out.replace(token.split(":", 1)[1], "***REDACTED***")
    return out


def _api_url(method: str) -> str:
    """Never logged and never returned — it embeds the token."""
    return f"{config.TELEGRAM_API_BASE}/bot{config.TELEGRAM_BOT_TOKEN}/{method}"


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
def config_status() -> dict:
    """Safe configuration view. Contains no secret."""
    return config.telegram_config_status()


def is_ready() -> bool:
    status = config_status()
    return bool(status["enabled"] and status["configured"])


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------
def _esc(value: Any) -> str:
    """Escape a dynamic value for Telegram HTML.

    Asset ids, area names and model-written reasons all end up inside the
    message; an unescaped `<` would make Telegram reject the whole send with
    400, so everything dynamic goes through here.
    """
    return html.escape("" if value is None else str(value), quote=False)


def _has_value(value: Any) -> bool:
    """Whether a field is worth printing.

    The brief must never show `None`, `nan` or an empty string, so a field that
    is missing is omitted entirely rather than rendered as a placeholder.
    """
    if value is None:
        return False
    if isinstance(value, float) and value != value:      # NaN
        return False
    text = str(value).strip()
    return text != "" and text.lower() not in ("none", "null", "nan")


def _line(label: str, value: Any, suffix: str = "") -> Optional[str]:
    return f"{label}: <b>{_esc(value)}{suffix}</b>" if _has_value(value) else None


def _num(value: Any) -> Optional[str]:
    try:
        return f"{int(round(float(value))):,}"
    except (TypeError, ValueError):
        return None


def _pct(value: Any) -> Optional[str]:
    """Model probabilities are 0..1; area/weather scores are already 0..100."""
    try:
        return f"{float(value) * 100:.0f}%"
    except (TypeError, ValueError):
        return None


def _score(value: Any, out_of: int = 100) -> Optional[str]:
    try:
        return f"{float(value):.0f}/{out_of}"
    except (TypeError, ValueError):
        return None


def _stamp(raw: Any = None) -> str:
    """Render the simulation clock if present, otherwise real UTC.

    The app runs on a simulated clock (`meta.now`), so using wall-clock time
    here would contradict every number in the message.
    """
    text = raw or db.get_meta("now")
    try:
        parsed = datetime.fromisoformat(str(text).replace("Z", "+00:00"))
        return parsed.strftime("%d %B %Y, %H:%M UTC")
    except (TypeError, ValueError):
        return datetime.now(timezone.utc).strftime("%d %B %Y, %H:%M UTC")


def _join(parts: Iterable[Optional[str]]) -> str:
    return "\n".join(p for p in parts if p)


def _clamp(text: str) -> str:
    """Telegram rejects anything over its message limit, so truncate on a line
    boundary and say so rather than letting the provider 400 the whole send."""
    limit = config.TELEGRAM_MAX_MESSAGE_CHARS
    if len(text) <= limit:
        return text
    notice = "\n… (truncated)"
    return text[: limit - len(notice)].rsplit("\n", 1)[0] + notice


def _footer(alert_id: Optional[str] = None, generated: Any = None) -> str:
    parts = [f"\nGenerated: {_stamp(generated)}"]
    if _has_value(alert_id):
        parts.append(f"Alert ID: <code>{_esc(alert_id)}</code>")
    url = config.PUBLIC_APP_URL
    if _has_value(url):
        parts.append(f"\nOpen Command Center:\n{_esc(url)}")
    return _join(parts)


# ---------------------------------------------------------------------------
# Message builders — each uses only data the caller actually has
# ---------------------------------------------------------------------------
def _driver_block(drivers: Any) -> Optional[str]:
    """Render the SHAP drivers the way an operator reads them.

    The stored records already carry a human `label` from
    `ml.features.FEATURE_LABELS`, plus the measured value and a z-score. Using
    the raw feature name instead ("pd_mean_24") is accurate but unreadable on a
    phone, so the label wins and the direction and deviation are appended — all
    of it measured, none of it narrated.
    """
    if not isinstance(drivers, list) or not drivers:
        return None

    bullets = []
    for d in drivers[:4]:
        if not isinstance(d, dict):
            if _has_value(d):
                bullets.append(f"• {_esc(d)}")
            continue

        label = d.get("label") or d.get("feature") or d.get("name")
        if not _has_value(label):
            continue

        line = f"• {_esc(label)}"
        direction = str(d.get("direction") or "").lower()
        if direction in ("high", "low"):
            line += f" is {direction}"
        try:
            sigma = abs(float(d.get("z")))
            if sigma >= 1.0:
                line += f" ({sigma:.1f}σ from normal)"
        except (TypeError, ValueError):
            pass
        bullets.append(line)

    if not bullets:
        return None
    return "\n<b>Why this asset is risky:</b>\n" + "\n".join(bullets)


def _crew_block(crew: Optional[dict]) -> Optional[str]:
    """Crew pre-positioning, straight from the optimiser output.

    Never generated by the LLM: these are dispatch decisions.
    """
    if not crew:
        return None
    body = _join([
        "\n<b>Crew pre-positioning:</b>",
        _line("• Crew", crew.get("crew_id")),
        _line("• Current area", crew.get("current_area")),
        _line("• Recommended area", crew.get("recommended_area")),
        _line("• Required skill", crew.get("req_skill")),
        _line("• Current response", _num(crew.get("current_response_min")), " min"),
        _line("• Expected response", _num(crew.get("projected_response_min")), " min"),
        _line("• Minutes saved", _num(crew.get("response_reduction_min")), " min"),
    ])
    rationale = crew.get("rationale")
    if _has_value(rationale):
        body += f"\n<i>{_esc(rationale)}</i>"
    return body


def format_asset_alert(alert: dict, asset: Optional[dict] = None,
                       prediction: Optional[dict] = None,
                       crew: Optional[dict] = None) -> str:
    """CRITICAL/HIGH asset alert. Every figure comes from the stored row."""
    priority = str(alert.get("priority") or "").upper()
    heading = ("🚨 <b>CRITICAL GRID ALERT</b>" if priority == "CRITICAL"
               else "⚠️ <b>HIGH GRID ALERT</b>")
    asset = asset or {}
    prediction = prediction or {}

    driver_block = _driver_block(prediction.get("top_risk_factors"))

    action = alert.get("recommended_action") or prediction.get("recommended_action")

    return _clamp(_join([
        heading,
        "",
        _line("Asset", alert.get("asset_id")),
        _line("Type", asset.get("asset_type")),
        _line("Area", alert.get("area_id") or asset.get("geographic_area")),
        "",
        _line("Failure Probability", _pct(prediction.get("failure_probability"))),
        _line("Grid Impact Score", _score(prediction.get("grid_impact_score"))),
        _line("Priority", priority),
        _line("Forecast Window", f"Next {config.PREDICTION_HORIZON_HOURS} hours"),
        _line("Customers Served", _num(asset.get("customers_served"))),
        _line("Weather Risk", _score(prediction.get("weather_risk"))),
        driver_block,
        f"\n{_esc(alert.get('reason'))}" if _has_value(alert.get("reason")) else None,
        f"\n<b>Recommended Action:</b>\n{_esc(action)}" if _has_value(action) else None,
        _crew_block(crew),
        _footer(alert.get("alert_id"), alert.get("created_at")),
    ]))


def format_weather_alert(alert: dict, area: Optional[dict] = None,
                         crew: Optional[dict] = None) -> str:
    """Severe-weather area alert."""
    area = area or {}
    return _clamp(_join([
        "🌩️ <b>SEVERE WEATHER ALERT</b>",
        "",
        _line("Area", alert.get("area_id") or area.get("area_id")),
        _line("Priority", str(alert.get("priority") or "").upper()),
        _line("Weather Risk", _score(area.get("weather_risk"))),
        _line("Outage Probability", _pct(area.get("outage_probability"))),
        _line("High-Risk Assets", _num(area.get("high_risk_assets"))),
        _line("Customers at Risk", _num(area.get("expected_customers_affected"))),
        f"\n{_esc(alert.get('reason'))}" if _has_value(alert.get("reason")) else None,
        (f"\n<b>Recommended Action:</b>\n{_esc(alert.get('recommended_action'))}"
         if _has_value(alert.get("recommended_action")) else None),
        _crew_block(crew),
        _footer(alert.get("alert_id"), alert.get("created_at")),
    ]))


def format_crew_recommendation(crew: dict) -> str:
    """Standalone crew pre-positioning notification."""
    return _clamp(_join([
        "🚚 <b>CREW PRE-POSITIONING RECOMMENDED</b>",
        "",
        _crew_block(crew),
        _footer(),
    ]))


def format_simulation(result: dict) -> str:
    """What-if simulation outcome. Handles both scenario shapes."""
    scenario = result.get("scenario")

    if scenario == "weather_event":
        body = _join([
            "🧪 <b>WHAT-IF: SEVERE WEATHER</b>",
            "",
            _line("Area", result.get("area_id")),
            _line("Scenario", str(result.get("injected_severity") or "").title()),
            _line("Outage Probability", _pct(result.get("new_outage_probability"))),
            _line("Baseline", _pct(result.get("baseline_outage_probability"))),
            _line("Risk Level", result.get("new_risk_level")),
            _line("High-Risk Assets", _num(result.get("high_risk_assets"))),
        ])
        actions = result.get("recommended_actions")
    else:
        crew = result.get("nearest_crew") or {}
        body = _join([
            "🧪 <b>WHAT-IF: ASSET FAILURE</b>",
            "",
            _line("Asset", result.get("asset_id")),
            _line("Type", result.get("asset_type")),
            _line("Area", result.get("area")),
            _line("Severity", result.get("severity")),
            _line("Customers Affected", _num(result.get("total_customers_affected"))),
            _line("Direct", _num(result.get("direct_customers"))),
            _line("Downstream", _num(result.get("downstream_customers"))),
            _line("Est. Outage", _num(result.get("estimated_outage_minutes")), " min"),
            _line("Nearest Crew", crew.get("crew_id")),
            _line("Crew Response", _num(crew.get("response_min")), " min"),
        ])
        actions = result.get("recommended_mitigation")

    action_block = None
    if isinstance(actions, list) and actions:
        action_block = "\n<b>Recommended Actions:</b>\n" + "\n".join(
            f"• {_esc(a)}" for a in actions[:5] if _has_value(a))

    return _clamp(_join([body, action_block, _footer()]))


def format_briefing(brief: dict) -> str:
    """Operator shift briefing."""
    actions = brief.get("recommended_actions") or brief.get("actions")
    action_block = None
    if isinstance(actions, list) and actions:
        bullets = []
        for a in actions[:6]:
            text = a.get("action") if isinstance(a, dict) else a
            if _has_value(text):
                bullets.append(f"• {_esc(text)}")
        if bullets:
            action_block = "\n<b>Immediate Actions:</b>\n" + "\n".join(bullets)

    return _clamp(_join([
        "📋 <b>GRID OPERATIONS BRIEFING</b>",
        "",
        _line("Overall Risk", brief.get("overall_risk")),
        _line("Critical Assets", _num(brief.get("critical_assets"))),
        _line("High-Risk Assets", _num(brief.get("high_risk_assets"))),
        _line("Customers at Risk", _num(brief.get("customers_at_risk"))),
        _line("Weather-Exposed Zones", _num(brief.get("weather_exposed_zones"))),
        _line("Primary Driver", brief.get("primary_driver")),
        action_block,
        _footer(generated=brief.get("generated_at")),
    ]))


def format_test_message() -> str:
    return _clamp(_join([
        "✅ <b>Grid Risk Command Center</b>",
        "",
        "Telegram notifications are connected.",
        "You will receive "
        f"<b>{_esc(', '.join(config.TELEGRAM_NOTIFY_PRIORITIES))}</b> grid alerts here.",
        _footer(),
    ]))


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------
def build_dedup_key(kind: str, *parts: Any) -> str:
    """Deterministic content key.

    Not the alert id: `generate_alerts()` wipes the table and mints new uuids on
    every run, so keying on the id would notify the same transformer again after
    each pipeline pass. Hashing the *condition* (kind + asset/area + priority)
    makes repeats recognisable across runs.
    """
    raw = "|".join(str(p) for p in (kind, *parts) if p is not None)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def find_recent_delivery(dedup_key: str, window_minutes: Optional[int] = None) -> Optional[dict]:
    """A prior SENT/PENDING delivery for the same condition inside the window.

    FAILED deliveries deliberately do not suppress a retry — a failure is not a
    notification.
    """
    if not dedup_key:
        return None
    minutes = config.TELEGRAM_DEDUP_WINDOW_MINUTES if window_minutes is None else window_minutes
    if minutes <= 0:
        return None
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
    return db.query_one(
        "SELECT * FROM notification_deliveries "
        "WHERE deduplication_key=? AND channel=? AND status IN ('SENT','PENDING','SENDING') "
        "AND created_at >= ? ORDER BY created_at DESC LIMIT 1",
        (dedup_key, CHANNEL, cutoff))


# ---------------------------------------------------------------------------
# Delivery rows
# ---------------------------------------------------------------------------
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_delivery(*, status: str, kind: str, alert_id: Optional[str] = None,
                    priority: Optional[str] = None, dedup_key: Optional[str] = None,
                    summary: Optional[str] = None, destination: Optional[str] = None,
                    error: Optional[str] = None) -> dict:
    delivery_id = f"ND-{uuid.uuid4().hex[:12].upper()}"
    row = {
        "delivery_id": delivery_id,
        "alert_id": alert_id,
        "channel": CHANNEL,
        "destination_reference": _mask_destination(
            destination if destination is not None else config.TELEGRAM_DEFAULT_CHAT_ID),
        "priority": priority,
        "status": status,
        "attempt_count": 0,
        "provider_message_id": None,
        "provider_response_code": None,
        "error_message": _safe_error(error),
        "notification_kind": kind,
        "payload_summary": (summary or "")[:200] or None,
        "created_at": _now(),
        "last_attempt_at": None,
        "sent_at": None,
        "deduplication_key": dedup_key,
    }
    with db.session() as conn:
        conn.execute(
            """INSERT INTO notification_deliveries
               (delivery_id,alert_id,channel,destination_reference,priority,status,
                attempt_count,provider_message_id,provider_response_code,error_message,
                notification_kind,payload_summary,created_at,last_attempt_at,sent_at,
                deduplication_key)
               VALUES(:delivery_id,:alert_id,:channel,:destination_reference,:priority,
                :status,:attempt_count,:provider_message_id,:provider_response_code,
                :error_message,:notification_kind,:payload_summary,:created_at,
                :last_attempt_at,:sent_at,:deduplication_key)""", row)
    return row


def _safe_error(text: Any) -> Optional[str]:
    """Redact the token, and make sure the value never round-trips as JSON.

    `db.rows_to_dicts` parses any stored string that starts with `{` or `[`, so
    a provider error body would come back out of the database as a dict and
    break every consumer that expects a string.
    """
    if text is None:
        return None
    cleaned = _redact(text).strip()
    if cleaned[:1] in ("{", "["):
        cleaned = f"provider error: {cleaned}"
    return cleaned[:1000] or None


def update_delivery(delivery_id: str, **fields) -> None:
    if not fields:
        return
    if "error_message" in fields:
        fields["error_message"] = _safe_error(fields["error_message"])
    assignments = ", ".join(f"{k}=:{k}" for k in fields)
    params = dict(fields, delivery_id=delivery_id)
    with db.session() as conn:
        conn.execute(
            f"UPDATE notification_deliveries SET {assignments} WHERE delivery_id=:delivery_id",
            params)


def get_delivery(delivery_id: str) -> Optional[dict]:
    return db.query_one(
        "SELECT * FROM notification_deliveries WHERE delivery_id=?", (delivery_id,))


def list_deliveries(*, status: Optional[str] = None, channel: Optional[str] = None,
                    priority: Optional[str] = None, alert_id: Optional[str] = None,
                    limit: int = 50) -> list:
    sql = "SELECT * FROM notification_deliveries WHERE 1=1"
    params: list = []
    for column, value in (("status", status), ("channel", channel),
                          ("priority", priority), ("alert_id", alert_id)):
        if value:
            sql += f" AND {column}=?"
            params.append(value)
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(max(1, min(int(limit), 500)))
    return db.query(sql, tuple(params))


# ---------------------------------------------------------------------------
# Transport
# ---------------------------------------------------------------------------
class TelegramResult:
    """Outcome of one full send (including any retries)."""

    def __init__(self, ok: bool, *, message_id=None, status_code=None,
                 error=None, attempts=0):
        self.ok = ok
        self.message_id = message_id
        self.status_code = status_code
        self.error = error
        self.attempts = attempts


def _post_once(text: str, chat_id: str) -> tuple[Optional[httpx.Response], Optional[str]]:
    """One HTTP attempt. Returns (response, transport_error)."""
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": config.TELEGRAM_PARSE_MODE,
        "disable_web_page_preview": True,
    }
    try:
        with httpx.Client(timeout=config.TELEGRAM_REQUEST_TIMEOUT_SECONDS) as client:
            return client.post(_api_url("sendMessage"), json=payload), None
    except Exception as exc:                        # timeout, DNS, TLS, refused
        return None, f"{type(exc).__name__}: {exc}"


def _retry_after(response: httpx.Response) -> Optional[float]:
    """Honour Telegram's own backoff instruction when it sends one."""
    try:
        body = response.json()
        value = (body.get("parameters") or {}).get("retry_after")
        if value is not None:
            return float(value)
    except Exception:
        pass
    header = response.headers.get("Retry-After")
    try:
        return float(header) if header else None
    except (TypeError, ValueError):
        return None


def _describe(response: httpx.Response) -> str:
    try:
        body = response.json()
        detail = body.get("description") or body
    except Exception:
        detail = (response.text or "")[:300]
    return _redact(f"HTTP {response.status_code}: {detail}")


def send_message(text: str, chat_id: Optional[str] = None) -> TelegramResult:
    """Send one message, retrying only transient failures.

    Raises nothing: callers get a TelegramResult and decide what to record.
    """
    destination = chat_id or config.TELEGRAM_DEFAULT_CHAT_ID
    if not config.TELEGRAM_BOT_TOKEN or not destination:
        return TelegramResult(False, error="Telegram is not configured", attempts=0)

    attempts = 0
    last_error = "unknown error"
    last_status = None
    max_attempts = max(1, config.TELEGRAM_MAX_RETRIES)

    while attempts < max_attempts:
        attempts += 1
        response, transport_error = _post_once(text, destination)

        if transport_error is not None:
            last_error, last_status = _redact(transport_error), None
            if attempts >= max_attempts:
                break
            time.sleep(config.TELEGRAM_RETRY_BASE_SECONDS * (2 ** (attempts - 1)))
            continue

        last_status = response.status_code
        if response.status_code == 200:
            try:
                body = response.json()
            except Exception:
                body = {}
            if body.get("ok"):
                message_id = (body.get("result") or {}).get("message_id")
                return TelegramResult(True, message_id=str(message_id) if message_id else None,
                                      status_code=200, attempts=attempts)
            # 200 with ok=false is a permanent content/authorisation problem.
            return TelegramResult(False, status_code=200, attempts=attempts,
                                  error=_redact(body.get("description") or "Telegram rejected the message"))

        last_error = _describe(response)

        if response.status_code not in RETRYABLE_STATUS:
            # 400 bad chat id, 401 bad token, 403 blocked — identical forever.
            return TelegramResult(False, status_code=response.status_code,
                                  attempts=attempts, error=last_error)

        if attempts >= max_attempts:
            break

        wait = _retry_after(response)
        if wait is None:
            wait = config.TELEGRAM_RETRY_BASE_SECONDS * (2 ** (attempts - 1))
        time.sleep(min(wait, 60.0))

    return TelegramResult(False, status_code=last_status, attempts=attempts, error=last_error)


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
def _dispatch(*, text: str, kind: str, alert_id: Optional[str] = None,
              priority: Optional[str] = None, dedup_key: Optional[str] = None,
              summary: Optional[str] = None, force: bool = False,
              chat_id: Optional[str] = None) -> dict:
    """Shared path for every notification: gate, record, send, record outcome."""
    status = config_status()

    if not status["enabled"]:
        return create_delivery(status=DISABLED, kind=kind, alert_id=alert_id,
                               priority=priority, dedup_key=dedup_key, summary=summary,
                               error="Telegram notifications are disabled")

    if not status["configured"]:
        return create_delivery(status=FAILED, kind=kind, alert_id=alert_id,
                               priority=priority, dedup_key=dedup_key, summary=summary,
                               error=f"Telegram is misconfigured: missing {', '.join(status['missing'])}")

    if not force and dedup_key:
        previous = find_recent_delivery(dedup_key)
        if previous:
            row = create_delivery(status=SKIPPED, kind=kind, alert_id=alert_id,
                                  priority=priority, dedup_key=dedup_key, summary=summary,
                                  error=f"Duplicate of {previous['delivery_id']} within "
                                        f"{status['dedup_window_minutes']} minute window")
            return row

    row = create_delivery(status=PENDING, kind=kind, alert_id=alert_id, priority=priority,
                          dedup_key=dedup_key, summary=summary, destination=chat_id)
    return _attempt(row, text, chat_id)


def _attempt(row: dict, text: str, chat_id: Optional[str] = None) -> dict:
    """Run the transport for an existing delivery row and persist the outcome."""
    delivery_id = row["delivery_id"]
    update_delivery(delivery_id, status=SENDING, last_attempt_at=_now())

    try:
        result = send_message(text, chat_id)
    except Exception as exc:                       # never propagate into a caller
        log.exception("telegram send crashed")
        result = TelegramResult(False, error=f"{type(exc).__name__}: {exc}", attempts=1)

    attempts = int(row.get("attempt_count") or 0) + max(1, result.attempts)

    if result.ok:
        update_delivery(delivery_id, status=SENT, attempt_count=attempts,
                        provider_message_id=result.message_id,
                        provider_response_code=result.status_code,
                        error_message=None, sent_at=_now(), last_attempt_at=_now())
        log.info("telegram delivery %s SENT (attempts=%s)", delivery_id, attempts)
    else:
        update_delivery(delivery_id, status=FAILED, attempt_count=attempts,
                        provider_response_code=result.status_code,
                        error_message=result.error, last_attempt_at=_now())
        # _redact has already run inside _safe_error / send_message.
        log.warning("telegram delivery %s FAILED (attempts=%s): %s",
                    delivery_id, attempts, _redact(result.error))

    db.audit("telegram", "notification_delivery", {
        "delivery_id": delivery_id,
        "kind": row.get("notification_kind"),
        "alert_id": row.get("alert_id"),
        "status": SENT if result.ok else FAILED,
        "attempts": attempts,
    })
    return get_delivery(delivery_id) or row


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------
def _load_alert_context(alert: dict) -> tuple[dict, dict, Optional[dict]]:
    """Pull the real asset / prediction / crew rows behind an alert."""
    asset, prediction = {}, {}
    if alert.get("asset_id"):
        asset = db.query_one("SELECT * FROM assets WHERE asset_id=?", (alert["asset_id"],)) or {}
        prediction = db.query_one(
            "SELECT * FROM predictions WHERE asset_id=?", (alert["asset_id"],)) or {}

    crew = None
    if alert.get("area_id"):
        try:
            from . import crew as crew_svc
            recs = (crew_svc.recommend_crews() or {}).get("recommendations") or []
            crew = next((r for r in recs if r.get("recommended_area") == alert["area_id"]), None)
        except Exception:
            # A crew-optimiser hiccup must not stop the alert going out.
            log.warning("crew recommendation unavailable for %s", alert.get("area_id"))
    return asset, prediction, crew


def send_alert(alert: dict, *, force: bool = False,
               respect_priority_filter: bool = True) -> dict:
    """Notify for one alert row. Returns the delivery record; never raises."""
    try:
        priority = str(alert.get("priority") or "").upper()

        if respect_priority_filter and priority not in config.TELEGRAM_NOTIFY_PRIORITIES:
            return create_delivery(
                status=SKIPPED, kind="asset_alert", alert_id=alert.get("alert_id"),
                priority=priority, summary=alert.get("title"),
                error=f"Priority {priority} is not in TELEGRAM_NOTIFY_PRIORITIES")

        asset, prediction, crew = _load_alert_context(alert)
        is_weather = not alert.get("asset_id")
        kind = "weather_alert" if is_weather else "asset_alert"

        if is_weather:
            area = db.query_one(
                "SELECT * FROM area_risk WHERE area_id=?", (alert.get("area_id"),)) or {}
            text = format_weather_alert(alert, area, crew)
        else:
            text = format_asset_alert(alert, asset, prediction, crew)

        dedup_key = build_dedup_key(
            kind, alert.get("asset_id"), alert.get("area_id"), priority)

        return _dispatch(text=text, kind=kind, alert_id=alert.get("alert_id"),
                         priority=priority, dedup_key=dedup_key,
                         summary=alert.get("title"), force=force)
    except Exception as exc:
        # The alert itself is already persisted; a formatting bug must not
        # surface as a failed alert-generation run.
        log.exception("send_alert failed for %s", alert.get("alert_id"))
        return create_delivery(status=FAILED, kind="asset_alert",
                               alert_id=alert.get("alert_id"),
                               priority=alert.get("priority"),
                               summary=alert.get("title"),
                               error=f"{type(exc).__name__}: {exc}")


def send_alert_by_id(alert_id: str, *, force: bool = False) -> Optional[dict]:
    alert = db.query_one("SELECT * FROM alerts WHERE alert_id=?", (alert_id,))
    if not alert:
        return None
    # An explicit operator "send this one" bypasses the priority filter: they
    # asked for this specific alert, the filter only governs automatic pushes.
    return send_alert(alert, force=force, respect_priority_filter=False)


def notify_alerts(alerts: list) -> dict:
    """Bulk entry point used by the alert pipeline after alerts are persisted."""
    counts = {SENT: 0, FAILED: 0, SKIPPED: 0, DISABLED: 0}
    if not alerts:
        return {"attempted": 0, **{k.lower(): v for k, v in counts.items()}}

    if not config.TELEGRAM_ENABLED:
        # Cheap exit: no rows, no work. Nothing was attempted.
        return {"attempted": 0, "disabled": True,
                **{k.lower(): 0 for k in counts}}

    attempted = 0
    for alert in alerts:
        if str(alert.get("priority") or "").upper() not in config.TELEGRAM_NOTIFY_PRIORITIES:
            continue
        attempted += 1
        row = send_alert(alert)
        counts[row.get("status", FAILED)] = counts.get(row.get("status", FAILED), 0) + 1
    return {"attempted": attempted, **{k.lower(): v for k, v in counts.items()}}


def send_simulation(result: dict, *, force: bool = True) -> dict:
    """Opt-in what-if notification. Forced by default: the operator just asked."""
    key_parts = (result.get("scenario"), result.get("asset_id"), result.get("area_id"))
    return _dispatch(text=format_simulation(result), kind="simulation",
                     dedup_key=build_dedup_key("simulation", *key_parts),
                     summary=f"Simulation {result.get('scenario')}", force=force)


def send_briefing(brief: dict, *, force: bool = True) -> dict:
    return _dispatch(text=format_briefing(brief), kind="briefing",
                     dedup_key=build_dedup_key("briefing", brief.get("generated_at")),
                     summary="Operations briefing", force=force)


def send_crew_recommendation(crew: dict, *, force: bool = False) -> dict:
    return _dispatch(text=format_crew_recommendation(crew), kind="crew",
                     dedup_key=build_dedup_key("crew", crew.get("crew_id"),
                                               crew.get("recommended_area")),
                     summary=f"Pre-position {crew.get('crew_id')}", force=force)


def test_connection() -> dict:
    """Send a test message. Always forced — the operator pressed the button."""
    return _dispatch(text=format_test_message(), kind="test",
                     summary="Test notification", force=True)


def retry_failed_delivery(delivery_id: str) -> Optional[dict]:
    """Re-attempt a FAILED delivery, reusing its recorded context.

    Returns the row unchanged if it is not retryable, so the caller can report
    "already sent" rather than silently sending a duplicate.
    """
    row = get_delivery(delivery_id)
    if not row:
        return None
    if row["status"] != FAILED:
        return row
    if not is_ready():
        update_delivery(delivery_id, error_message="Telegram is not enabled or not configured",
                        last_attempt_at=_now())
        return get_delivery(delivery_id)

    alert = None
    if row.get("alert_id"):
        alert = db.query_one("SELECT * FROM alerts WHERE alert_id=?", (row["alert_id"],))

    if alert:
        asset, prediction, crew = _load_alert_context(alert)
        text = (format_weather_alert(alert, db.query_one(
                    "SELECT * FROM area_risk WHERE area_id=?", (alert.get("area_id"),)) or {}, crew)
                if not alert.get("asset_id")
                else format_asset_alert(alert, asset, prediction, crew))
    else:
        # The original alert is gone (the pipeline re-ran). Retry what we can
        # still describe truthfully rather than inventing content.
        text = _clamp(_join([
            "🔁 <b>Grid Risk Command Center</b>",
            "",
            f"Retry of delivery <code>{_esc(delivery_id)}</code>.",
            _line("Summary", row.get("payload_summary")),
            _line("Priority", row.get("priority")),
            _footer(row.get("alert_id")),
        ]))

    return _attempt(row, text)
