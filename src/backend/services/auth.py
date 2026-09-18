"""
Minimal operator login/signup.

No external auth dependency (passlib/pyjwt/etc.) — stdlib only, matching the
rest of this project's zero-extra-infra philosophy:
  - passwords: PBKDF2-HMAC-SHA256 (hashlib), random per-user salt
  - sessions: a stateless signed token (HMAC-SHA256 over payload), not a DB
    session table — nothing to clean up, verification is just a signature check

Role model is intentionally minimal: every signup is 'operator' unless
ROLE_ADMIN_EMAILS names them an admin. There is no per-page permission
matrix in this app, so a single role flag is enough to tag who did what in
the audit log and to gate admin-only actions later if needed.
"""
import base64
import hashlib
import hmac
import json
import re
import secrets
import time

from fastapi import Header, HTTPException

from .. import config, db

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PBKDF2_ITERATIONS = 260_000


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


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def issue_token(user: dict) -> str:
    payload = {
        "uid": user["id"], "email": user["email"], "role": user["role"],
        "exp": int(time.time()) + config.AUTH_TOKEN_TTL_HOURS * 3600,
    }
    body = _b64(json.dumps(payload).encode("utf-8"))
    sig = _b64(hmac.new(config.AUTH_SECRET_KEY.encode("utf-8"), body.encode("utf-8"),
                        hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify_token(token: str) -> dict:
    try:
        body, sig = token.split(".", 1)
        expected = _b64(hmac.new(config.AUTH_SECRET_KEY.encode("utf-8"), body.encode("utf-8"),
                                 hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            raise ValueError("bad signature")
        payload = json.loads(_b64_decode(body))
        if payload["exp"] < time.time():
            raise ValueError("expired")
        return payload
    except Exception:
        raise HTTPException(401, "Invalid or expired session token")


def signup(email: str, password: str) -> dict:
    email = email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Invalid email address")
    if len(password) < 8:
        raise HTTPException(422, "Password must be at least 8 characters")
    if db.query_one("SELECT 1 FROM users WHERE email=?", (email,)):
        raise HTTPException(409, "An account with this email already exists")
    from datetime import datetime, timezone
    with db.session() as conn:
        conn.execute(
            "INSERT INTO users(email, password_hash, role, created_at) VALUES(?,?,?,?)",
            (email, _hash_password(password), "operator", datetime.now(timezone.utc).isoformat()),
        )
    user = db.query_one("SELECT * FROM users WHERE email=?", (email,))
    db.audit(email, "SIGNUP", {"role": user["role"]})
    return user


def login(email: str, password: str) -> dict:
    email = email.strip().lower()
    user = db.query_one("SELECT * FROM users WHERE email=?", (email,))
    if not user or not _verify_password(password, user["password_hash"]):
        raise HTTPException(401, "Incorrect email or password")
    db.audit(email, "LOGIN", {})
    return user


def get_current_user(authorization: str = Header(default=None)) -> dict:
    """FastAPI dependency: Depends(auth.get_current_user) on any route that
    needs to know who's calling. Expects `Authorization: Bearer <token>`."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    return verify_token(authorization.split(" ", 1)[1].strip())


def get_user_by_id(user_id: int) -> dict:
    user = db.query_one("SELECT * FROM users WHERE id=?", (user_id,))
    if not user:
        raise HTTPException(404, "User not found")
    return user


def update_profile(
    user_id: int,
    display_name: str = None,
    title: str = None,
    department: str = None,
    phone: str = None,
    current_password: str = None,
    new_password: str = None,
) -> dict:
    user = get_user_by_id(user_id)
    updates = []
    params = []

    if display_name is not None:
        updates.append("display_name=?")
        params.append(display_name.strip())
    if title is not None:
        updates.append("title=?")
        params.append(title.strip())
    if department is not None:
        updates.append("department=?")
        params.append(department.strip())
    if phone is not None:
        updates.append("phone=?")
        params.append(phone.strip())

    if new_password:
        if not current_password:
            raise HTTPException(400, "Current password is required to set a new password")
        if not _verify_password(current_password, user["password_hash"]):
            raise HTTPException(400, "Incorrect current password")
        if len(new_password) < 8:
            raise HTTPException(422, "New password must be at least 8 characters")
        updates.append("password_hash=?")
        params.append(_hash_password(new_password))

    if updates:
        params.append(user_id)
        with db.session() as conn:
            conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id=?", params)
        db.audit(user["email"], "UPDATE_PROFILE", {"updated_fields": [u.split("=")[0] for u in updates]})

    return get_user_by_id(user_id)


def public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "role": user["role"],
        "display_name": user.get("display_name") or user["email"].split("@")[0],
        "title": user.get("title") or "Grid Operator",
        "department": user.get("department") or "RC4 Operations",
        "phone": user.get("phone") or "",
        "created_at": user["created_at"],
    }
