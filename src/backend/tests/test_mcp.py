"""
Phase 5: MCP tool security.

These are the tests that matter most in the whole suite. Everything else here
protects data; these protect against the AI being talked into doing something.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from backend import config, db
from backend.main import app
from backend.services import auth as auth_svc, mcp

config.RATE_LIMIT_ENABLED = False
if hasattr(app.state, "limiter"):
    app.state.limiter.enabled = False

client = TestClient(app)


def _token(role="operator"):
    email = f"mcp-{uuid.uuid4().hex[:10]}@example.com"
    auth_svc.signup(f"MCP {role}", email, "password123")
    if role != config.DEFAULT_ROLE:
        with db.session() as conn:
            conn.execute("UPDATE users SET role=? WHERE email=?", (role, email))
    r = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def tokens():
    return {r: _token(r) for r in ("admin", "operator", "crew")}


# ---------------------------------------------------------------------------
# Allowlist
# ---------------------------------------------------------------------------
def test_unknown_tool_is_refused_not_resolved(tokens):
    """The registry is an allowlist; a name it does not contain is never looked
    up some other way."""
    r = client.post("/api/mcp/call",
                    json={"tool": "drop_all_tables", "arguments": {}},
                    headers=_h(tokens["admin"]))
    assert r.status_code == 404


@pytest.mark.parametrize("evil", [
    "__import__", "eval", "exec", "os.system", "db.query",
    "../../etc/passwd", "get_asset_status; DROP TABLE assets",
])
def test_injection_shaped_tool_names_are_refused(tokens, evil):
    r = client.post("/api/mcp/call", json={"tool": evil, "arguments": {}},
                    headers=_h(tokens["admin"]))
    assert r.status_code == 404, f"{evil} was not refused"


def test_undeclared_arguments_are_rejected(tokens):
    """Stops an extra argument being smuggled through to the service layer."""
    r = client.post("/api/mcp/call",
                    json={"tool": "get_risk_summary", "arguments": {"limit": 5, "sql": "DROP"}},
                    headers=_h(tokens["operator"]))
    assert r.status_code == 422
    assert "unexpected argument" in r.json()["error"]["message"].lower()


def test_arguments_are_type_checked_and_bounded(tokens):
    r = client.post("/api/mcp/call",
                    json={"tool": "get_risk_summary", "arguments": {"limit": "not-a-number"}},
                    headers=_h(tokens["operator"]))
    assert r.status_code == 422

    # Out-of-range values are clamped rather than passed through to the query.
    r = client.post("/api/mcp/call",
                    json={"tool": "get_risk_summary", "arguments": {"limit": 100000}},
                    headers=_h(tokens["operator"]))
    assert r.status_code == 200
    assert len(r.json()["result"]) <= 50


def test_enum_values_are_enforced(tokens):
    r = client.post("/api/mcp/call",
                    json={"tool": "simulate_weather_event",
                          "arguments": {"area_id": "NORTH-04", "event": "apocalyptic"}},
                    headers=_h(tokens["operator"]))
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------
def test_anonymous_callers_get_nothing(tokens):
    assert client.get("/api/mcp/tools").status_code == 401
    assert client.post("/api/mcp/call",
                       json={"tool": "get_risk_summary", "arguments": {}}).status_code == 401


def test_tool_list_is_scoped_to_the_callers_role(tokens):
    crew = {t["name"] for t in client.get("/api/mcp/tools", headers=_h(tokens["crew"])).json()["tools"]}
    operator = {t["name"] for t in client.get("/api/mcp/tools", headers=_h(tokens["operator"])).json()["tools"]}
    # A crew member is never even shown the dispatch tool.
    assert "assign_crew" not in crew
    assert "assign_crew" in operator
    assert crew < operator


def test_crew_cannot_execute_a_tool_it_was_not_offered(tokens):
    """Not being shown a tool is cosmetic; being refused it is the control."""
    r = client.post("/api/mcp/call",
                    json={"tool": "assign_crew", "arguments": {"asset_id": "T-1024"}},
                    headers=_h(tokens["crew"]))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Human confirmation for mutating actions
# ---------------------------------------------------------------------------
def test_mutating_tool_refuses_to_run_without_confirmation(tokens):
    r = client.post("/api/mcp/call",
                    json={"tool": "assign_crew", "arguments": {"asset_id": "T-1024"}},
                    headers=_h(tokens["operator"]))
    assert r.status_code == 428, "a crew could be dispatched on inference alone"


def test_read_only_tools_need_no_confirmation(tokens):
    r = client.post("/api/mcp/call",
                    json={"tool": "get_risk_summary", "arguments": {"limit": 3}},
                    headers=_h(tokens["operator"]))
    assert r.status_code == 200 and r.json()["write"] is False


def test_confirmation_token_is_single_use_and_bound_to_its_action(tokens):
    args = {"asset_id": "T-1024"}
    conf = client.post("/api/mcp/confirm",
                       json={"tool": "assign_crew", "arguments": args},
                       headers=_h(tokens["operator"]))
    assert conf.status_code == 200
    token = conf.json()["confirmation_token"]

    # Same token, different arguments: must not authorise a different dispatch.
    swapped = client.post("/api/mcp/call",
                          json={"tool": "assign_crew", "arguments": {"asset_id": "SS-4004"},
                                "confirmation_token": token},
                          headers=_h(tokens["operator"]))
    assert swapped.status_code == 403

    # Same token, different tool: likewise.
    other = client.post("/api/mcp/call",
                        json={"tool": "mark_asset_resolved",
                              "arguments": {"wo_id": "WO-NOPE"},
                              "confirmation_token": token},
                        headers=_h(tokens["operator"]))
    assert other.status_code in (403, 404)

    # Correct use consumes it (200 on success, 409 if no crew is free — both
    # mean it got past the confirmation gate).
    first = client.post("/api/mcp/call",
                        json={"tool": "assign_crew", "arguments": args,
                              "confirmation_token": token},
                        headers=_h(tokens["operator"]))
    assert first.status_code in (200, 409)

    # Replaying it must not work.
    replay = client.post("/api/mcp/call",
                         json={"tool": "assign_crew", "arguments": args,
                               "confirmation_token": token},
                         headers=_h(tokens["operator"]))
    assert replay.status_code == 428


def test_confirmation_cannot_be_used_by_a_different_user(tokens):
    conf = client.post("/api/mcp/confirm",
                       json={"tool": "assign_crew", "arguments": {"asset_id": "T-1024"}},
                       headers=_h(tokens["operator"]))
    token = conf.json()["confirmation_token"]
    hijack = client.post("/api/mcp/call",
                         json={"tool": "assign_crew", "arguments": {"asset_id": "T-1024"},
                               "confirmation_token": token},
                         headers=_h(tokens["admin"]))
    assert hijack.status_code == 403


def test_crew_cannot_obtain_a_confirmation_it_is_not_entitled_to(tokens):
    r = client.post("/api/mcp/confirm",
                    json={"tool": "assign_crew", "arguments": {"asset_id": "T-1024"}},
                    headers=_h(tokens["crew"]))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------
def test_successful_calls_are_audited(tokens):
    client.post("/api/mcp/call", json={"tool": "get_area_risk", "arguments": {}},
                headers=_h(tokens["operator"]))
    row = db.query_one("SELECT * FROM audit_log WHERE action='mcp_tool_call' ORDER BY id DESC LIMIT 1")
    assert row and row["detail"]["tool"] == "get_area_risk"
    assert row["detail"]["authorized"] is True
    assert row["detail"]["outcome"] == "ok"


def test_refused_calls_are_also_audited(tokens):
    """A blocked attempt is the entry you most want to find later."""
    client.post("/api/mcp/call", json={"tool": "assign_crew", "arguments": {"asset_id": "T-1024"}},
                headers=_h(tokens["crew"]))
    row = db.query_one("SELECT * FROM audit_log WHERE action='mcp_tool_call' ORDER BY id DESC LIMIT 1")
    assert row["detail"]["authorized"] is False
    assert row["detail"]["outcome"] == "denied"


def test_registry_has_no_unclassified_tool():
    """Every tool must declare its roles and whether it writes — a missing flag
    would default a mutating tool into the unconfirmed path."""
    for name, spec in mcp.TOOLS.items():
        assert isinstance(spec.get("write"), bool), f"{name} has no write classification"
        assert spec.get("roles"), f"{name} has no role restriction"
        assert set(spec["roles"]) <= set(config.ROLES), f"{name} names an unknown role"
        assert spec.get("description"), f"{name} has no description"
        if spec["write"]:
            assert "crew" not in spec["roles"] or name == "mark_asset_resolved"


# ---------------------------------------------------------------------------
# The copilot must not become a second, unconfirmed route to mutations
# ---------------------------------------------------------------------------
def test_copilot_tools_are_all_read_only():
    """The copilot runs tools on the model's say-so with no confirmation step,
    so every tool reachable from it must be incapable of writing."""
    from backend.services import copilot
    writing = {n for n, spec in mcp.TOOLS.items() if spec["write"]}
    assert not (set(copilot.READ_ONLY_TOOLS) & writing), (
        "a mutating tool is reachable from the copilot without confirmation")


def test_copilot_refuses_a_tool_outside_its_allowlist():
    from backend.services import copilot
    out = copilot._run_tool("assign_crew", {"asset_id": "T-1024"})
    assert isinstance(out, dict) and "error" in out
    row = db.query_one("SELECT * FROM audit_log WHERE action='tool_refused' ORDER BY id DESC LIMIT 1")
    assert row and row["detail"]["tool"] == "assign_crew"
