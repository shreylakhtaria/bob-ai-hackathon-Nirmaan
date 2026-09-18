"""
Phase 1 security tests: authentication, CSRF, RBAC, error envelope.

These drive the real ASGI app through TestClient rather than calling helpers
directly — authorization is only meaningful as observed over HTTP, and testing
it at the function level would not catch a route that simply forgot its guard.

Run:  pytest backend/tests/test_auth_security.py -q
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from backend import config, db
from backend.main import app
from backend.services import auth as auth_svc

# Rate limiting is disabled for these tests: it is verified separately, and left
# on it starves every later test once the login window fills. Setting the config
# flag alone is not enough — the Limiter is constructed at app import, so the
# already-built instance has to be switched off directly.
config.RATE_LIMIT_ENABLED = False
if hasattr(app.state, "limiter"):
    app.state.limiter.enabled = False

client = TestClient(app)


def _mk_user(role="operator"):
    """Create a throwaway account with a known role, returning its credentials."""
    email = f"t-{uuid.uuid4().hex[:10]}@example.com"
    password = "password123"
    auth_svc.signup(f"Test {role}", email, password)
    if role != config.DEFAULT_ROLE:
        with db.session() as conn:
            conn.execute("UPDATE users SET role=? WHERE email=?", (role, email))
    return email, password


def _login(email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
def test_login_returns_access_token_and_sets_cookies():
    email, pw = _mk_user()
    r = client.post("/api/auth/login", json={"email": email, "password": pw})
    body = r.json()
    assert r.status_code == 200
    assert body["access_token"] and body["token_type"] == "bearer"
    assert body["user"]["role"] == "operator"
    assert "password_hash" not in body["user"]          # never leak the hash
    assert config.REFRESH_COOKIE_NAME in r.cookies
    assert config.CSRF_COOKIE_NAME in r.cookies


def test_refresh_cookie_is_httponly_and_path_scoped():
    email, pw = _mk_user()
    r = client.post("/api/auth/login", json={"email": email, "password": pw})
    raw = [v for k, v in r.headers.items()
           if k.lower() == "set-cookie" and config.REFRESH_COOKIE_NAME in v]
    header = " ".join(raw) or str(r.headers.get("set-cookie", ""))
    assert "httponly" in header.lower()                  # unreadable from JS
    assert config.REFRESH_COOKIE_PATH in header          # not sent to every route


def test_bad_password_is_rejected():
    email, _ = _mk_user()
    r = client.post("/api/auth/login", json={"email": email, "password": "wrong-password"})
    assert r.status_code == 401


def test_unknown_email_is_rejected_without_leaking_existence():
    r = client.post("/api/auth/login",
                    json={"email": "nobody-here@example.com", "password": "password123"})
    assert r.status_code == 401
    # Same message as a wrong password, so the response cannot enumerate accounts.
    assert r.json()["error"]["message"] == "Incorrect email or password"


def test_duplicate_signup_conflicts():
    email, pw = _mk_user()
    r = client.post("/api/auth/signup",
                    json={"display_name": "Someone Else", "email": email, "password": pw})
    assert r.status_code == 409


def test_signup_rejects_weak_password():
    r = client.post("/api/auth/signup",
                    json={"display_name": "Weak Pass", "email": f"w{uuid.uuid4().hex[:8]}@e.com",
                          "password": "short"})
    assert r.status_code == 422


def test_signup_cannot_self_assign_admin():
    """Role must come from the server, never the request body."""
    email = f"esc-{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/api/auth/signup",
                    json={"display_name": "Escalator", "email": email,
                          "password": "password123", "role": "admin"})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "operator"


def test_malformed_and_missing_tokens_rejected():
    assert client.get("/api/assets").status_code == 401
    assert client.get("/api/assets", headers=_auth("garbage")).status_code == 401
    assert client.get("/api/assets", headers={"Authorization": "Basic abc"}).status_code == 401


def test_expired_access_token_rejected(monkeypatch):
    email, pw = _mk_user()
    user = db.query_one("SELECT * FROM users WHERE email=?", (email,))
    monkeypatch.setattr(config, "ACCESS_TOKEN_TTL_MINUTES", -1)   # already expired
    token = auth_svc.issue_access_token(user)
    assert client.get("/api/assets", headers=_auth(token)).status_code == 401


def test_refresh_token_cannot_be_used_as_access_token():
    """Token type is part of the signed payload, so the two are not interchangeable."""
    email, pw = _mk_user()
    user = db.query_one("SELECT * FROM users WHERE email=?", (email,))
    refresh = auth_svc.issue_refresh_token(user)
    assert client.get("/api/assets", headers=_auth(refresh)).status_code == 401


def test_tampered_token_rejected():
    email, pw = _mk_user()
    token = _login(email, pw)["access_token"]
    body, sig = token.split(".", 1)
    assert client.get("/api/assets", headers=_auth(f"{body}.{sig[:-2]}xx")).status_code == 401


# ---------------------------------------------------------------------------
# CSRF + refresh rotation
# ---------------------------------------------------------------------------
def test_refresh_requires_csrf_header():
    email, pw = _mk_user()
    c = TestClient(app)
    c.post("/api/auth/login", json={"email": email, "password": pw})
    assert c.post("/api/auth/refresh").status_code == 403                       # missing
    assert c.post("/api/auth/refresh",
                  headers={config.CSRF_HEADER_NAME: "wrong"}).status_code == 403  # mismatched


def test_refresh_rotates_and_old_token_dies():
    email, pw = _mk_user()
    c = TestClient(app)
    c.post("/api/auth/login", json={"email": email, "password": pw})
    old_refresh = c.cookies.get(config.REFRESH_COOKIE_NAME)
    csrf = c.cookies.get(config.CSRF_COOKIE_NAME)

    assert c.post("/api/auth/refresh", headers={config.CSRF_HEADER_NAME: csrf}).status_code == 200

    # Replaying the pre-rotation token must fail, so a stolen one is single-use.
    replay = TestClient(app)
    replay.cookies.set(config.REFRESH_COOKIE_NAME, old_refresh)
    replay.cookies.set(config.CSRF_COOKIE_NAME, csrf)
    assert replay.post("/api/auth/refresh",
                       headers={config.CSRF_HEADER_NAME: csrf}).status_code == 401


def test_logout_revokes_refresh_token():
    email, pw = _mk_user()
    c = TestClient(app)
    c.post("/api/auth/login", json={"email": email, "password": pw})
    refresh = c.cookies.get(config.REFRESH_COOKIE_NAME)
    csrf = c.cookies.get(config.CSRF_COOKIE_NAME)
    assert c.post("/api/auth/logout", headers={config.CSRF_HEADER_NAME: csrf}).status_code == 200

    # Logout also clears the cookies, so re-present the old pair explicitly.
    # Otherwise this would pass on the CSRF check alone and prove nothing about
    # whether the token was actually revoked server-side.
    replay = TestClient(app)
    replay.cookies.set(config.REFRESH_COOKIE_NAME, refresh)
    replay.cookies.set(config.CSRF_COOKIE_NAME, csrf)
    assert replay.post("/api/auth/refresh",
                       headers={config.CSRF_HEADER_NAME: csrf}).status_code == 401


def test_revoked_tokens_are_stored_hashed():
    email, pw = _mk_user()
    user = db.query_one("SELECT * FROM users WHERE email=?", (email,))
    token = auth_svc.issue_refresh_token(user)
    rows = db.query("SELECT token_hash FROM refresh_tokens WHERE user_id=?", (user["id"],))
    assert rows and all(len(r["token_hash"]) == 64 for r in rows)   # sha256 hex
    assert all(token != r["token_hash"] for r in rows)              # never the raw token


# ---------------------------------------------------------------------------
# RBAC — the security boundary
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def tokens():
    out = {}
    for role in ("admin", "operator", "crew"):
        email, pw = _mk_user(role)
        out[role] = _login(email, pw)["access_token"]
    return out


@pytest.mark.parametrize("path", ["/api/assets", "/api/dashboard/summary", "/api/crews"])
def test_reads_allowed_for_every_role_denied_anonymous(tokens, path):
    for role in ("admin", "operator", "crew"):
        assert client.get(path, headers=_auth(tokens[role])).status_code == 200, role
    assert client.get(path).status_code == 401


def test_mutations_require_operator_or_admin(tokens):
    body = {"asset_id": "T-1024"}
    # 409 means "no crew available" — business logic, i.e. authorization passed.
    assert client.post("/api/work-orders/dispatch", json=body,
                       headers=_auth(tokens["admin"])).status_code in (200, 409)
    assert client.post("/api/work-orders/dispatch", json=body,
                       headers=_auth(tokens["operator"])).status_code in (200, 409)
    assert client.post("/api/work-orders/dispatch", json=body,
                       headers=_auth(tokens["crew"])).status_code == 403
    assert client.post("/api/work-orders/dispatch", json=body).status_code == 401


def test_audit_log_access_and_security_event_filtering(tokens):
    """Operators get their Runs Log; only admins see authentication events."""
    assert client.get("/api/audit", headers=_auth(tokens["crew"])).status_code == 403
    assert client.get("/api/audit").status_code == 401

    op = client.get("/api/audit?limit=200", headers=_auth(tokens["operator"]))
    admin = client.get("/api/audit?limit=200", headers=_auth(tokens["admin"]))
    assert op.status_code == 200 and admin.status_code == 200

    from backend.services.operations import SECURITY_ACTIONS
    op_actions = {r["action"] for r in op.json()}
    assert not (op_actions & set(SECURITY_ACTIONS)), "operator can read auth events"
    # The fixture logs in three times, so LOGIN is guaranteed to be present.
    assert {r["action"] for r in admin.json()} & set(SECURITY_ACTIONS), "admin sees auth events"


def test_bulk_export_denied_to_crew(tokens):
    assert client.get("/api/export/assets", headers=_auth(tokens["operator"])).status_code == 200
    assert client.get("/api/export/assets", headers=_auth(tokens["crew"])).status_code == 403


def test_role_is_read_from_token_not_client_input(tokens):
    """A caller cannot promote themselves with a header or query parameter."""
    from backend.services.operations import SECURITY_ACTIONS

    # Spoofed role headers must not unlock admin-only content...
    spoofed = client.get("/api/audit?limit=200",
                         headers={**_auth(tokens["operator"]),
                                  "X-Role": "admin", "role": "admin"})
    assert spoofed.status_code == 200
    assert not ({r["action"] for r in spoofed.json()} & set(SECURITY_ACTIONS))

    # ...nor grant access to an endpoint the role is denied.
    denied = client.get("/api/export/assets",
                        headers={**_auth(tokens["crew"]), "X-Role": "admin"})
    assert denied.status_code == 403

    # /api/auth/me must report the signed role, not the header.
    me = client.get("/api/auth/me", headers={**_auth(tokens["crew"]), "X-Role": "admin"})
    assert me.json()["role"] == "crew"


def test_every_api_route_is_guarded_or_explicitly_public():
    """Fails if a new route is added without an auth decision — the mistake that
    left 36 endpoints open before Phase 1."""
    PUBLIC = {"/api/health", "/api/public/stats",
              "/api/auth/signup", "/api/auth/login",
              "/api/auth/refresh", "/api/auth/logout"}
    unguarded = []
    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith("/api") or path in PUBLIC:
            continue
        deps = getattr(getattr(route, "dependant", None), "dependencies", [])
        flat = str(getattr(route, "endpoint", "")) + str([d.call for d in deps])
        if "require_" not in flat and "get_current_user" not in flat:
            # fall back to inspecting the signature defaults
            import inspect
            sig = inspect.signature(route.endpoint)
            if not any("require_" in str(p.default) or "get_current_user" in str(p.default)
                       for p in sig.parameters.values()):
                unguarded.append(f"{list(getattr(route, 'methods', []))} {path}")
    assert not unguarded, f"Unguarded API routes: {unguarded}"


# ---------------------------------------------------------------------------
# Error envelope
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("status,call", [
    (401, lambda: client.get("/api/assets")),
    (404, lambda: client.get("/api/definitely-not-a-route")),
    (422, lambda: client.post("/api/auth/signup",
                              json={"display_name": "x", "email": "bad", "password": "s"})),
])
def test_errors_share_one_envelope(status, call):
    r = call()
    assert r.status_code == status
    body = r.json()
    assert body["success"] is False
    assert set(body["error"]) == {"code", "message", "details"}
    assert isinstance(body["error"]["code"], str) and body["error"]["message"]


def test_validation_errors_name_the_offending_fields():
    r = client.post("/api/auth/signup",
                    json={"display_name": "x", "email": "nope", "password": "short"})
    fields = {f["field"] for f in r.json()["error"]["details"]["fields"]}
    assert {"display_name", "password"} <= fields


def test_error_body_does_not_leak_internals():
    r = client.get("/api/assets")
    blob = r.text.lower()
    for leak in ("traceback", "select ", "sqlite", "password_hash", "\\src\\backend"):
        assert leak not in blob
