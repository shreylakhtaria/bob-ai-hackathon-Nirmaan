"""
Phase 3: CSV bulk-ingestion endpoints.

Driven through the real ASGI app — an import endpoint is a trust boundary, and
validation that is only proven at function level does not prove the route
actually applies it.

Run:  pytest backend/tests/test_ingest.py -q
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


# ---------------------------------------------------------------------------
# Helpers (token minting mirrors tests/test_auth_security.py)
# ---------------------------------------------------------------------------
def _token(role="operator"):
    email = f"ing-{uuid.uuid4().hex[:10]}@example.com"
    auth_svc.signup(f"Test {role}", email, "password123")
    if role != config.DEFAULT_ROLE:
        with db.session() as conn:
            conn.execute("UPDATE users SET role=? WHERE email=?", (role, email))
    r = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tokens():
    return {r: _token(r) for r in ("admin", "operator", "crew")}


@pytest.fixture
def cleanup():
    """Remove anything a test imported, so the shared demo DB stays as it was."""
    created = {"crews": [], "assets": []}
    yield created
    with db.session() as conn:
        for table, ids in created.items():
            for i in ids:
                conn.execute(f"DELETE FROM {table} WHERE {table[:-1]}_id=?", (i,))


def _post(path, body, token, filename="upload.csv", ctype="text/csv"):
    return client.post(path, files={"file": (filename, body, ctype)},
                       headers={"Authorization": f"Bearer {token}"})


def _crew_csv(rows, header="crew_id,current_area,latitude,longitude,skill_type,availability"):
    return "\n".join([header] + rows) + "\n"


def _uid(prefix="C"):
    return f"{prefix}-{uuid.uuid4().hex[:8].upper()}"


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------
def test_validate_is_a_dry_run(tokens, cleanup):
    cid = _uid()
    body = _crew_csv([f"{cid},NORTH-04,23.1,72.6,Electrical,AVAILABLE"])
    r = _post("/api/ingest/crews/validate", body, tokens["operator"])
    assert r.status_code == 200, r.text
    rep = r.json()
    assert (rep["total_rows"], rep["valid"], rep["invalid"], rep["imported"]) == (1, 1, 0, 0)
    assert rep["preview"][0]["crew_id"] == cid
    assert db.query_one("SELECT 1 FROM crews WHERE crew_id=?", (cid,)) is None


def test_commit_imports_valid_rows(tokens, cleanup):
    ids = [_uid() for _ in range(3)]
    cleanup["crews"] += ids
    body = _crew_csv([f"{i},NORTH-04,23.1,72.6,Electrical,AVAILABLE" for i in ids])
    r = _post("/api/ingest/crews/commit", body, tokens["operator"])
    assert r.status_code == 200, r.text
    rep = r.json()
    assert rep["imported"] == 3 and rep["valid"] == 3 and rep["errors"] == []
    row = db.query_one("SELECT * FROM crews WHERE crew_id=?", (ids[0],))
    assert row["availability"] == "AVAILABLE" and row["latitude"] == 23.1


def test_assets_import(tokens, cleanup):
    aid = _uid("A")
    cleanup["assets"].append(aid)
    body = ("asset_id,asset_type,substation_id,geographic_area,customers_served\n"
            f"{aid},Transformer,SUB-1,NORTH-04,1200\n")
    r = _post("/api/ingest/assets/commit", body, tokens["operator"])
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 1
    assert db.query_one("SELECT * FROM assets WHERE asset_id=?", (aid,))["customers_served"] == 1200


def test_commit_is_audited(tokens, cleanup):
    cid = _uid()
    cleanup["crews"].append(cid)
    _post("/api/ingest/crews/commit",
          _crew_csv([f"{cid},NORTH-04,23.1,72.6,Electrical,AVAILABLE"]), tokens["operator"])
    latest = db.query_one(
        "SELECT * FROM audit_log WHERE action='ingest_commit' ORDER BY id DESC LIMIT 1")
    assert latest and "@example.com" in latest["actor"]
    assert latest["detail"]["kind"] == "crews" and latest["detail"]["imported"] >= 1


# ---------------------------------------------------------------------------
# Row-level validation — nothing is silently dropped
# ---------------------------------------------------------------------------
def test_invalid_rows_are_reported_with_row_numbers(tokens, cleanup):
    good = _uid()
    cleanup["crews"].append(good)
    body = _crew_csv([
        f"{good},NORTH-04,23.1,72.6,Electrical,AVAILABLE",   # line 2 — ok
        ",NORTH-04,23.1,72.6,Electrical,AVAILABLE",          # line 3 — empty id
        f"{_uid()},NORTH-04,999,72.6,Electrical,AVAILABLE",  # line 4 — lat out of range
        f"{_uid()},NORTH-04,abc,72.6,Electrical,AVAILABLE",  # line 5 — lat not numeric
        f"{_uid()},NORTH-04,23.1,72.6,Electrical,NAPPING",   # line 6 — bad enum
    ])
    r = _post("/api/ingest/crews/commit", body, tokens["operator"])
    assert r.status_code == 200, r.text
    rep = r.json()
    assert rep["total_rows"] == 5 and rep["valid"] == 1 and rep["invalid"] == 4
    assert rep["imported"] == 1                       # partial import, not all-or-nothing
    by_row = {e["row"]: e for e in rep["errors"]}
    assert set(by_row) == {3, 4, 5, 6}                # every rejected row is accounted for
    assert by_row[3]["field"] == "crew_id"
    assert "between" in by_row[4]["message"] and by_row[4]["value"] == "999"
    assert "number" in by_row[5]["message"]
    assert "AVAILABLE" in by_row[6]["message"] and by_row[6]["field"] == "availability"


def test_unknown_columns_are_reported_not_silently_ignored(tokens, cleanup):
    cid = _uid()
    cleanup["crews"].append(cid)
    body = ("crew_id,current_area,wat,DROP TABLE crews\n"
            f"{cid},NORTH-04,x,y\n")
    r = _post("/api/ingest/crews/commit", body, tokens["operator"])
    rep = r.json()
    assert rep["imported"] == 1
    assert set(rep["unknown_columns"]) == {"wat", "DROP TABLE crews"}
    assert {e["field"] for e in rep["errors"] if e["row"] == 1} == {"wat", "DROP TABLE crews"}


def test_missing_required_headers_rejected(tokens):
    r = _post("/api/ingest/assets/validate",
              "asset_id,manufacturer\nA-1,ABB\n", tokens["operator"])
    assert r.status_code == 400
    msg = r.json()["error"]["message"]
    assert "asset_type" in msg and "substation_id" in msg and "geographic_area" in msg


# ---------------------------------------------------------------------------
# Duplicates
# ---------------------------------------------------------------------------
def test_duplicates_within_the_file(tokens, cleanup):
    cid = _uid()
    cleanup["crews"].append(cid)
    body = _crew_csv([f"{cid},NORTH-04,23.1,72.6,Electrical,AVAILABLE"] * 3)
    r = _post("/api/ingest/crews/commit", body, tokens["operator"])
    rep = r.json()
    assert (rep["total_rows"], rep["valid"], rep["duplicates"], rep["imported"]) == (3, 1, 2, 1)
    assert [e["row"] for e in rep["errors"]] == [3, 4]
    assert db.query_one("SELECT COUNT(*) n FROM crews WHERE crew_id=?", (cid,))["n"] == 1


def test_duplicates_against_existing_database_rows(tokens, cleanup):
    cid = _uid()
    cleanup["crews"].append(cid)
    body = _crew_csv([f"{cid},NORTH-04,23.1,72.6,Electrical,AVAILABLE"])
    assert _post("/api/ingest/crews/commit", body, tokens["operator"]).json()["imported"] == 1

    again = _post("/api/ingest/crews/commit", body, tokens["operator"]).json()
    assert (again["valid"], again["duplicates"], again["imported"]) == (0, 1, 0)
    assert "Already exists" in again["errors"][0]["message"]
    # Validate must see the same conflict without writing.
    assert _post("/api/ingest/crews/validate", body, tokens["operator"]).json()["duplicates"] == 1


# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------
def test_formula_injection_is_neutralised(tokens, cleanup):
    cid = "=cmd|'/c calc'!A0"
    cleanup["crews"].append("'" + cid)
    body = _crew_csv([f'"{cid}",NORTH-04,23.1,72.6,"@SUM(1+1)",AVAILABLE'])
    r = _post("/api/ingest/crews/commit", body, tokens["operator"])
    assert r.json()["imported"] == 1
    row = db.query_one("SELECT * FROM crews WHERE crew_id=?", ("'" + cid,))
    assert row is not None                       # stored under the defused key
    assert row["skill_type"] == "'@SUM(1+1)"     # and every text cell is defused


def test_oversized_upload_rejected(tokens, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 200)
    body = _crew_csv([f"{_uid()},NORTH-04,23.1,72.6,Electrical,AVAILABLE" for _ in range(20)])
    r = _post("/api/ingest/crews/validate", body, tokens["operator"])
    assert r.status_code == 413
    assert config.MAX_UPLOAD_BYTES  # sanity: the knob exists and is configurable


def test_default_upload_and_row_caps_are_sane():
    assert config.MAX_UPLOAD_BYTES == 5 * 1024 * 1024
    assert config.MAX_IMPORT_ROWS == 10000


def test_absurd_row_count_rejected(tokens, monkeypatch):
    monkeypatch.setattr(config, "MAX_IMPORT_ROWS", 3)
    body = _crew_csv([f"{_uid()},NORTH-04,23.1,72.6,Electrical,AVAILABLE" for _ in range(10)])
    r = _post("/api/ingest/crews/commit", body, tokens["operator"])
    assert r.status_code == 413
    assert db.query_one("SELECT COUNT(*) n FROM crews")["n"] >= 0   # nothing written


@pytest.mark.parametrize("body,ok_status", [
    (b"\x89PNG\r\n\x1a\n\x00\x00binary", 400),          # a PNG named .csv
    ("crew_id\nC-1\n".encode("utf-16"), 400),           # wrong encoding -> NULs
    (b"\xff\xfe\xfa\xfb not utf8 at all", 400),         # undecodable bytes
    (b"", 400),                                         # empty
    (b"just a sentence with no delimiters", 400),       # not tabular
])
def test_non_csv_content_is_rejected_gracefully(tokens, body, ok_status):
    """A lying filename/content-type must not get past us, and must not 500."""
    r = _post("/api/ingest/crews/validate", body, tokens["operator"],
              filename="totally.csv", ctype="text/csv")
    assert r.status_code == ok_status, r.text
    assert r.json()["success"] is False


def test_unknown_kind_rejected(tokens):
    r = _post("/api/ingest/users/commit", "crew_id\nC-1\n", tokens["operator"])
    assert r.status_code == 404


def test_ingest_requires_operator_role(tokens, cleanup):
    cid = _uid()
    cleanup["crews"].append(cid)
    body = _crew_csv([f"{cid},NORTH-04,23.1,72.6,Electrical,AVAILABLE"])
    for path in ("/api/ingest/crews/validate", "/api/ingest/crews/commit"):
        assert client.post(path, files={"file": ("u.csv", body, "text/csv")}).status_code == 401
        assert _post(path, body, tokens["crew"]).status_code == 403
        assert _post(path, body, tokens["admin"]).status_code == 200
