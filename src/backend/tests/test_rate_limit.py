"""
Rate limiting on credential endpoints.

Kept in its own module because it deliberately exhausts the login window; run
alongside the other auth tests it would starve them of requests.
"""
from fastapi.testclient import TestClient

from backend import config
from backend.main import app


def test_repeated_failed_logins_are_throttled():
    """An unlimited login endpoint is a free password-guessing oracle."""
    client = TestClient(app)
    if hasattr(app.state, "limiter"):
        app.state.limiter.enabled = True
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
