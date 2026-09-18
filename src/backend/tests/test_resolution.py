"""
Phase 4: resolution workflow, maintenance history, crew release, risk recalc.

The recalculation is exercised with `recalculate=False` in most tests because a
full model re-score takes ~7s; one test does run it end to end so the real path
is covered rather than only the cheap one.
"""
import pytest

from backend import db
from backend.services import operations as ops, resolution, risk as risk_svc

USER = {"id": 1, "email": "tester@example.com", "display_name": "Tester", "role": "operator"}


def _seeded():
    return bool(db.query_one("SELECT 1 FROM assets LIMIT 1"))


pytestmark = pytest.mark.skipif(not _seeded(), reason="run python -m scripts.seed first")


def _free_a_crew():
    """Guarantee at least one AVAILABLE crew, whatever earlier tests left behind."""
    crew = db.query_one("SELECT * FROM crews WHERE availability='AVAILABLE'")
    if crew:
        return crew
    any_crew = db.query_one("SELECT * FROM crews")
    with db.session() as conn:
        conn.execute("UPDATE crews SET availability='AVAILABLE', active_assignment=NULL "
                     "WHERE crew_id=?", (any_crew["crew_id"],))
        conn.execute("UPDATE work_orders SET status='CLOSED' WHERE crew_id=? AND status='OPEN'",
                     (any_crew["crew_id"],))
    return db.query_one("SELECT * FROM crews WHERE crew_id=?", (any_crew["crew_id"],))


def _dispatch():
    _free_a_crew()
    asset = db.query_one("SELECT asset_id FROM assets LIMIT 1")
    res = ops.dispatch_crew(asset["asset_id"])
    assert "error" not in res, res
    return res["work_order"]["wo_id"], res["crew_id"], asset["asset_id"]


# ---------------------------------------------------------------------------
# Dispatch atomicity (the bug this phase also had to fix)
# ---------------------------------------------------------------------------
def test_dispatch_creates_work_order_and_claims_crew_together():
    wo_id, crew_id, _ = _dispatch()
    wo = db.query_one("SELECT * FROM work_orders WHERE wo_id=?", (wo_id,))
    crew = db.query_one("SELECT * FROM crews WHERE crew_id=?", (crew_id,))
    assert wo["status"] == "OPEN"
    assert crew["availability"] == "ON_JOB"
    # The two used to be written in separate transactions, so an OPEN work order
    # could coexist with an AVAILABLE crew.
    assert crew["active_assignment"] == wo["asset_id"]


def test_busy_crew_cannot_be_dispatched_again():
    _, crew_id, _ = _dispatch()
    other = db.query_one("SELECT asset_id FROM assets WHERE asset_id <> "
                         "(SELECT asset_id FROM assets LIMIT 1) LIMIT 1")
    res = ops.dispatch_crew(other["asset_id"], crew_id=crew_id)
    assert "error" in res and "ON_JOB" in res["error"]


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------
def test_completion_writes_history_releases_crew_and_closes_order():
    wo_id, crew_id, asset_id = _dispatch()
    before_history = db.query_one(
        "SELECT COUNT(*) n FROM maintenance_history WHERE asset_id=?", (asset_id,))["n"]

    out = resolution.complete_work_order(
        wo_id, USER, action_taken="Replaced bushing", result="COMPLETED", recalculate=False)

    wo = db.query_one("SELECT status FROM work_orders WHERE wo_id=?", (wo_id,))
    crew = db.query_one("SELECT * FROM crews WHERE crew_id=?", (crew_id,))
    after_history = db.query_one(
        "SELECT COUNT(*) n FROM maintenance_history WHERE asset_id=?", (asset_id,))["n"]
    asset = db.query_one("SELECT last_maintenance_date FROM assets WHERE asset_id=?", (asset_id,))

    assert wo["status"] == "CLOSED"
    assert after_history == before_history + 1
    assert crew["availability"] == "AVAILABLE" and crew["active_assignment"] is None
    assert out["crew_released"] is True
    # days_since_maint is a live model feature; without this stamp a later
    # recalculation would see no change at all.
    assert asset["last_maintenance_date"]


def test_completing_twice_is_refused():
    wo_id, _, _ = _dispatch()
    resolution.complete_work_order(wo_id, USER, recalculate=False)
    with pytest.raises(Exception) as exc:
        resolution.complete_work_order(wo_id, USER, recalculate=False)
    assert "already closed" in str(exc.value).lower()


def test_crew_is_not_released_while_another_job_is_open():
    """A crew with a second open work order must stay ON_JOB."""
    wo_id, crew_id, asset_id = _dispatch()
    # A second open order for the same crew, as happens on a multi-stop shift.
    second = ops._insert_wo(asset_id=asset_id, area_id="NORTH-04", crew_id=crew_id,
                            wo_type="DISPATCH", priority="HIGH", notes="second job")

    out = resolution.complete_work_order(wo_id, USER, recalculate=False)
    crew = db.query_one("SELECT * FROM crews WHERE crew_id=?", (crew_id,))

    assert out["crew_released"] is False
    assert crew["availability"] == "ON_JOB", "crew freed while still assigned elsewhere"

    # tidy up so later tests start from a sane roster
    resolution.complete_work_order(second["wo_id"], USER, recalculate=False)
    assert db.query_one("SELECT availability FROM crews WHERE crew_id=?",
                        (crew_id,))["availability"] == "AVAILABLE"


def test_unknown_work_order_is_404():
    with pytest.raises(Exception) as exc:
        resolution.complete_work_order("WO-DOESNOTEXIST", USER, recalculate=False)
    assert "not found" in str(exc.value).lower()


def test_invalid_result_value_rejected():
    wo_id, _, _ = _dispatch()
    with pytest.raises(Exception) as exc:
        resolution.complete_work_order(wo_id, USER, result="NOT_A_RESULT", recalculate=False)
    assert "result must be one of" in str(exc.value).lower()
    resolution.complete_work_order(wo_id, USER, recalculate=False)   # leave it closed


def test_completion_is_audited():
    wo_id, _, _ = _dispatch()
    resolution.complete_work_order(wo_id, USER, recalculate=False)
    row = db.query_one("SELECT * FROM audit_log WHERE action='complete_work_order' "
                       "ORDER BY id DESC LIMIT 1")
    # db.rows_to_dicts parses the stored JSON back into a dict, so `detail` is
    # a mapping here rather than the raw string.
    assert row and row["detail"]["wo_id"] == wo_id
    assert row["detail"]["maintenance_id"].startswith("MNT-")
    assert row["actor"] == USER["email"]


# ---------------------------------------------------------------------------
# Risk recalculation
# ---------------------------------------------------------------------------
def test_recalculate_preserves_the_impact_formula():
    """Recalculating without changing inputs must reproduce the same scores.

    This is the guard against someone "simplifying" the population-normalised
    Grid Impact blend into a per-asset approximation: that would silently shift
    every score the moment it ran.
    """
    before = {r["asset_id"]: r["grid_impact_score"]
              for r in db.query("SELECT asset_id, grid_impact_score FROM predictions")}
    risk_svc.recalculate(reason="test", rescore_model=False)
    after = {r["asset_id"]: r["grid_impact_score"]
             for r in db.query("SELECT asset_id, grid_impact_score FROM predictions")}

    assert before.keys() == after.keys()
    drift = [k for k in before if abs((before[k] or 0) - (after[k] or 0)) > 0.05]
    assert not drift, f"impact score drifted for {len(drift)} assets with unchanged inputs"


def test_scores_stay_inside_their_documented_range():
    rows = db.query("SELECT grid_impact_score, failure_probability, priority FROM predictions")
    assert rows
    for r in rows:
        assert 0 <= r["grid_impact_score"] <= 100
        assert 0 <= r["failure_probability"] <= 1
        assert r["priority"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")


@pytest.mark.slow
def test_full_resolution_recalculates_risk_end_to_end():
    """The real path, model re-score included (~7s)."""
    wo_id, _, asset_id = _dispatch()
    out = resolution.complete_work_order(wo_id, USER, recalculate=True)

    assert out["recalculation"]["model_rescored"] is True
    assert out["recalculation"]["assets_scored"]
    assert out["risk_before"] and out["risk_after"]
    # The asset must still have a coherent prediction afterwards.
    assert 0 <= out["risk_after"]["grid_impact_score"] <= 100
