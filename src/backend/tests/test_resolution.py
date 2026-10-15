"""
Tests for the maintenance resolution workflow (services/resolution.py,
services/risk.py) and the release_crew rewrite that now delegates to it.

Adapted from origin/main's test_resolution.py to this branch's conventions:
no RBAC/user objects, plain {"email": ...} actor dicts, no Depends(require_*).
"""
import pytest

from backend import db
from backend.services import operations as ops
from backend.services import resolution


@pytest.fixture(autouse=True)
def _requires_seed():
    if not db.query_one("SELECT 1 FROM assets LIMIT 1"):
        pytest.skip("Run: python -m scripts.seed")


def _free_a_crew():
    """Pick a crew and fully reset it: AVAILABLE, no active assignment, and no
    open/deferred work orders left dangling by a previous test in this file
    (e.g. a dispatch whose completion call was rejected before it could close
    the work order)."""
    crew = db.query_one("SELECT crew_id FROM crews LIMIT 1")
    with db.session() as conn:
        conn.execute("UPDATE crews SET availability='AVAILABLE', active_assignment=NULL "
                     "WHERE crew_id=?", (crew["crew_id"],))
        conn.execute("UPDATE work_orders SET status='CLOSED' "
                     "WHERE crew_id=? AND status IN ('OPEN','DEFERRED')", (crew["crew_id"],))
    return crew["crew_id"]


def _any_asset():
    return db.query_one("SELECT asset_id FROM assets LIMIT 1")["asset_id"]


def test_complete_work_order_writes_maintenance_and_stamps_asset():
    crew_id = _free_a_crew()
    asset_id = _any_asset()
    dispatch = ops.dispatch_crew(asset_id, crew_id)
    assert not dispatch.get("error"), dispatch
    wo_id = dispatch["work_order"]["wo_id"]

    before_maint_count = db.query_one(
        "SELECT COUNT(*) c FROM maintenance_history WHERE asset_id=?", (asset_id,))["c"]

    result = resolution.complete_work_order(
        wo_id, {"email": "tech@grid.local"}, action_taken="Replaced bushing",
        result="COMPLETED")

    assert result["crew_released"] is True
    assert result["maintenance_id"].startswith("MNT-")

    wo = db.query_one("SELECT * FROM work_orders WHERE wo_id=?", (wo_id,))
    assert wo["status"] == "CLOSED"

    after_maint_count = db.query_one(
        "SELECT COUNT(*) c FROM maintenance_history WHERE asset_id=?", (asset_id,))["c"]
    assert after_maint_count == before_maint_count + 1

    maint = db.query_one(
        "SELECT * FROM maintenance_history WHERE maintenance_id=?", (result["maintenance_id"],))
    assert maint["action_taken"] == "Replaced bushing"
    assert maint["result"] == "COMPLETED"

    asset = db.query_one("SELECT last_maintenance_date FROM assets WHERE asset_id=?", (asset_id,))
    assert asset["last_maintenance_date"] == result["completed_at"][:10]

    crew = db.query_one("SELECT * FROM crews WHERE crew_id=?", (crew_id,))
    assert crew["availability"] == "AVAILABLE"
    assert crew["active_assignment"] is None


def test_complete_work_order_rejects_already_closed():
    crew_id = _free_a_crew()
    asset_id = _any_asset()
    dispatch = ops.dispatch_crew(asset_id, crew_id)
    wo_id = dispatch["work_order"]["wo_id"]

    resolution.complete_work_order(wo_id, {"email": "tech@grid.local"})

    with pytest.raises(Exception):
        resolution.complete_work_order(wo_id, {"email": "tech@grid.local"})


def test_complete_work_order_rejects_invalid_result():
    crew_id = _free_a_crew()
    asset_id = _any_asset()
    dispatch = ops.dispatch_crew(asset_id, crew_id)
    wo_id = dispatch["work_order"]["wo_id"]

    with pytest.raises(Exception):
        resolution.complete_work_order(wo_id, {"email": "tech@grid.local"}, result="BOGUS")


def test_release_crew_with_no_open_work_order_just_frees_it():
    crew_id = _free_a_crew()
    result = ops.release_crew(crew_id)
    assert result["completed"] == []
    assert "released and available" in result["message"]
    crew = db.query_one("SELECT availability FROM crews WHERE crew_id=?", (crew_id,))
    assert crew["availability"] == "AVAILABLE"


def test_release_crew_completes_open_work_and_recalculates_risk():
    crew_id = _free_a_crew()
    asset_id = _any_asset()
    dispatch = ops.dispatch_crew(asset_id, crew_id)
    assert not dispatch.get("error"), dispatch

    result = ops.release_crew(crew_id, {"email": "operator@grid.local"})

    assert len(result["completed"]) == 1
    assert "maintenance recorded" in result["message"]
    assert result["risk_before"] is not None or result["risk_after"] is not None

    wo = db.query_one("SELECT status FROM work_orders WHERE wo_id=?",
                      (result["completed"][0],))
    assert wo["status"] == "CLOSED"

    crew = db.query_one("SELECT * FROM crews WHERE crew_id=?", (crew_id,))
    assert crew["availability"] == "AVAILABLE"


def test_release_crew_completes_multiple_open_work_orders():
    crew_id = _free_a_crew()
    assets = db.query("SELECT asset_id FROM assets LIMIT 2")
    assert len(assets) == 2, "seed needs at least 2 assets for this test"

    for a in assets:
        with db.session() as conn:
            conn.execute("UPDATE crews SET availability='AVAILABLE', active_assignment=NULL "
                         "WHERE crew_id=?", (crew_id,))
        ops.dispatch_crew(a["asset_id"], crew_id)

    open_before = db.query_one(
        "SELECT COUNT(*) c FROM work_orders WHERE crew_id=? AND status IN ('OPEN','DEFERRED')",
        (crew_id,))["c"]
    assert open_before >= 1

    result = ops.release_crew(crew_id)
    assert len(result["completed"]) == open_before

    open_after = db.query_one(
        "SELECT COUNT(*) c FROM work_orders WHERE crew_id=? AND status IN ('OPEN','DEFERRED')",
        (crew_id,))["c"]
    assert open_after == 0
