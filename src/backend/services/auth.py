"""
Operator authentication: split access/refresh tokens, CSRF, and roles.

Design notes
------------
* **Tokens are hand-rolled HMAC-SHA256, not PyJWT.** The scheme below is a
  signed, versioned payload with constant-time verification and an `exp` check
  — the same guarantees a symmetric JWT would give — so pulling in a JWT
  library would add a dependency without adding safety.
* **Access token** is short-lived and sent as a bearer header. The SPA keeps it
  in memory, so an XSS payload cannot read it out of localStorage at rest.
* **Refresh token** is long-lived, returned only as an HttpOnly cookie, and
  *stored hashed* in `refresh_tokens`. Storing it is what makes logout and
  revocation real: a purely stateless refresh token cannot be invalidated.
  Only the hash is stored, so a database leak does not yield usable tokens.
* **Rotation**: every refresh issues a new token and revokes the old one.
* Passwords: PBKDF2-HMAC-SHA256, per-user salt, constant-time compare.
"""
import base64
import hashlib
import hmac
import json
import re
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Header, HTTPException, Request, Response

from .. import config, db

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PBKDF2_ITERATIONS = 260_000
MIN_PASSWORD_LENGTH = 8


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------
def _hash_password(password: str, salt: bytes = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"{salt.hex()}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, _ = stored.split("$", 1)
    except ValueError:
        return False
    return hmac.compare_digest(_hash_password(password, bytes.fromhex(salt_hex)), stored)


# ---------------------------------------------------------------------------
# Token primitives
# ---------------------------------------------------------------------------
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sign(body: str) -> str:
    return _b64(hmac.new(config.AUTH_SECRET_KEY.encode("utf-8"),
                         body.encode("utf-8"), hashlib.sha256).digest())


def _issue(payload: dict) -> str:
    body = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{body}.{_sign(body)}"


def _decode(token: str, expected_type: str) -> dict:
    """Verify signature, expiry and token type. Raises 401 on any problem."""
    try:
        body, sig = token.split(".", 1)
        if not hmac.compare_digest(sig, _sign(body)):
            raise ValueError("bad signature")
        payload = json.loads(_b64_decode(body))
    except Exception:
        raise HTTPException(401, "Invalid authentication token")
    if payload.get("typ") != expected_type:
        # Stops a refresh token being replayed as an access token and vice versa.
        raise HTTPException(401, "Wrong token type")
    if payload.get("exp", 0) < time.time():
        raise HTTPException(401, "Token has expired")
    return payload


def _now():
    return datetime.now(timezone.utc)


def issue_access_token(user: dict) -> str:
    return _issue({
        "typ": "access",
        "uid": user["id"],
        "email": user["email"],
        "display_name": user.get("display_name") or user["email"],
        "role": user["role"],
        "exp": int(time.time()) + config.ACCESS_TOKEN_TTL_MINUTES * 60,
    })


def issue_refresh_token(user: dict) -> str:
    """Mint a refresh token and record its hash so it can be revoked."""
    jti = uuid.uuid4().hex
    expires = _now() + timedelta(days=config.REFRESH_TOKEN_TTL_DAYS)
    token = _issue({"typ": "refresh", "uid": user["id"], "jti": jti,
                    "exp": int(expires.timestamp())})
    with db.session() as conn:
        conn.execute(
            "INSERT INTO refresh_tokens(jti,user_id,token_hash,issued_at,expires_at) "
            "VALUES(?,?,?,?,?)",
            (jti, user["id"], hashlib.sha256(token.encode()).hexdigest(),
             _now().isoformat(), expires.isoformat()),
        )
    return token


def rotate_refresh_token(token: str) -> tuple[dict, str]:
    """Validate a refresh token, revoke it, and issue a replacement.

    Rotation limits the value of a stolen token to a single use.
    """
    payload = _decode(token, "refresh")
    row = db.query_one("SELECT * FROM refresh_tokens WHERE jti=?", (payload["jti"],))
    if not row:
        raise HTTPException(401, "Refresh token is not recognised")
    if row["revoked_at"]:
        raise HTTPException(401, "Refresh token has been revoked")
    # The signature already proves authenticity; comparing the stored hash also
    # catches a token whose row was tampered with or re-pointed to another user.
    if not hmac.compare_digest(row["token_hash"], hashlib.sha256(token.encode()).hexdigest()):
        raise HTTPException(401, "Refresh token mismatch")

    user = db.query_one("SELECT * FROM users WHERE id=?", (payload["uid"],))
    if not user:
        raise HTTPException(401, "Account no longer exists")

    revoke_refresh_token(payload["jti"])
    return user, issue_refresh_token(user)


def revoke_refresh_token(jti: str) -> None:
    with db.session() as conn:
        conn.execute("UPDATE refresh_tokens SET revoked_at=? WHERE jti=? AND revoked_at IS NULL",
                     (_now().isoformat(), jti))


def revoke_all_for_user(user_id: int) -> int:
    with db.session() as conn:
        cur = conn.execute(
            "UPDATE refresh_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
            (_now().isoformat(), user_id))
        return cur.rowcount


def purge_expired_tokens() -> int:
    """Housekeeping so the table does not grow without bound."""
    with db.session() as conn:
        cur = conn.execute("DELETE FROM refresh_tokens WHERE expires_at < ?", (_now().isoformat(),))
        return cur.rowcount


# ---------------------------------------------------------------------------
# CSRF (double-submit cookie)
# ---------------------------------------------------------------------------
# Only the cookie-bearing endpoints need this. Normal API calls authenticate with
# a bearer header, which a cross-site form cannot set, so they are not
# CSRF-exploitable and are deliberately left alone.
def issue_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def verify_csrf(request: Request) -> None:
    cookie = request.cookies.get(config.CSRF_COOKIE_NAME)
    header = request.headers.get(config.CSRF_HEADER_NAME)
    if not cookie or not header or not hmac.compare_digest(cookie, header):
        raise HTTPException(403, "CSRF token missing or invalid")


def set_auth_cookies(response: Response, refresh_token: str, csrf_token: str) -> None:
    response.set_cookie(
        config.REFRESH_COOKIE_NAME, refresh_token,
        httponly=True,                       # unreadable from JavaScript
        secure=config.COOKIE_SECURE,
        samesite=config.COOKIE_SAMESITE,
        path=config.REFRESH_COOKIE_PATH,     # not sent on ordinary API calls
        max_age=config.REFRESH_TOKEN_TTL_DAYS * 86400,
    )
    response.set_cookie(
        config.CSRF_COOKIE_NAME, csrf_token,
        httponly=False,                      # the SPA must read this to echo it back
        secure=config.COOKIE_SECURE,
        samesite=config.COOKIE_SAMESITE,
        path="/",
        max_age=config.REFRESH_TOKEN_TTL_DAYS * 86400,
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(config.REFRESH_COOKIE_NAME, path=config.REFRESH_COOKIE_PATH)
    response.delete_cookie(config.CSRF_COOKIE_NAME, path="/")


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------
def signup(display_name: str, email: str, password: str) -> dict:
    display_name = (display_name or "").strip()
    email = (email or "").strip().lower()
    if len(display_name) < 2:
        raise HTTPException(422, "Operator name must be at least 2 characters")
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Invalid email address")
    if len(password or "") < MIN_PASSWORD_LENGTH:
        raise HTTPException(422, f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
    if db.query_one("SELECT 1 FROM users WHERE email=?", (email,)):
        raise HTTPException(409, "An account with this email already exists")

    # Role is decided here, server-side, from configuration — never from the
    # request body, or anyone could sign up as an admin.
    role = "admin" if email in config.ADMIN_EMAILS else config.DEFAULT_ROLE
    with db.session() as conn:
        conn.execute(
            "INSERT INTO users(display_name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)",
            (display_name, email, _hash_password(password), role, _now().isoformat()),
        )
    user = db.query_one("SELECT * FROM users WHERE email=?", (email,))
    db.audit(email, "SIGNUP", {"role": role})
    return user


def login(email: str, password: str) -> dict:
    email = (email or "").strip().lower()
    user = db.query_one("SELECT * FROM users WHERE email=?", (email,))
    # Hash even when the user is missing, so response time doesn't reveal which
    # emails exist.
    if not user:
        _hash_password(password or "")
        raise HTTPException(401, "Incorrect email or password")
    if not _verify_password(password or "", user["password_hash"]):
        db.audit(email, "LOGIN_FAILED", {})
        raise HTTPException(401, "Incorrect email or password")
    db.audit(email, "LOGIN", {"role": user["role"]})
    return user


def public_user(user: dict) -> dict:
    """Never return password_hash to a client."""
    return {"id": user["id"],
            "display_name": user.get("display_name") or user["email"],
            "email": user["email"], "role": user["role"],
            "created_at": user["created_at"]}


# ---------------------------------------------------------------------------
# Request-time identity
# ---------------------------------------------------------------------------
def get_current_user(authorization: str = Header(default=None)) -> dict:
    """FastAPI dependency: resolves the caller from the bearer access token.

    The role is read from the signed token, never from a client-supplied field.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Not authenticated")
    payload = _decode(authorization.split(" ", 1)[1].strip(), "access")
    return {"id": payload["uid"], "email": payload["email"],
            "display_name": payload.get("display_name") or payload["email"],
            "role": payload.get("role", config.DEFAULT_ROLE)}
