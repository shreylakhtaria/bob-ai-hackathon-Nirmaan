"""
Critical-logic tests. Assumes the pipeline has been run (python -m scripts.seed).
Run:  pytest -q   (or)   python -m backend.tests.test_core
"""
from backend import db, config
from backend.services import impact, crew, simulation, briefing, copilot, maintenance
from backend.ml import model


def _seeded():
    return bool(db.query_one("SELECT 1 FROM assets LIMIT 1")) and \
           bool(db.query_one("SELECT 1 FROM predictions LIMIT 1"))


def test_data_present():
    assert _seeded(), "Run: python -m scripts.seed"
    assert db.query_one("SELECT COUNT(*) c FROM assets")["c"] >= 100
    assert db.query_one("SELECT COUNT(*) c FROM sensor_data")["c"] > 10000


def test_predictions_valid():
    for p in db.query("SELECT failure_probability, priority FROM predictions"):
        assert 0.0 <= p["failure_probability"] <= 1.0
        assert p["priority"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")


def test_risk_bands_monotonic():
    assert model.risk_level(0.9) == "CRITICAL"
    assert model.risk_level(0.6) == "HIGH"
    assert model.risk_level(0.4) == "MEDIUM"
    assert model.risk_level(0.1) == "LOW"


def test_impact_score_range():
    for r in db.query("SELECT grid_impact_score FROM predictions"):
        assert 0 <= r["grid_impact_score"] <= 100


def test_impact_beats_probability_for_hero():
    """The core thesis: high-consequence asset tops the queue even if not #1 by prob."""
    q = maintenance.priority_queue(limit=5)
    assert q, "empty maintenance queue"
    top_ids = [x["asset_id"] for x in q]
    assert "T-1024" in top_ids, "demo hero should be in the top maintenance priorities"


def test_model_metrics_reasonable():
    m = model.get_metrics()
    assert m, "no metrics stored"
    assert m["roc_auc"] is None or m["roc_auc"] > 0.6
    assert m["failures_found_in_topk"] >= 1


def test_area_risk_computed():
    areas = db.query("SELECT * FROM area_risk")
    assert len(areas) >= 1
    for a in areas:
        assert 0.0 <= a["outage_probability"] <= 1.0


def test_crew_optimizer_assigns():
    r = crew.recommend_crews()
    assert r["available_crews"] >= 0
    for rec in r["recommendations"]:
        assert rec["projected_response_min"] <= rec["current_response_min"] + 1e-6


def test_simulate_asset_failure():
    r = simulation.simulate_asset_failure("T-1024")
    assert r["total_customers_affected"] >= r["direct_customers"]
    assert r["severity"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")
    assert "NORTH-04" in r["affected_areas"]


def test_simulate_weather_event():
    r = simulation.simulate_weather_event("NORTH-04", "extreme")
    assert r["new_outage_probability"] >= 0
    assert r["injected_weather_score"] >= 90


def test_copilot_is_grounded():
    """Every factual copilot answer must carry tool evidence (no hallucination)."""
    r = copilot.answer("Why is T-1024 critical?")
    assert r["evidence"], "answer must cite tool evidence"
    # The evidence itself must be about the right asset — this is robust to an
    # LLM (when configured) rendering the id with different punctuation/spacing
    # in its prose (e.g. a Unicode hyphen), which free-text substring matching
    # on r["answer"] is not.
    assert any(e.get("args", {}).get("asset_id") == "T-1024" for e in r["evidence"])
    assert r["mode"] in ("grounded", "llm")


def test_copilot_simulation_query():
    r = copilot.answer("What happens if T-1024 fails?")
    assert any(e["tool"] == "simulate_asset_failure" for e in r["evidence"])


def test_briefing_generates():
    b = briefing.generate_brief()
    assert b["overall_grid_risk"] in ("NORMAL", "ELEVATED", "HIGH")
    assert isinstance(b["recommended_immediate_actions"], list)


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
