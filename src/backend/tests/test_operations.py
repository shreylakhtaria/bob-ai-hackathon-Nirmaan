"""
Tests for operator actions (dispatch / schedule / defer / reposition / export).

These cover the guarantee that every action button in the UI mutates real
persisted state rather than only rendering a message.
Assumes the pipeline has been run (python -m scripts.seed).
"""
import pytest

from backend import db
from backend.services import operations as ops


@pytest.fixture(autouse=True)
def _requires_seed():
    if not db.query_one("SELECT 1 FROM assets LIMIT 1"):
        pytest.skip("Run: python -m scripts.seed")


def _any_asset():
    return db.query_one("SELECT asset_id FROM assets LIMIT 1")["asset_id"]


def _free_a_crew():
    """Make sure at least one crew is AVAILABLE so dispatch tests are deterministic."""
    crew = db.query_one("SELECT crew_id FROM crews LIMIT 1")
    with db.session() as conn:
        conn.execute("UPDATE crews SET availability='AVAILABLE', active_assignment=NULL "
                     "WHERE crew_id=?", (crew["crew_id"],))
    return crew["crew_id"]


def test_dispatch_creates_work_order_and_books_crew():
    _free_a_crew()
    asset_id = _any_asset()
    before = len(ops.list_work_orders(limit=500))

    result = ops.dispatch_crew(asset_id)
    assert not result.get("error"), result
    assert result["eta_min"] > 0

    wo = db.query_one("SELECT * FROM work_orders WHERE wo_id=?", (result["work_order"]["wo_id"],))
    assert wo["status"] == "OPEN" and wo["wo_type"] == "DISPATCH"
    assert len(ops.list_work_orders(limit=500)) == before + 1

    crew = db.query_one("SELECT * FROM crews WHERE crew_id=?", (result["crew_id"],))
    assert crew["availability"] == "ON_JOB"
    assert crew["active_assignment"] == asset_id

    ops.release_crew(result["crew_id"])
    assert db.query_one("SELECT availability FROM crews WHERE crew_id=?",
                        (result["crew_id"],))["availability"] == "AVAILABLE"


def test_dispatch_rejects_busy_crew():
    crew_id = _free_a_crew()
    asset_id = _any_asset()
    ops.dispatch_crew(asset_id, crew_id)
    again = ops.dispatch_crew(asset_id, crew_id)
    assert again.get("error"), "a crew already ON_JOB must not be dispatched twice"
    ops.release_crew(crew_id)


def test_dispatch_unknown_asset_errors():
    assert ops.dispatch_crew("NOT-AN-ASSET").get("error")


def test_schedule_uses_priority_horizon():
    asset = db.query_one(
        "SELECT asset_id FROM predictions WHERE priority='CRITICAL' LIMIT 1") or \
        db.query_one("SELECT asset_id FROM predictions LIMIT 1")
    r = ops.schedule_job(asset["asset_id"])
    assert not r.get("error")
    assert r["horizon_hours"] == ops.SCHEDULE_HOURS[r["work_order"]["priority"]]
    assert r["work_order"]["scheduled_for"] > r["work_order"]["created_at"]


def test_defer_records_deferred_status():
    r = ops.defer_job(_any_asset(), "not urgent")
    assert r["work_order"]["status"] == "DEFERRED"


def test_reposition_moves_crew_to_area_centroid():
    from backend import config
    crew = db.query_one("SELECT * FROM crews LIMIT 1")
    target = next(g for g in config.GEO_AREAS if g["area_id"] != crew["current_area"])

    r = ops.reposition_crew(crew["crew_id"], target["area_id"])
    assert not r.get("error")
    moved = db.query_one("SELECT * FROM crews WHERE crew_id=?", (crew["crew_id"],))
    assert moved["current_area"] == target["area_id"]
    assert moved["latitude"] == pytest.approx(target["lat"])


def test_acknowledge_alert_flags_row():
    alert = db.query_one("SELECT alert_id FROM alerts LIMIT 1")
    if not alert:
        pytest.skip("no alerts seeded")
    ops.acknowledge_alert(alert["alert_id"])
    row = db.query_one("SELECT acknowledged FROM alerts WHERE alert_id=?", (alert["alert_id"],))
    assert row["acknowledged"] == 1


def test_every_export_produces_a_header_row():
    for kind in ops.EXPORTS:
        name, body = ops.export_csv(kind)
        assert name.endswith(".csv")
        assert body.splitlines()[0] == ",".join(ops.EXPORTS[kind])


def test_unknown_export_returns_none():
    assert ops.export_csv("nope") == (None, None)


def test_system_stats_reports_live_counters():
    s = ops.system_stats()
    assert s["assets"] > 0 and s["sensor_rows"] > 0
    assert s["crews_available"] <= s["crews"]
    assert s["telemetry_rows_per_hour"] > 0


def test_actions_are_audit_logged():
    ops.defer_job(_any_asset(), "audit check")
    recent = [r["action"] for r in ops.operations_log(limit=10)]
    assert "defer_job" in recent
