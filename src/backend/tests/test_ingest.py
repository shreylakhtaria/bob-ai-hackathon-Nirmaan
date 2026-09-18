"""
Tests for the Data Onboarding & SCADA Ingestion module.

Covers all four endpoints (via direct function imports and the FastAPI app)
plus the Copilot `get_ingestion_status` tool.

Assumes the seed pipeline has been run (python -m scripts.seed).
"""
import io
import csv
import json
import pytest

from backend import db
from backend.services import copilot
from backend.schemas.ingest import AssetRecord, TelemetryPacket, RescoreRequest
from backend.routers.ingest import (
    _upsert_assets, _parse_csv_rows, download_template,
    ingest_assets_json, ingest_telemetry, _ASSET_COLS,
)

# ---------------------------------------------------------------------------
# Unique IDs that won't collide with the seeded 220-asset dataset
# ---------------------------------------------------------------------------
_TEST_ASSET_A = "TEST-9001"
_TEST_ASSET_B = "TEST-9002"
_TEST_ASSET_C = "TEST-9003"


@pytest.fixture(autouse=True)
def _requires_seed():
    if not db.query_one("SELECT 1 FROM assets LIMIT 1"):
        pytest.skip("Run: python -m scripts.seed")


@pytest.fixture(autouse=True)
def _cleanup_test_assets():
    """Remove test assets before AND after each test to ensure isolation."""
    _purge()
    yield
    _purge()


def _purge():
    ids = (_TEST_ASSET_A, _TEST_ASSET_B, _TEST_ASSET_C)
    ph = ",".join("?" * len(ids))
    with db.session() as conn:
        conn.execute(f"DELETE FROM assets WHERE asset_id IN ({ph})", ids)
        conn.execute(f"DELETE FROM sensor_data WHERE asset_id IN ({ph})", ids)


def _make_asset(asset_id=_TEST_ASSET_A):
    return AssetRecord(
        asset_id=asset_id,
        asset_type="Transformer",
        substation_id="SUB-TEST",
        geographic_area="NORTH-04",
        latitude=23.05,
        longitude=72.58,
        customers_served=100,
        criticality_score=5.0,
        installation_year=2010,
        rated_capacity=50.0,
    )


# ---------------------------------------------------------------------------
# 1. Template download
# ---------------------------------------------------------------------------
def test_template_download():
    response = download_template()
    assert response.media_type == "text/csv"
    assert b"asset_id" in response.body
    # All 10 required columns present
    header_line = response.body.decode().split("\n")[0]
    for col in _ASSET_COLS:
        assert col in header_line, f"Column '{col}' missing from template header"


def test_template_columns_complete():
    response = download_template()
    header = response.body.decode().split("\n")[0].strip()
    cols = [c.strip() for c in header.split(",")]
    assert cols == _ASSET_COLS, f"Template columns mismatch: {cols}"


# ---------------------------------------------------------------------------
# 2. Asset ingest — JSON body
# ---------------------------------------------------------------------------
def test_asset_ingest_json():
    records = [_make_asset(_TEST_ASSET_A), _make_asset(_TEST_ASSET_B)]
    inserted, updated = _upsert_assets(records)
    assert inserted == 2
    assert updated == 0

    # Verify they are in the DB
    for aid in (_TEST_ASSET_A, _TEST_ASSET_B):
        row = db.query_one("SELECT * FROM assets WHERE asset_id=?", (aid,))
        assert row is not None
        assert row["asset_type"] == "Transformer"


def test_asset_ingest_json_response_shape():
    """ingest_assets_json() wraps _upsert_assets and returns the correct dict."""
    import asyncio
    records = [_make_asset(_TEST_ASSET_A)]
    # ingest_assets_json is an async FastAPI handler — run it directly
    result = asyncio.run(ingest_assets_json(records))
    assert result["inserted"] == 1
    assert result["updated"] == 0
    assert result["errors"] == []


# ---------------------------------------------------------------------------
# 3. Asset ingest — CSV file
# ---------------------------------------------------------------------------
def test_asset_ingest_csv():
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_ASSET_COLS)
    writer.writerow([
        _TEST_ASSET_A, "Transformer", "SUB-TEST", "NORTH-04",
        23.05, 72.58, 100, 5.0, 2010, 50.0,
    ])
    raw = buf.getvalue().encode()

    rows, err = _parse_csv_rows(raw)
    assert err is None
    assert len(rows) == 1

    valid = []
    errors = []
    for row_num, row_dict in rows:
        cleaned = {k.strip(): v.strip() for k, v in row_dict.items() if k}
        try:
            valid.append(AssetRecord(**cleaned))
        except Exception as exc:
            errors.append({"row": row_num, "reason": str(exc)})

    assert errors == [], errors
    assert len(valid) == 1

    inserted, updated = _upsert_assets(valid)
    assert inserted == 1
    assert updated == 0


# ---------------------------------------------------------------------------
# 4. Asset upsert (idempotent)
# ---------------------------------------------------------------------------
def test_asset_ingest_upsert():
    rec = _make_asset(_TEST_ASSET_A)
    # First insert
    inserted, updated = _upsert_assets([rec])
    assert inserted == 1 and updated == 0
    # Second call with same ID → updated
    inserted2, updated2 = _upsert_assets([rec])
    assert inserted2 == 0 and updated2 == 1


# ---------------------------------------------------------------------------
# 5. Validation error — missing required field
# ---------------------------------------------------------------------------
def test_asset_ingest_validation_error():
    """A row with missing asset_id should error; a valid sibling row should succeed."""
    from pydantic import ValidationError

    good = _make_asset(_TEST_ASSET_A)
    bad_data = {
        "asset_type": "Transformer", "substation_id": "SUB-TEST",
        "geographic_area": "NORTH-04", "latitude": 23.0, "longitude": 72.0,
        "customers_served": 50, "criticality_score": 3.0,
        "installation_year": 2015, "rated_capacity": 25.0,
        # asset_id intentionally omitted
    }
    errors = []
    valid = [good]
    try:
        AssetRecord(**bad_data)
    except ValidationError as exc:
        errors.append({"row": 2, "reason": str(exc)})

    assert len(errors) == 1
    assert len(valid) == 1

    inserted, _ = _upsert_assets(valid)
    assert inserted == 1


# ---------------------------------------------------------------------------
# 6. Validation error — wrong type
# ---------------------------------------------------------------------------
def test_asset_ingest_bad_type():
    from pydantic import ValidationError

    bad_data = {
        "asset_id": _TEST_ASSET_A, "asset_type": "Transformer",
        "substation_id": "SUB-TEST", "geographic_area": "NORTH-04",
        "latitude": 23.0, "longitude": 72.0, "customers_served": 50,
        "criticality_score": "not-a-number",   # <-- invalid
        "installation_year": 2015, "rated_capacity": 25.0,
    }
    with pytest.raises(ValidationError) as exc_info:
        AssetRecord(**bad_data)
    assert "criticality_score" in str(exc_info.value).lower() or "float" in str(exc_info.value).lower()


# ---------------------------------------------------------------------------
# 7. Telemetry ingest — valid packet
# ---------------------------------------------------------------------------
def test_telemetry_ingest():
    import asyncio
    packet = TelemetryPacket(
        asset_id=_TEST_ASSET_A,
        temperature=82.3,
        vibration=2.1,
        load_percentage=91.0,
    )
    result = asyncio.run(ingest_telemetry(packet))
    assert result["status"] == "ok"
    assert isinstance(result["id"], int)

    # Verify row is in sensor_data
    row = db.query_one(
        "SELECT * FROM sensor_data WHERE id=?", (result["id"],)
    )
    assert row is not None
    assert row["asset_id"] == _TEST_ASSET_A
    assert abs(row["temperature"] - 82.3) < 0.001


# ---------------------------------------------------------------------------
# 8. Telemetry ingest — unknown asset_id (no FK enforcement in SQLite here)
# ---------------------------------------------------------------------------
def test_telemetry_missing_asset():
    """sensor_data has no FK constraint, so unknown asset_id should still persist."""
    import asyncio
    packet = TelemetryPacket(asset_id="UNKNOWN-ASSET-99999", temperature=50.0)
    result = asyncio.run(ingest_telemetry(packet))
    assert result["status"] == "ok"
    row = db.query_one("SELECT 1 FROM sensor_data WHERE id=?", (result["id"],))
    assert row is not None
    # Clean up orphan row
    with db.session() as conn:
        conn.execute("DELETE FROM sensor_data WHERE id=?", (result["id"],))


# ---------------------------------------------------------------------------
# 9. Re-score endpoint
# ---------------------------------------------------------------------------
def test_rescore_endpoint():
    from backend.routers.ingest import re_score

    result = re_score(RescoreRequest())
    assert result["scored"] > 0, "Expected at least one asset scored"
    assert result["areas_updated"] > 0, "Expected at least one area updated"
    assert result["as_of"] is not None

    # Verify timestamp was persisted to meta table
    stored = db.get_meta("last_rescore_at")
    assert stored is not None
    assert result["as_of"] == stored


# ---------------------------------------------------------------------------
# 10. Copilot get_ingestion_status — direct call
# ---------------------------------------------------------------------------
def test_copilot_ingestion_status():
    result = copilot.get_ingestion_status()
    assert result["total_telemetry_rows"] > 0, "Expected telemetry rows from seeded data"
    assert result["onboarded_asset_count"] > 0
    # last_telemetry_at should be an ISO string
    assert isinstance(result["last_telemetry_at"], str)


# ---------------------------------------------------------------------------
# 11. Copilot grounded routing — ingestion query routes to correct tool
# ---------------------------------------------------------------------------
def test_copilot_onboard_routing():
    r = copilot.answer("When was telemetry last ingested?")
    assert r["evidence"], "Copilot answer must have tool evidence"
    tool_names = [e["tool"] for e in r["evidence"]]
    assert "get_ingestion_status" in tool_names, (
        f"Expected get_ingestion_status tool, got: {tool_names}"
    )


# ---------------------------------------------------------------------------
# 12. Copilot grounded routing — onboarding asset count query
# ---------------------------------------------------------------------------
def test_copilot_onboarded_count_routing():
    r = copilot.answer("How many assets were onboarded?")
    assert r["evidence"]
    tool_names = [e["tool"] for e in r["evidence"]]
    assert "get_ingestion_status" in tool_names, (
        f"Expected get_ingestion_status tool, got: {tool_names}"
    )


if __name__ == "__main__":
    import traceback
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for fn in fns:
        try:
            fn(); print(f"PASS {fn.__name__}"); passed += 1
        except Exception as e:
            print(f"FAIL {fn.__name__}: {e}"); traceback.print_exc()
    print(f"\n{passed}/{len(fns)} tests passed")
