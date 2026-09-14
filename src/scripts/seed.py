"""
End-to-end data pipeline:
  generate -> validate -> train -> score -> impact -> area risk -> alerts.

Run:  python -m scripts.seed         (from project root)
Idempotent: safe to re-run; it resets and rebuilds everything deterministically.
"""
import sys
import time
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("seed")


def _validate():
    from backend import db
    checks = {
        "assets": "SELECT COUNT(*) c FROM assets",
        "sensors": "SELECT COUNT(*) c FROM sensor_data",
        "weather": "SELECT COUNT(*) c FROM weather_data",
        "incidents": "SELECT COUNT(*) c FROM incidents",
    }
    for name, sql in checks.items():
        c = db.query_one(sql)["c"]
        if c == 0:
            raise RuntimeError(f"Validation failed: {name} table is empty")
        log.info("validation: %s = %d rows", name, c)


def run():
    from backend import db, config
    from backend.data import generator
    from backend.ml import model
    from backend.services import impact, alerts

    t0 = time.time()
    db.init_db()

    log.info("[1/6] Generating synthetic grid (%d assets, %d days)...",
             config.N_ASSETS, config.HISTORY_DAYS)
    gen = generator.generate_all()
    log.info("      -> %s", gen)

    log.info("[2/6] Validating data...")
    _validate()

    log.info("[3/6] Training failure-prediction model + anomaly detector...")
    metrics = model.train()
    log.info("      -> model=%s ROC-AUC=%s PR-AUC=%s precision@k=%s (k=%s, %d/%d failures in top-k)",
             metrics["model"], metrics["roc_auc"], metrics["pr_auc"],
             metrics["precision_at_k"], metrics["k"], metrics["failures_found_in_topk"],
             metrics["positives_test"])

    log.info("[4/6] Scoring all assets (failure prob, anomaly, explanations)...")
    log.info("      -> %s", model.score_all())

    log.info("[5/6] Computing grid-impact scores + area outage risk...")
    log.info("      -> %s", impact.compute_impact())
    log.info("      -> %s", impact.compute_area_risk())

    log.info("[6/6] Generating alerts...")
    log.info("      -> %s", alerts.generate_alerts())

    db.set_meta("pipeline_ran_at", time.strftime("%Y-%m-%dT%H:%M:%S"))
    hero = db.query_one(
        "SELECT failure_probability,priority,grid_impact_score FROM predictions WHERE asset_id='T-1024'")
    log.info("DEMO hero T-1024: prob=%.2f priority=%s impact=%.0f",
             hero["failure_probability"], hero["priority"], hero["grid_impact_score"])
    log.info("Pipeline complete in %.1fs", time.time() - t0)


if __name__ == "__main__":
    run()
