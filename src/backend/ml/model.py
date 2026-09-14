"""
Failure-prediction model + anomaly detector + explainability.

Pipeline:
  train()      -> time-aware split, train LightGBM (fallback GradientBoosting),
                  evaluate (ROC-AUC, PR-AUC, precision/recall/F1, precision@k),
                  fit IsolationForest anomaly detector, persist artefacts + metrics.
  score_all()  -> load latest feature snapshot per asset, produce
                  failure_probability, risk_level, window, confidence,
                  anomaly_score, and per-asset top_risk_factors (SHAP or
                  importance*deviation fallback). Persisted to `predictions`.
"""
import json
import warnings
from datetime import datetime, timedelta

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, IsolationForest
from sklearn.metrics import (average_precision_score, f1_score, precision_score,
                             recall_score, roc_auc_score)

from .. import config, db
from . import features as F

warnings.filterwarnings("ignore")

try:
    import lightgbm as lgb
    HAVE_LGB = True
except Exception:  # pragma: no cover
    HAVE_LGB = False


def risk_level(p):
    b = config.RISK_BANDS
    if p >= b["CRITICAL"]:
        return "CRITICAL"
    if p >= b["HIGH"]:
        return "HIGH"
    if p >= b["MEDIUM"]:
        return "MEDIUM"
    return "LOW"


def _precision_at_k(y_true, y_score, k):
    order = np.argsort(-y_score)
    topk = order[:k]
    return float(y_true[topk].sum() / max(1, k))


def _recall_at_k(y_true, y_score, k):
    order = np.argsort(-y_score)
    topk = order[:k]
    total_pos = max(1, int(y_true.sum()))
    return float(y_true[topk].sum() / total_pos)


def train():
    X, y, meta, Xs, smeta = F.build_frames()
    if y.sum() < 5:
        raise RuntimeError("Not enough positive failure labels to train. Re-seed data.")

    # time-aware split: sort snapshots by as_of, last 25% is the test set
    order = meta["as_of"].argsort().values
    Xo, yo = X.iloc[order].reset_index(drop=True), y[order]
    cut = int(len(Xo) * 0.75)
    Xtr, Xte = Xo.iloc[:cut], Xo.iloc[cut:]
    ytr, yte = yo[:cut], yo[cut:]

    if HAVE_LGB:
        model = lgb.LGBMClassifier(
            n_estimators=400, learning_rate=0.03, num_leaves=31,
            subsample=0.8, colsample_bytree=0.8, min_child_samples=20,
            class_weight="balanced", random_state=config.SEED, verbose=-1)
    else:
        model = GradientBoostingClassifier(random_state=config.SEED)
    model.fit(Xtr, ytr)

    proba = model.predict_proba(Xte)[:, 1]
    pred = (proba >= 0.5).astype(int)
    # k = size of an operator's realistic "top priority" queue
    k = int(min(len(yte), max(20, 1.5 * yte.sum())))
    metrics = {
        "model": "LightGBM" if HAVE_LGB else "GradientBoosting",
        "n_train": int(len(Xtr)), "n_test": int(len(Xte)),
        "positives_train": int(ytr.sum()), "positives_test": int(yte.sum()),
        "roc_auc": round(float(roc_auc_score(yte, proba)), 4) if yte.sum() else None,
        "pr_auc": round(float(average_precision_score(yte, proba)), 4) if yte.sum() else None,
        "precision": round(float(precision_score(yte, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(yte, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(yte, pred, zero_division=0)), 4),
        "precision_at_k": round(_precision_at_k(yte, proba, k), 4),
        "recall_at_k": round(_recall_at_k(yte, proba, k), 4),
        "k": k,
        "failures_found_in_topk": int(yte.values[np.argsort(-proba)[:k]].sum())
            if hasattr(yte, "values") else int(yte[np.argsort(-proba)[:k]].sum()),
        "trained_at": datetime.utcnow().isoformat(),
        "is_simulation": True,
    }

    # feature importances
    if HAVE_LGB:
        imp = dict(zip(F.FEATURE_ORDER, model.feature_importances_.astype(float)))
    else:
        imp = dict(zip(F.FEATURE_ORDER, model.feature_importances_.astype(float)))
    total = sum(imp.values()) or 1.0
    imp = {k2: v / total for k2, v in imp.items()}

    # anomaly detector on full feature matrix
    iso = IsolationForest(n_estimators=200, contamination=0.08,
                          random_state=config.SEED)
    iso.fit(Xo)

    # baseline stats for explanation deviations (median/std over population)
    baseline = {c: {"median": float(Xo[c].median()), "std": float(Xo[c].std() or 1.0)}
                for c in F.FEATURE_ORDER}

    joblib.dump(model, config.MODEL_PATH)
    joblib.dump(iso, config.ANOMALY_PATH)
    meta_blob = {"metrics": metrics, "importances": imp, "baseline": baseline,
                 "feature_order": F.FEATURE_ORDER}
    with open(config.META_PATH, "w") as f:
        json.dump(meta_blob, f, indent=2)
    db.set_meta("model_metrics", metrics)
    return metrics


def _load():
    model = joblib.load(config.MODEL_PATH)
    iso = joblib.load(config.ANOMALY_PATH)
    with open(config.META_PATH) as f:
        blob = json.load(f)
    return model, iso, blob


def _explain_row(x_row, proba, blob, model, X_shap=None, shap_vals=None, i=None):
    """Return list of {feature,label,value,contribution,direction} top drivers."""
    imp = blob["importances"]
    base = blob["baseline"]
    drivers = []
    for feat in F.FEATURE_ORDER:
        val = float(x_row[feat])
        med = base[feat]["median"]
        std = base[feat]["std"]
        z = (val - med) / std if std else 0.0
        # deviation in the "bad" direction only
        signed = z if F.HIGH_IS_BAD.get(feat, True) else -z
        contribution = imp.get(feat, 0.0) * max(0.0, signed)
        if shap_vals is not None and i is not None:
            sv = float(shap_vals[i][F.FEATURE_ORDER.index(feat)])
            contribution = max(contribution, sv)
        if signed > 0.4 and contribution > 0:
            drivers.append({
                "feature": feat, "label": F.FEATURE_LABELS.get(feat, feat),
                "value": round(val, 2), "z": round(float(z), 2),
                "contribution": round(float(contribution), 4),
                "direction": "high" if F.HIGH_IS_BAD.get(feat, True) else "low",
            })
    drivers.sort(key=lambda d: -d["contribution"])
    return drivers[:6]


def recommend_action(top_factors, asset_type, prob):
    if not top_factors:
        return "Continue standard monitoring."
    lead = top_factors[0]["feature"]
    mapping = {
        "pd_max_24": "Insulation / partial-discharge inspection",
        "pd_slope_72": "Insulation / partial-discharge inspection",
        "oilq_last": "Oil quality inspection and possible replacement",
        "oilq_slope_72": "Oil quality inspection and possible replacement",
        "oiltemp_max_24": "Cooling system and oil-temperature check",
        "temp_max_24": "Thermal inspection and load rebalancing",
        "temp_slope_24": "Thermal inspection and load rebalancing",
        "vib_max_24": "Mechanical inspection (bearings/contacts)",
        "vib_slope_24": "Mechanical inspection (bearings/contacts)",
        "load_max_24": "Load rebalancing / capacity review",
        "wx_ews_max_24f": "Pre-storm inspection and weather hardening",
        "wx_wind_max_24f": "Pre-storm inspection and weather hardening",
    }
    action = mapping.get(lead, "Detailed inspection")
    if prob >= config.RISK_BANDS["CRITICAL"]:
        return f"Immediate {action.lower()}"
    return action


def score_all():
    """Score every asset at 'now' and persist to predictions table."""
    model, iso, blob = _load()
    X, y, meta, Xs, smeta = F.build_frames()
    now = db.get_meta("now")

    proba = model.predict_proba(Xs)[:, 1]
    anom = -iso.score_samples(Xs)  # higher = more anomalous
    anom_norm = (anom - anom.min()) / (anom.ptp() or 1.0)

    # SHAP (best-effort; falls back silently to importance*deviation)
    shap_vals = None
    try:
        import shap
        explainer = shap.TreeExplainer(model)
        sv = explainer.shap_values(Xs)
        shap_vals = sv[1] if isinstance(sv, list) else sv
    except Exception:
        shap_vals = None

    assets = {a["asset_id"]: a for a in db.query("SELECT * FROM assets")}
    rows = []
    for i in range(len(Xs)):
        aid = smeta.iloc[i]["asset_id"]
        p = float(proba[i])
        lvl = risk_level(p)
        top = _explain_row(Xs.iloc[i], p, blob, model,
                           shap_vals=shap_vals, i=i)
        conf = float(np.clip(0.55 + 0.4 * abs(p - 0.5) * 2, 0.5, 0.98))
        window = f"next {config.PREDICTION_HORIZON_HOURS}h" if p >= config.RISK_BANDS["MEDIUM"] \
            else f"beyond {config.PREDICTION_HORIZON_HOURS}h"
        action = recommend_action(top, assets.get(aid, {}).get("asset_type", ""), p)
        rows.append({
            "asset_id": aid, "as_of": now, "failure_probability": round(p, 4),
            "risk_level": lvl, "predicted_failure_window": window,
            "confidence": round(conf, 3), "anomaly_score": round(float(anom_norm[i]), 4),
            "top_risk_factors": json.dumps(top),
            "recommended_action": action,
        })

    with db.session() as conn:
        for r in rows:
            conn.execute(
                """INSERT INTO predictions
                   (asset_id,as_of,failure_probability,risk_level,predicted_failure_window,
                    confidence,anomaly_score,top_risk_factors,recommended_action)
                   VALUES(:asset_id,:as_of,:failure_probability,:risk_level,
                    :predicted_failure_window,:confidence,:anomaly_score,
                    :top_risk_factors,:recommended_action)
                   ON CONFLICT(asset_id) DO UPDATE SET
                    as_of=excluded.as_of,
                    failure_probability=excluded.failure_probability,
                    risk_level=excluded.risk_level,
                    predicted_failure_window=excluded.predicted_failure_window,
                    confidence=excluded.confidence,
                    anomaly_score=excluded.anomaly_score,
                    top_risk_factors=excluded.top_risk_factors,
                    recommended_action=excluded.recommended_action""",
                r)
    return {"scored": len(rows)}


def get_metrics():
    return db.get_meta("model_metrics", {})
