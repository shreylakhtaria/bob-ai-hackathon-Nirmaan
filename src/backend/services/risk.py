"""
Risk recalculation service.

Risk is re-derived by the existing model and the existing Grid Impact formula —
never adjusted by a hand-picked delta. Subtracting "some percent" after a repair
would make the number look responsive while quietly detaching it from the
evidence the rest of the console is built on.

Why the whole population is rescored rather than one asset:

* `impact.compute_impact()` min-max normalises the `customers` and `network`
  components *across all scored assets*. Recomputing one asset in isolation
  cannot reproduce those two components, so a per-asset shortcut would silently
  produce a different score than the pipeline that seeded the table.
* `impact.compute_area_risk()` aggregates the top failure probabilities per
  area, so an asset's change moves its area's score too.

ponytail: whole-population rescore, ~7s, dominated by ml.model.score_all()
rebuilding features over every asset. Acceptable for an action an operator takes
a few times a shift. If it ever runs on a hot path, add a per-asset scoring
entry point to ml/features.py rather than approximating the formula here.
"""
import logging
import time

from .. import db
from ..ml import model
from . import impact

log = logging.getLogger("grid.risk")


def snapshot_asset_risk(asset_id: str) -> dict:
    """Current stored risk for one asset, used to record before/after deltas."""
    row = db.query_one(
        "SELECT failure_probability, risk_level, grid_impact_score, priority "
        "FROM predictions WHERE asset_id=?", (asset_id,))
    return dict(row) if row else {}


def recalculate(reason: str = "manual", rescore_model: bool = True) -> dict:
    """Re-derive risk from current inputs and persist it.

    `rescore_model=False` skips the model pass and only re-blends the impact and
    area scores. That is correct when the *inputs to the blend* changed but the
    per-asset failure probability did not — it is NOT correct after maintenance,
    where `days_since_maint` is a live model feature, so the default is a full
    re-score.
    """
    started = time.time()
    scored = None
    if rescore_model:
        # Re-derives failure_probability, risk_level, anomaly_score and the SHAP
        # drivers from the features as they stand now.
        scored = model.score_all()
    impacted = impact.compute_impact()      # Grid Impact Score + priority
    areas = impact.compute_area_risk()      # area rollup depends on the above

    elapsed = round(time.time() - started, 2)
    log.info("risk recalculated (reason=%s, rescore=%s) in %ss", reason, rescore_model, elapsed)
    return {
        "reason": reason,
        "model_rescored": bool(rescore_model),
        "assets_scored": (scored or {}).get("scored"),
        "assets_impacted": impacted.get("impact_scored"),
        "areas": areas.get("areas") if isinstance(areas, dict) else None,
        "elapsed_seconds": elapsed,
    }
