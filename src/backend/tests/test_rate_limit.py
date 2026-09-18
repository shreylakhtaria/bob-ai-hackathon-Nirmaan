import pytest
from fastapi.testclient import TestClient

from backend import config
from backend.main import app, limiter


def test_repeated_failed_logins_are_throttled():
    """An unlimited login endpoint is a free password-guessing oracle."""
    pytest.importorskip("slowapi")
    config.RATE_LIMIT_ENABLED = True
    client = TestClient(app)
    if limiter is not None:
        if hasattr(limiter, "_enabled"):
            limiter._enabled = True
        if hasattr(limiter, "enabled"):
            limiter.enabled = True
        if hasattr(limiter, "reset"):
            limiter.reset()
    if hasattr(app.state, "limiter") and app.state.limiter is not None:
        if hasattr(app.state.limiter, "_enabled"):
            app.state.limiter._enabled = True
        if hasattr(app.state.limiter, "enabled"):
            app.state.limiter.enabled = True
        if hasattr(app.state.limiter, "reset"):
            app.state.limiter.reset()

    codes = [client.post("/api/auth/login",
                         json={"email": "attacker@example.com", "password": f"guess-{i}"}).status_code
             for i in range(25)]

    assert 401 in codes, "expected failed logins before the limit kicks in"
    assert 429 in codes, f"login was never rate limited: {codes}"
    # Once throttled it must stay throttled within the window, not flap open.
    assert codes[-1] == 429

    body = client.post("/api/auth/login",
                       json={"email": "attacker@example.com", "password": "x"}).json()
    assert body["success"] is False and body["error"]["code"] == "RATE_LIMITED"

    if hasattr(app.state, "limiter"):
        app.state.limiter.reset()
        app.state.limiter.enabled = config.RATE_LIMIT_ENABLED
