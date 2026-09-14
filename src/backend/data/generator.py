"""
Synthetic-but-realistic data generator.

Design principle (per spec): NO uncorrelated random noise. Every failure is the
*consequence* of a latent degradation process that shows up in the sensors and
the weather BEFORE the incident, so a model can actually learn it.

Latent model per asset:
    health(t) decreases over time at a rate driven by:
        - asset age
        - chronic overloading
        - poor maintenance recency
        - a hidden "degrading" flag for a subset of assets
    When health crosses a threshold (accelerated by a weather stress spike),
    a failure incident is recorded, and the trailing sensors show:
        - rising temperature / oil_temperature
        - rising vibration
        - rising partial_discharge
        - falling oil_quality
Weather is generated per-area with a scripted storm front approaching NORTH-04
near "now" so the demo scenario is deterministic.
"""
import math
import random
from datetime import datetime, timedelta, timezone

import numpy as np

from .. import config, db

RNG = None


def _reset_rng():
    global RNG
    RNG = np.random.default_rng(config.SEED)
    random.seed(config.SEED)


def _haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Assets
# ---------------------------------------------------------------------------
def _make_assets(now):
    assets = []
    type_prefix = {"Transformer": "T", "CircuitBreaker": "CB", "Substation": "SS",
                   "Switchgear": "SW", "Feeder": "FD"}
    # start high so generated IDs never collide with the reserved hero id T-1024
    counters = {k: 4000 for k in type_prefix}

    # Deterministic hero asset for the demo scenario.
    hero = {
        "asset_id": "T-1024", "asset_type": "Transformer", "geographic_area": "NORTH-04",
        "installation_year": now.year - 17, "manufacturer": "ABB",
        "rated_capacity": 120.0, "criticality_score": 94.0, "customers_served": 48200,
        "downstream_assets": 9, "degrading": True, "degrade_rate": config.HERO_DEGRADE_RATE,
    }

    for i in range(config.N_ASSETS - 1):
        atype = random.choices(config.ASSET_TYPES, weights=[30, 22, 12, 18, 18])[0]
        area = random.choice(config.GEO_AREAS)
        counters[atype] += 1
        aid = f"{type_prefix[atype]}-{counters[atype]}"
        age = int(np.clip(RNG.normal(14, 8), 1, 45))
        # bigger equipment serves more customers
        base_cust = {"Transformer": 12000, "Substation": 40000, "Feeder": 6000,
                     "CircuitBreaker": 9000, "Switchgear": 8000}[atype]
        customers = int(max(200, RNG.normal(base_cust, base_cust * 0.5)))
        crit = float(np.clip(RNG.normal(55, 20) + (customers / 60000) * 20, 5, 99))
        # ~22% of assets are on a degradation trajectory
        degrading = RNG.random() < 0.22
        assets.append({
            "asset_id": aid, "asset_type": atype, "geographic_area": area["area_id"],
            "installation_year": now.year - age, "manufacturer": random.choice(config.MANUFACTURERS),
            "rated_capacity": round(float(np.clip(RNG.normal(80, 30), 10, 200)), 1),
            "criticality_score": round(crit, 1), "customers_served": customers,
            "downstream_assets": int(np.clip(RNG.poisson(3) + (atype == "Substation") * 5, 0, 20)),
            "degrading": degrading,
            "degrade_rate": float(RNG.uniform(0.8, 1.6)) if degrading else float(RNG.uniform(0.05, 0.25)),
        })
    assets.append(hero)

    # geo-cluster around area centroid + substation grouping
    for a in assets:
        centroid = next(g for g in config.GEO_AREAS if g["area_id"] == a["geographic_area"])
        a["latitude"] = round(centroid["lat"] + RNG.normal(0, 0.02), 5)
        a["longitude"] = round(centroid["lon"] + RNG.normal(0, 0.02), 5)
        a["substation_id"] = f"{a['geographic_area']}-SS{random.randint(1, 4)}"
        # chronic loading profile (used to drive degradation + sensors)
        a["base_load"] = float(np.clip(RNG.normal(62, 15), 20, 98))
        age = now.year - a["installation_year"]
        a["age"] = age
        days_since_maint = int(np.clip(RNG.normal(210, 160), 5, 900))
        a["last_maintenance_date"] = (now - timedelta(days=days_since_maint)).date().isoformat()
        a["days_since_maint"] = days_since_maint
        a["current_status"] = "IN_SERVICE"
    return assets


# ---------------------------------------------------------------------------
# Weather (per area, hourly) with scripted storm front on NORTH-04 near "now"
# ---------------------------------------------------------------------------
def _make_weather(now, hours):
    rows = []
    start = now - timedelta(hours=hours)
    # storm window: from now-6h to now+18h, centred on NORTH-04 & NORTH-01
    for area in config.GEO_AREAS:
        base_temp = RNG.uniform(26, 33)
        for h in range(hours + 24):  # include +24h forecast
            ts = start + timedelta(hours=h)
            rel = (ts - now).total_seconds() / 3600.0  # hours relative to now
            diurnal = 4 * math.sin((ts.hour / 24) * 2 * math.pi)
            temp = base_temp + diurnal + RNG.normal(0, 1.2)
            rainfall = max(0, RNG.normal(0.2, 0.5))
            wind = max(0, RNG.normal(14, 5))
            storm = 0
            lightning = 0
            # scripted storm on northern areas
            if area["area_id"] in ("NORTH-04", "NORTH-01") and -6 <= rel <= 18:
                intensity = math.exp(-((rel - 6) ** 2) / (2 * 6 ** 2))  # peak +6h
                wind += 60 * intensity
                rainfall += 9 * intensity
                storm = 1 if intensity > 0.4 else 0
                lightning = 1 if intensity > 0.55 else 0
                temp -= 4 * intensity
            humidity = float(np.clip(RNG.normal(60, 12) + rainfall * 3, 20, 100))
            ews = float(np.clip(
                0.4 * min(wind / 90, 1) + 0.3 * min(rainfall / 12, 1) +
                0.2 * storm + 0.1 * lightning, 0, 1) * 100)
            rows.append({
                "timestamp": ts.isoformat(), "geographic_area": area["area_id"],
                "temperature": round(temp, 2), "rainfall": round(rainfall, 2),
                "wind_speed": round(wind, 1), "storm_indicator": storm,
                "lightning_indicator": lightning, "humidity": round(humidity, 1),
                "extreme_weather_score": round(ews, 1),
            })
    return rows


def _area_ews_at(weather_rows, area, ts_iso):
    # helper index built later; for generation we approximate via dict
    return None


# ---------------------------------------------------------------------------
# Sensors + incidents (the correlated core)
# ---------------------------------------------------------------------------
def _make_sensors_and_incidents(assets, weather_rows, now, hours):
    sensors = []
    incidents = []
    inc_counter = 1
    start = now - timedelta(hours=hours)

    # index weather by (area, iso-hour) for stress coupling
    wx = {}
    for w in weather_rows:
        wx[(w["geographic_area"], w["timestamp"])] = w["extreme_weather_score"]

    for a in assets:
        area = a["geographic_area"]
        survivor = a.get("degrading") and a["asset_id"] == "T-1024"  # hero: no failure, ends high-deg
        cooldown_until = -1
        # latent health starts near 1.0 (healthy) and decays
        health = RNG.uniform(0.82, 0.98)
        # per-asset degradation slope per hour
        slope = a["degrade_rate"] * (
            0.5 + 0.02 * a["age"] + 0.004 * (a["base_load"] - 50)
            + 0.0006 * a["days_since_maint"]) / 1000.0
        failed_at = None
        # sensor baselines
        t_base = 45 + 0.15 * a["base_load"] + RNG.normal(0, 2)
        v_base = 1.2 + RNG.normal(0, 0.15)
        pd_base = 30 + RNG.normal(0, 5)          # partial discharge (pC)
        oil_q_base = 88 + RNG.normal(0, 3)       # oil quality index (higher=better)

        for h in range(hours + 1):
            ts = start + timedelta(hours=h)
            ts_iso = ts.isoformat()
            ews = wx.get((area, ts_iso), 10.0)

            # weather adds acute stress to degradation
            stress = slope * (1 + ews / 40.0)
            health = max(0.0, health - stress + RNG.normal(0, 0.0006))

            # Hero: controlled accelerating curve -> in-range magnitudes + rising
            # slopes at 'now' so it reads as a genuine pre-failure asset.
            if survivor:
                frac = h / hours
                health = 1.0 - config.HERO_TARGET_DEG * (frac ** config.HERO_CURVE_EXP) \
                    + RNG.normal(0, 0.004)

            health = min(1.0, max(0.0, health))
            deg = 1.0 - health  # 0 healthy .. 1 failing

            # diurnal + weather-coupled load
            load = float(np.clip(
                a["base_load"] + 10 * math.sin((ts.hour / 24) * 2 * math.pi)
                + 0.15 * ews + RNG.normal(0, 3) + 25 * deg, 5, 115))

            temperature = t_base + 0.25 * load + 35 * deg**1.4 + 0.08 * ews + RNG.normal(0, 1.2)
            oil_temp = temperature + 8 + 20 * deg + RNG.normal(0, 1.0)
            vibration = v_base + 3.2 * deg**1.5 + 0.01 * (load - 50) + RNG.normal(0, 0.08)
            partial_discharge = pd_base + 260 * deg**2 + 0.4 * ews * deg + RNG.normal(0, 4)
            oil_quality = float(np.clip(oil_q_base - 45 * deg + RNG.normal(0, 1.5), 5, 100))
            voltage = float(np.clip(RNG.normal(11.0, 0.15) - 0.6 * deg, 9.5, 12))  # kV pu-ish
            current = float(np.clip(load / 100 * a["rated_capacity"] * 5 + RNG.normal(0, 3), 0, 800))
            humidity = float(np.clip(RNG.normal(58, 10) + 0.2 * ews, 20, 100))

            sensors.append((
                ts_iso, a["asset_id"], round(temperature, 2), round(vibration, 3),
                round(oil_temp, 2), round(oil_quality, 1), round(partial_discharge, 1),
                round(voltage, 3), round(current, 1), round(load, 1), round(humidity, 1),
            ))

            # Smooth probabilistic failure HAZARD (not a hard threshold).
            # Hazard rises with degradation and acute weather stress, so failures
            # occur across a RANGE of degradation -> overlapping labels ->
            # calibrated (non-saturated) probabilities the model can learn.
            if (not survivor) and h > 36 and h > cooldown_until:
                sev_deg = np.clip((deg - 0.30) / 0.70, 0, 1)
                hazard = 0.045 * (sev_deg ** 1.8) * (1 + ews / 50.0)
                if RNG.random() < hazard:
                    sev = "CRITICAL" if a["customers_served"] > 25000 else \
                          "HIGH" if a["customers_served"] > 8000 else "MEDIUM"
                    cust_aff = int(a["customers_served"] * RNG.uniform(0.4, 1.0))
                    dur = float(np.clip(RNG.normal(180, 90), 20, 600))
                    root = random.choice([
                        "Insulation breakdown", "Overheating", "Mechanical wear",
                        "Oil degradation", "Weather-induced fault", "Partial discharge fault"])
                    incidents.append((
                        f"INC-{inc_counter:05d}", a["asset_id"], "FAILURE", ts_iso,
                        round(dur, 1), cust_aff, root, sev, round(dur * RNG.uniform(1.1, 1.6), 1),
                    ))
                    inc_counter += 1
                    # partial repair (realistic) + cooldown; avoids a saturating gap
                    health = min(0.92, health + RNG.uniform(0.30, 0.50))
                    cooldown_until = h + 60
                    a["current_status"] = "IN_SERVICE"

        # some purely historical incidents (older, for base-rate learning)
        for _ in range(RNG.poisson(0.6 + a["age"] * 0.03)):
            ts = now - timedelta(hours=int(RNG.uniform(hours, hours * 6)))
            incidents.append((
                f"INC-{inc_counter:05d}", a["asset_id"], "FAILURE", ts.isoformat(),
                round(float(np.clip(RNG.normal(150, 80), 20, 500)), 1),
                int(a["customers_served"] * RNG.uniform(0.3, 0.9)),
                random.choice(["Overheating", "Mechanical wear", "Oil degradation"]),
                random.choice(["MEDIUM", "HIGH"]),
                round(float(np.clip(RNG.normal(200, 90), 30, 600)), 1),
            ))
            inc_counter += 1

    return sensors, incidents


# ---------------------------------------------------------------------------
# Maintenance + crews
# ---------------------------------------------------------------------------
def _make_maintenance(assets, now):
    rows = []
    n = 1
    techs = ["R. Nair", "S. Patel", "A. Kumar", "M. Shah", "J. Verma", "P. Rao"]
    for a in assets:
        for k in range(random.randint(1, 4)):
            d = now - timedelta(days=int(RNG.uniform(30, 900)))
            issue = random.choice(["None", "Minor oil leak", "Loose contact",
                                   "High temperature", "Vibration noted", "Insulation wear"])
            rows.append((
                f"MNT-{n:05d}", a["asset_id"], d.date().isoformat(),
                random.choice(["Routine", "Corrective", "Inspection", "Overhaul"]),
                random.choice(techs), issue,
                random.choice(["Cleaned", "Tightened", "Replaced part", "Topped oil", "No action"]),
                random.choice(["", "Bushing", "Gasket", "Contact set", "Cooling fan"]),
                random.choice(["OK", "OK", "OK", "Follow-up needed"]),
            ))
            n += 1
    return rows


def _make_crews(now):
    crews = []
    skills = ["Transformer", "Switchgear", "General", "HighVoltage", "Feeder"]
    for i in range(1, 9):
        area = random.choice(config.GEO_AREAS)
        crews.append((
            f"C-{i:02d}", area["area_id"],
            round(area["lat"] + RNG.normal(0, 0.02), 5),
            round(area["lon"] + RNG.normal(0, 0.02), 5),
            random.choice(skills),
            random.choices(["AVAILABLE", "ON_JOB", "OFF"], weights=[6, 3, 1])[0],
            random.choice(["Bucket truck", "Crane", "Standard", "Mobile substation"]),
            round(float(np.clip(RNG.normal(28, 8), 10, 60)), 1),
            "",
        ))
    # guarantee an available crew near West for the demo (C-04 -> reposition to NORTH-04)
    west = next(g for g in config.GEO_AREAS if g["area_id"] == "WEST-05")
    crews[3] = ("C-04", "WEST-05", round(west["lat"], 5), round(west["lon"], 5),
                "Transformer", "AVAILABLE", "Crane", 30.0, "")
    return crews


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------
def generate_all(now=None):
    _reset_rng()
    if now is None:
        now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    hours = config.HISTORY_DAYS * 24

    assets = _make_assets(now)
    weather = _make_weather(now, hours)
    sensors, incidents = _make_sensors_and_incidents(assets, weather, now, hours)
    maintenance = _make_maintenance(assets, now)
    crews = _make_crews(now)

    db.reset_db()
    with db.session() as conn:
        conn.executemany(
            """INSERT INTO assets(asset_id,asset_type,substation_id,geographic_area,latitude,
               longitude,installation_year,manufacturer,rated_capacity,criticality_score,
               customers_served,downstream_assets,last_maintenance_date,current_status)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [(a["asset_id"], a["asset_type"], a["substation_id"], a["geographic_area"],
              a["latitude"], a["longitude"], a["installation_year"], a["manufacturer"],
              a["rated_capacity"], a["criticality_score"], a["customers_served"],
              a["downstream_assets"], a["last_maintenance_date"], a["current_status"])
             for a in assets])

        conn.executemany(
            """INSERT INTO sensor_data(timestamp,asset_id,temperature,vibration,oil_temperature,
               oil_quality,partial_discharge,voltage,current,load_percentage,humidity)
               VALUES(?,?,?,?,?,?,?,?,?,?,?)""", sensors)

        conn.executemany(
            """INSERT INTO weather_data(timestamp,geographic_area,temperature,rainfall,wind_speed,
               storm_indicator,lightning_indicator,humidity,extreme_weather_score)
               VALUES(?,?,?,?,?,?,?,?,?)""",
            [(w["timestamp"], w["geographic_area"], w["temperature"], w["rainfall"],
              w["wind_speed"], w["storm_indicator"], w["lightning_indicator"],
              w["humidity"], w["extreme_weather_score"]) for w in weather])

        conn.executemany(
            """INSERT INTO incidents(incident_id,asset_id,incident_type,incident_timestamp,
               outage_duration,customers_affected,root_cause,severity,recovery_time)
               VALUES(?,?,?,?,?,?,?,?,?)""", incidents)

        conn.executemany(
            """INSERT INTO maintenance_history(maintenance_id,asset_id,date,maintenance_type,
               technician,issue_found,action_taken,parts_replaced,result)
               VALUES(?,?,?,?,?,?,?,?,?)""", maintenance)

        conn.executemany(
            """INSERT INTO crews(crew_id,current_area,latitude,longitude,skill_type,availability,
               equipment_capability,base_response_min,active_assignment)
               VALUES(?,?,?,?,?,?,?,?,?)""", crews)

    db.set_meta("now", now.isoformat())
    db.set_meta("is_simulation", True)
    db.set_meta("generated_at", datetime.now(timezone.utc).isoformat())
    return {
        "now": now.isoformat(), "assets": len(assets), "sensor_rows": len(sensors),
        "weather_rows": len(weather), "incidents": len(incidents),
        "maintenance_rows": len(maintenance), "crews": len(crews),
    }


if __name__ == "__main__":
    db.init_db()
    print(generate_all())
