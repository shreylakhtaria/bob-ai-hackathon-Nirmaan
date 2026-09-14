"""
Feature engineering for failure prediction.

Produces one feature vector per (asset, as_of_time). Features combine:
  * rolling sensor statistics (24h mean/max, slopes / rate-of-change over 24h & 72h)
  * asset static attributes (age, maintenance recency, criticality, customers)
  * historical failure count up to as_of
  * forward weather forecast for the asset's area over the next 24h

Label = 1 if a FAILURE incident occurs for the asset within
(as_of, as_of + PREDICTION_HORIZON_HOURS].
"""
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from .. import config, db

SENSOR_COLS = ["temperature", "vibration", "oil_temperature", "oil_quality",
               "partial_discharge", "voltage", "current", "load_percentage", "humidity"]

FEATURE_ORDER = [
    "temp_mean_24", "temp_max_24", "temp_slope_24", "temp_slope_72",
    "vib_mean_24", "vib_max_24", "vib_slope_24",
    "pd_mean_24", "pd_max_24", "pd_slope_72",
    "oiltemp_max_24", "oilq_last", "oilq_slope_72",
    "load_mean_24", "load_max_24", "volt_min_24", "cur_max_24", "hum_mean_24",
    "age", "days_since_maint", "criticality", "log_customers", "downstream",
    "hist_failures",
    "wx_ews_max_24f", "wx_wind_max_24f", "wx_rain_sum_24f", "wx_storm_24f",
]

# Human-readable labels used in explanations
FEATURE_LABELS = {
    "temp_mean_24": "24h mean temperature", "temp_max_24": "24h peak temperature",
    "temp_slope_24": "temperature rise (24h)", "temp_slope_72": "temperature rise (72h)",
    "vib_mean_24": "24h mean vibration", "vib_max_24": "24h peak vibration",
    "vib_slope_24": "vibration rise (24h)",
    "pd_mean_24": "24h mean partial discharge", "pd_max_24": "24h peak partial discharge",
    "pd_slope_72": "partial-discharge rise (72h)",
    "oiltemp_max_24": "24h peak oil temperature",
    "oilq_last": "current oil quality", "oilq_slope_72": "oil-quality degradation (72h)",
    "load_mean_24": "24h mean loading", "load_max_24": "24h peak loading",
    "volt_min_24": "24h minimum voltage", "cur_max_24": "24h peak current",
    "hum_mean_24": "24h mean humidity",
    "age": "asset age (years)", "days_since_maint": "days since last maintenance",
    "criticality": "asset criticality", "log_customers": "customers served",
    "downstream": "downstream assets", "hist_failures": "historical failures",
    "wx_ews_max_24f": "forecast extreme-weather score (24h)",
    "wx_wind_max_24f": "forecast peak wind (24h)",
    "wx_rain_sum_24f": "forecast rainfall (24h)", "wx_storm_24f": "storm in forecast (24h)",
}

# Whether a HIGH value of the feature increases risk (for explanation direction)
HIGH_IS_BAD = {f: True for f in FEATURE_ORDER}
HIGH_IS_BAD.update({"oilq_last": False, "oilq_slope_72": False, "volt_min_24": False})


def _load_frames():
    sensors = pd.DataFrame(db.query("SELECT * FROM sensor_data"))
    sensors["timestamp"] = pd.to_datetime(sensors["timestamp"], utc=True)
    sensors = sensors.sort_values(["asset_id", "timestamp"]).reset_index(drop=True)

    assets = pd.DataFrame(db.query("SELECT * FROM assets"))
    weather = pd.DataFrame(db.query("SELECT * FROM weather_data"))
    weather["timestamp"] = pd.to_datetime(weather["timestamp"], utc=True)
    incidents = pd.DataFrame(db.query(
        "SELECT asset_id, incident_timestamp FROM incidents"))
    if not incidents.empty:
        incidents["ts"] = pd.to_datetime(incidents["incident_timestamp"], utc=True)
    return sensors, assets, weather, incidents


def _rolling_features(g):
    """Compute rolling features for one asset's hourly-sorted sensor frame."""
    out = pd.DataFrame(index=g.index)
    t, v, pd_, oq = g["temperature"], g["vibration"], g["partial_discharge"], g["oil_quality"]
    ot, ld, vo, cu, hu = (g["oil_temperature"], g["load_percentage"], g["voltage"],
                          g["current"], g["humidity"])
    out["temp_mean_24"] = t.rolling(24, min_periods=1).mean()
    out["temp_max_24"] = t.rolling(24, min_periods=1).max()
    out["temp_slope_24"] = t - t.shift(24)
    out["temp_slope_72"] = t - t.shift(72)
    out["vib_mean_24"] = v.rolling(24, min_periods=1).mean()
    out["vib_max_24"] = v.rolling(24, min_periods=1).max()
    out["vib_slope_24"] = v - v.shift(24)
    out["pd_mean_24"] = pd_.rolling(24, min_periods=1).mean()
    out["pd_max_24"] = pd_.rolling(24, min_periods=1).max()
    out["pd_slope_72"] = pd_ - pd_.shift(72)
    out["oiltemp_max_24"] = ot.rolling(24, min_periods=1).max()
    out["oilq_last"] = oq
    out["oilq_slope_72"] = oq - oq.shift(72)
    out["load_mean_24"] = ld.rolling(24, min_periods=1).mean()
    out["load_max_24"] = ld.rolling(24, min_periods=1).max()
    out["volt_min_24"] = vo.rolling(24, min_periods=1).min()
    out["cur_max_24"] = cu.rolling(24, min_periods=1).max()
    out["hum_mean_24"] = hu.rolling(24, min_periods=1).mean()
    out["timestamp"] = g["timestamp"].values
    out["asset_id"] = g["asset_id"].values
    return out


def _weather_forecast_lookup(weather):
    """area -> (sorted np array of ts int, ews, wind, rain, storm)."""
    idx = {}
    for area, grp in weather.groupby("geographic_area"):
        grp = grp.sort_values("timestamp")
        idx[area] = {
            "ts": grp["timestamp"].astype("int64").values,
            "ews": grp["extreme_weather_score"].values,
            "wind": grp["wind_speed"].values,
            "rain": grp["rainfall"].values,
            "storm": grp["storm_indicator"].values,
        }
    return idx


def _wx_next24(widx, area, as_of):
    d = widx.get(area)
    if d is None:
        return 0.0, 0.0, 0.0, 0.0
    t0 = np.int64(as_of.value)
    t1 = np.int64((as_of + timedelta(hours=24)).value)
    m = (d["ts"] > t0) & (d["ts"] <= t1)
    if not m.any():
        # fall back to nearest available (e.g. as_of == last weather row)
        m = d["ts"] >= t0
        if not m.any():
            return 0.0, 0.0, 0.0, 0.0
    return (float(d["ews"][m].max()), float(d["wind"][m].max()),
            float(d["rain"][m].sum()), float(d["storm"][m].max()))


def build_frames(snapshot_every_h=12, min_history_h=72):
    """Return (X_df, y, meta_df) training frame + a scoring frame at 'now'."""
    sensors, assets, weather, incidents = _load_frames()
    now = pd.to_datetime(db.get_meta("now"), utc=True)
    horizon = timedelta(hours=config.PREDICTION_HORIZON_HOURS)
    widx = _weather_forecast_lookup(weather)

    astatic = assets.set_index("asset_id")
    year_now = now.year

    # incidents per asset (sorted ts)
    inc_by_asset = {}
    if not incidents.empty:
        for aid, grp in incidents.groupby("asset_id"):
            inc_by_asset[aid] = np.sort(grp["ts"].values)

    feats_all = sensors.groupby("asset_id", group_keys=False).apply(_rolling_features)
    feats_all = feats_all.reset_index(drop=True)
    # .values strips tz above -> re-attach UTC so comparisons stay consistent
    feats_all["timestamp"] = pd.to_datetime(feats_all["timestamp"], utc=True)

    start = sensors["timestamp"].min() + timedelta(hours=min_history_h)
    train_rows, train_y, train_meta = [], [], []
    score_rows, score_meta = [], []

    for aid, g in feats_all.groupby("asset_id"):
        g = g.sort_values("timestamp").reset_index(drop=True)
        st = astatic.loc[aid]
        age = year_now - int(st["installation_year"])
        days_maint = (now - pd.to_datetime(st["last_maintenance_date"], utc=True)).days
        crit = float(st["criticality_score"])
        log_cust = float(np.log1p(st["customers_served"]))
        downstream = float(st["downstream_assets"])
        area = st["geographic_area"]
        inc_ts = inc_by_asset.get(aid, np.array([], dtype="datetime64[ns]"))

        def static_block(as_of, hist_failures):
            ews, wind, rain, storm = _wx_next24(widx, area, as_of)
            return {
                "age": age, "days_since_maint": days_maint, "criticality": crit,
                "log_customers": log_cust, "downstream": downstream,
                "hist_failures": hist_failures,
                "wx_ews_max_24f": ews, "wx_wind_max_24f": wind,
                "wx_rain_sum_24f": rain, "wx_storm_24f": storm,
            }

        # ---- training snapshots ----
        gg = g[g["timestamp"] >= start]
        # sample every snapshot_every_h hours
        gg = gg[gg["timestamp"].dt.hour % snapshot_every_h == 0]
        for _, row in gg.iterrows():
            as_of = row["timestamp"]
            if as_of > now - horizon:
                continue  # label not fully observable
            hist = int((inc_ts <= np.datetime64(as_of.tz_convert(None))).sum()) if inc_ts.size else 0
            # label: any incident in (as_of, as_of+horizon]
            if inc_ts.size:
                lo = np.datetime64(as_of.tz_convert(None))
                hi = np.datetime64((as_of + horizon).tz_convert(None))
                y = int(((inc_ts > lo) & (inc_ts <= hi)).any())
            else:
                y = 0
            feat = {k: row[k] for k in FEATURE_ORDER if k in row}
            feat.update(static_block(as_of, hist))
            train_rows.append(feat)
            train_y.append(y)
            train_meta.append({"asset_id": aid, "as_of": as_of.isoformat()})

        # ---- live scoring snapshot (latest row) ----
        last = g.iloc[-1]
        hist = int((inc_ts <= np.datetime64(now.tz_convert(None))).sum()) if inc_ts.size else 0
        feat = {k: last[k] for k in FEATURE_ORDER if k in last}
        feat.update(static_block(now, hist))
        score_rows.append(feat)
        score_meta.append({"asset_id": aid, "as_of": now.isoformat()})

    X = pd.DataFrame(train_rows)[FEATURE_ORDER].fillna(0.0)
    y = np.array(train_y)
    meta = pd.DataFrame(train_meta)
    Xs = pd.DataFrame(score_rows)[FEATURE_ORDER].fillna(0.0)
    smeta = pd.DataFrame(score_meta)
    return X, y, meta, Xs, smeta
