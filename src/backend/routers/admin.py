"""
Admin-only management endpoints.

Security:
Every endpoint in this router is guarded by `require_admin`, which resolves the
role from the signed, HMAC-verified access token. Operators and crew accounts
are refused with HTTP 403 Forbidden.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import db, config
from ..deps import require_admin
from ..services.operations import SECURITY_ACTIONS

router = APIRouter()

ADMIN_ACTIONS = {
    "ADMIN_ROLE_CHANGE",
    "ADMIN_REVOKE_SESSIONS",
    "ADMIN_DELETE_USER",
    "ROLE_CHANGE",
    "ADMIN_APPROVE_ACCESS",
    "ADMIN_REJECT_ACCESS",
}


class UpdateRoleRequest(BaseModel):
    role: str = Field(..., description="Role to assign: admin, operator, or crew")


def _now():
    return datetime.now(timezone.utc)


@router.get("/stats")
def get_admin_stats(current=Depends(require_admin)):
    """Admin-only high-level security & user overview metrics."""
    now_iso = _now().isoformat()
    yesterday_iso = (_now() - timedelta(hours=24)).isoformat()
    week_ago_iso = (_now() - timedelta(days=7)).isoformat()

    total_users = db.query_one("SELECT count(*) as count FROM users")["count"]

    role_counts = {"admin": 0, "operator": 0, "crew": 0}
    for row in db.query("SELECT role, count(*) as count FROM users GROUP BY role"):
        if row["role"] in role_counts:
            role_counts[row["role"]] = row["count"]

    # Active (non-expired, non-revoked) refresh token count
    active_sessions = db.query_one(
        "SELECT count(*) as count FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > ?",
        (now_iso,),
    )["count"]

    # Failed login attempts in last 24h
    failed_logins = db.query_one(
        "SELECT count(*) as count FROM audit_log WHERE action='LOGIN_FAILED' AND ts >= ?",
        (yesterday_iso,),
    )["count"]

    # New signups in last 7 days
    new_signups = db.query_one(
        "SELECT count(*) as count FROM users WHERE created_at >= ?",
        (week_ago_iso,),
    )["count"]

    # Pending operator access requests
    pending_requests = db.query_one(
        "SELECT count(*) as count FROM users WHERE status='pending'",
    )["count"]

    # Overall system security status
    status = "ELEVATED_RISK" if failed_logins >= 5 else "NORMAL"

    return {
        "total_users": total_users,
        "admins_count": role_counts["admin"],
        "operators_count": role_counts["operator"],
        "crews_count": role_counts["crew"],
        "active_sessions_count": active_sessions,
        "failed_logins_24h": failed_logins,
        "signups_7d": new_signups,
        "pending_requests_count": pending_requests,
        "security_status": status,
    }


@router.get("/requests")
def list_access_requests(current=Depends(require_admin)):
    """List all accounts pending operator access approval."""
    rows = db.query(
        "SELECT id, email, display_name, role, COALESCE(status, 'pending') as status, created_at "
        "FROM users WHERE status='pending' ORDER BY created_at DESC"
    )
    return [
        {
            "id": r["id"],
            "email": r["email"],
            "display_name": r.get("display_name") or r["email"].split("@")[0],
            "role": r["role"],
            "status": r["status"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


@router.post("/requests/{user_id}/approve")
def approve_access_request(user_id: int, current=Depends(require_admin)):
    """Approve a pending operator access request."""
    target = db.query_one("SELECT * FROM users WHERE id=?", (user_id,))
    if not target:
        raise HTTPException(404, f"User {user_id} not found")
    with db.session() as conn:
        conn.execute("UPDATE users SET status='approved' WHERE id=?", (user_id,))

    db.audit(
        current["email"],
        "ADMIN_APPROVE_ACCESS",
        {
            "target_user_id": user_id,
            "target_email": target["email"],
            "role": target["role"],
        },
    )
    return {
        "success": True,
        "message": f"Approved operator access for {target['email']}",
        "user_id": user_id,
        "status": "approved",
    }


@router.post("/requests/{user_id}/reject")
def reject_access_request(user_id: int, current=Depends(require_admin)):
    """Reject and remove a pending operator access request."""
    target = db.query_one("SELECT * FROM users WHERE id=?", (user_id,))
    if not target:
        raise HTTPException(404, f"User {user_id} not found")

    with db.session() as conn:
        conn.execute("DELETE FROM refresh_tokens WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM users WHERE id=?", (user_id,))

    db.audit(
        current["email"],
        "ADMIN_REJECT_ACCESS",
        {
            "target_user_id": user_id,
            "target_email": target["email"],
            "role": target["role"],
        },
    )
    return {
        "success": True,
        "message": f"Rejected and removed access request for {target['email']}",
        "user_id": user_id,
    }


@router.get("/users")
def list_users(current=Depends(require_admin)):
    """List all accounts with their active session counts and last observed activity."""
    now_iso = _now().isoformat()
    users = db.query("SELECT id, email, display_name, role, COALESCE(status, 'approved') as status, created_at FROM users ORDER BY id ASC")

    # Get active session counts grouped by user_id
    sessions_by_user = {}
    for r in db.query(
        "SELECT user_id, count(*) as cnt FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > ? GROUP BY user_id",
        (now_iso,),
    ):
        sessions_by_user[r["user_id"]] = r["cnt"]

    # Get last activity timestamp grouped by actor (email)
    activity_by_email = {}
    for r in db.query("SELECT actor, max(ts) as last_ts FROM audit_log GROUP BY actor"):
        activity_by_email[r["actor"]] = r["last_ts"]

    out = []
    for u in users:
        out.append({
            "id": u["id"],
            "email": u["email"],
            "display_name": u.get("display_name") or u["email"].split("@")[0],
            "role": u["role"],
            "status": u["status"],
            "created_at": u["created_at"],
            "active_sessions": sessions_by_user.get(u["id"], 0),
            "last_activity": activity_by_email.get(u["email"]),
            "is_self": u["id"] == current["id"],
        })
    return out


@router.patch("/users/{user_id}/role")
def update_user_role(user_id: int, body: UpdateRoleRequest, current=Depends(require_admin)):
    """Promote or demote a user account."""
    new_role = body.role.strip().lower()
    if new_role not in config.ROLES:
        raise HTTPException(422, f"Invalid role '{new_role}'. Allowed: {', '.join(config.ROLES)}")

    target = db.query_one("SELECT * FROM users WHERE id=?", (user_id,))
    if not target:
        raise HTTPException(404, f"User {user_id} not found")

    # Prevent demoting the last remaining admin
    if target["role"] == "admin" and new_role != "admin":
        other_admins = db.query_one("SELECT count(*) as cnt FROM users WHERE role='admin' AND id != ?", (user_id,))["cnt"]
        if other_admins == 0:
            raise HTTPException(400, "Cannot demote the only remaining administrator in the system.")

    old_role = target["role"]
    with db.session() as conn:
        conn.execute("UPDATE users SET role=?, status='approved' WHERE id=?", (new_role, user_id))

    db.audit(
        current["email"],
        "ADMIN_ROLE_CHANGE",
        {
            "target_user_id": user_id,
            "target_email": target["email"],
            "old_role": old_role,
            "new_role": new_role,
        },
    )

    updated = db.query_one("SELECT id, email, display_name, role, status, created_at FROM users WHERE id=?", (user_id,))
    return {
        "message": f"Updated role for {target['email']} to {new_role}",
        "user": dict(updated),
    }


@router.post("/users/{user_id}/revoke-sessions")
def revoke_user_sessions(user_id: int, current=Depends(require_admin)):
    """Immediately invalidate all active refresh tokens for the given user."""
    target = db.query_one("SELECT * FROM users WHERE id=?", (user_id,))
    if not target:
        raise HTTPException(404, f"User {user_id} not found")

    now_iso = _now().isoformat()
    with db.session() as conn:
        cursor = conn.execute(
            "UPDATE refresh_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
            (now_iso, user_id),
        )
        revoked_count = cursor.rowcount

    db.audit(
        current["email"],
        "ADMIN_REVOKE_SESSIONS",
        {"target_user_id": user_id, "target_email": target["email"], "revoked_count": revoked_count},
    )

    return {
        "success": True,
        "message": f"Revoked {revoked_count} active session(s) for {target['email']}",
        "sessions_revoked": revoked_count,
    }


@router.delete("/users/{user_id}")
def delete_user(user_id: int, current=Depends(require_admin)):
    """Remove a user account and invalidate their tokens."""
    if user_id == current["id"]:
        raise HTTPException(400, "Cannot delete your own administrator account.")

    target = db.query_one("SELECT * FROM users WHERE id=?", (user_id,))
    if not target:
        raise HTTPException(404, f"User {user_id} not found")

    if target["role"] == "admin":
        other_admins = db.query_one("SELECT count(*) as cnt FROM users WHERE role='admin' AND id != ?", (user_id,))["cnt"]
        if other_admins == 0:
            raise HTTPException(400, "Cannot delete the only remaining administrator.")

    with db.session() as conn:
        conn.execute("DELETE FROM refresh_tokens WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM users WHERE id=?", (user_id,))

    db.audit(
        current["email"],
        "ADMIN_DELETE_USER",
        {"target_user_id": user_id, "target_email": target["email"], "role": target["role"]},
    )

    return {
        "success": True,
        "message": f"User {target['email']} successfully deleted",
    }


@router.get("/audit")
def get_admin_audit_log(
    limit: int = Query(default=100, ge=1, le=500),
    category: Literal["all", "security", "operations", "admin"] = "all",
    search: Optional[str] = None,
    current=Depends(require_admin),
):
    """Full security, operational, and admin audit trail with categorization."""
    params = []
    conditions = []

    if category == "security":
        placeholders = ",".join("?" * len(SECURITY_ACTIONS))
        conditions.append(f"action IN ({placeholders})")
        params.extend(SECURITY_ACTIONS)
    elif category == "admin":
        placeholders = ",".join("?" * len(ADMIN_ACTIONS))
        conditions.append(f"action IN ({placeholders})")
        params.extend(ADMIN_ACTIONS)
    elif category == "operations":
        excluded = list(SECURITY_ACTIONS) + list(ADMIN_ACTIONS)
        placeholders = ",".join("?" * len(excluded))
        conditions.append(f"action NOT IN ({placeholders})")
        params.extend(excluded)

    if search:
        s = f"%{search.strip().lower()}%"
        conditions.append("(lower(actor) LIKE ? OR lower(action) LIKE ? OR lower(detail) LIKE ?)")
        params.extend([s, s, s])

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"SELECT id, ts, actor, action, detail FROM audit_log {where_clause} ORDER BY id DESC LIMIT ?"
    params.append(limit)

    rows = db.query(sql, tuple(params))
    out = []
    for r in rows:
        action = r["action"]
        if action in SECURITY_ACTIONS:
            cat = "security"
        elif action in ADMIN_ACTIONS:
            cat = "admin"
        else:
            cat = "operations"

        out.append({
            "id": r["id"],
            "ts": r["ts"],
            "actor": r["actor"],
            "action": action,
            "category": cat,
            "detail": r["detail"],
        })
    return out
