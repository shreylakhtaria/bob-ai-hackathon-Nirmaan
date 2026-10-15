"""
Admin Router Tests: RBAC, User Management, Session Revocation, and Audit.
"""
import uuid
import pytest
from fastapi.testclient import TestClient

from backend import config, db
from backend.main import app
from backend.services import auth as auth_svc

config.RATE_LIMIT_ENABLED = False
if hasattr(app.state, "limiter"):
    app.state.limiter.enabled = False

client = TestClient(app)


def _mk_user(role="operator"):
    email = f"admintest-{uuid.uuid4().hex[:10]}@example.com"
    password = "password123"
    auth_svc.signup(f"Test {role}", email, password, status="approved")
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


@pytest.fixture(scope="module")
def tokens():
    out = {}
    for role in ("admin", "operator", "crew"):
        email, pw = _mk_user(role)
        out[role] = _login(email, pw)["access_token"]
    return out


def test_admin_routes_refuse_anonymous_and_non_admin(tokens):
    endpoints = [
        "/api/admin/stats",
        "/api/admin/users",
        "/api/admin/audit",
    ]
    for path in endpoints:
        # Anonymous -> 401
        assert client.get(path).status_code == 401
        # Operator -> 403
        assert client.get(path, headers=_auth(tokens["operator"])).status_code == 403
        # Crew -> 403
        assert client.get(path, headers=_auth(tokens["crew"])).status_code == 403
        # Admin -> 200
        assert client.get(path, headers=_auth(tokens["admin"])).status_code == 200


def test_admin_list_users_and_stats(tokens):
    r_stats = client.get("/api/admin/stats", headers=_auth(tokens["admin"]))
    assert r_stats.status_code == 200
    data = r_stats.json()
    assert data["total_users"] >= 3
    assert data["admins_count"] >= 1
    assert "security_status" in data

    r_users = client.get("/api/admin/users", headers=_auth(tokens["admin"]))
    assert r_users.status_code == 200
    users = r_users.json()
    assert isinstance(users, list)
    assert any(u["role"] == "admin" for u in users)


def test_admin_update_role_and_revoke_sessions(tokens):
    # Create a fresh operator
    op_email, op_pw = _mk_user("operator")
    op_user = db.query_one("SELECT * FROM users WHERE email=?", (op_email,))
    user_id = op_user["id"]

    # Operator cannot promote
    assert client.patch(
        f"/api/admin/users/{user_id}/role",
        json={"role": "admin"},
        headers=_auth(tokens["operator"]),
    ).status_code == 403

    # Admin promotes operator -> admin
    r_promote = client.patch(
        f"/api/admin/users/{user_id}/role",
        json={"role": "admin"},
        headers=_auth(tokens["admin"]),
    )
    assert r_promote.status_code == 200
    assert r_promote.json()["user"]["role"] == "admin"

    # Revoke sessions
    r_revoke = client.post(
        f"/api/admin/users/{user_id}/revoke-sessions",
        headers=_auth(tokens["admin"]),
    )
    assert r_revoke.status_code == 200
    assert r_revoke.json()["success"] is True


def test_admin_audit_filtering(tokens):
    r_audit = client.get("/api/admin/audit?category=all&limit=20", headers=_auth(tokens["admin"]))
    assert r_audit.status_code == 200
    logs = r_audit.json()
    assert isinstance(logs, list)
    if logs:
        assert "category" in logs[0]
        assert "actor" in logs[0]


def test_operator_signup_pending_approval_and_admin_actions(tokens):
    # 1. New operator registers
    op_email = f"pending-op-{uuid.uuid4().hex[:8]}@example.com"
    r_signup = client.post("/api/auth/signup", json={
        "display_name": "New Candidate",
        "email": op_email,
        "password": "password123",
    })
    assert r_signup.status_code == 200
    reg_body = r_signup.json()
    assert reg_body["user"]["status"] == "pending"
    assert reg_body["user"]["role"] == "operator"
    op_token = reg_body["access_token"]
    op_id = reg_body["user"]["id"]

    # 2. Candidate has access to auth/me to see pending status
    r_me = client.get("/api/auth/me", headers=_auth(op_token))
    assert r_me.status_code == 200
    assert r_me.json()["status"] == "pending"

    # 3. But operational console endpoints refuse pending operator with 403
    r_action = client.get("/api/assets", headers=_auth(op_token))
    assert r_action.status_code == 403
    assert "pending administrator approval" in r_action.json()["error"]["message"]

    # 4. Admin sees the request in GET /api/admin/requests
    r_reqs = client.get("/api/admin/requests", headers=_auth(tokens["admin"]))
    assert r_reqs.status_code == 200
    pending_list = r_reqs.json()
    matching = [r for r in pending_list if r["id"] == op_id]
    assert len(matching) == 1
    assert matching[0]["email"] == op_email
    assert matching[0]["status"] == "pending"

    # 5. Admin stats report pending_requests_count
    r_stats = client.get("/api/admin/stats", headers=_auth(tokens["admin"]))
    assert r_stats.status_code == 200
    assert r_stats.json()["pending_requests_count"] >= 1

    # 6. Admin approves operator
    r_approve = client.post(f"/api/admin/requests/{op_id}/approve", headers=_auth(tokens["admin"]))
    assert r_approve.status_code == 200
    assert r_approve.json()["status"] == "approved"

    # 7. Operator now succeeds on auth/me and operational routes
    r_me_approved = client.get("/api/auth/me", headers=_auth(op_token))
    assert r_me_approved.status_code == 200
    assert r_me_approved.json()["status"] == "approved"

    r_action_allowed = client.get("/api/assets", headers=_auth(op_token))
    assert r_action_allowed.status_code == 200

    # 8. Rejection flow test
    rej_email = f"rej-op-{uuid.uuid4().hex[:8]}@example.com"
    r_rej_signup = client.post("/api/auth/signup", json={
        "display_name": "Rejected Candidate",
        "email": rej_email,
        "password": "password123",
    })
    rej_id = r_rej_signup.json()["user"]["id"]
    r_reject = client.post(f"/api/admin/requests/{rej_id}/reject", headers=_auth(tokens["admin"]))
    assert r_reject.status_code == 200

    # User no longer in requests or users
    assert db.query_one("SELECT * FROM users WHERE id=?", (rej_id,)) is None
