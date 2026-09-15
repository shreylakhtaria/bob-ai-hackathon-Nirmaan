"""
Thin data-access layer over stdlib sqlite3.

Why sqlite: zero-infra, reproducible local demo, ships in the Python stdlib.
The SQL is standard; to move to Postgres, swap `get_conn()` for a psycopg
connection and change AUTOINCREMENT/`?` placeholders. Everything else is portable.
"""
import sqlite3
import json
from contextlib import contextmanager
from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS assets (
    asset_id           TEXT PRIMARY KEY,
    asset_type         TEXT NOT NULL,
    substation_id      TEXT NOT NULL,
    geographic_area    TEXT NOT NULL,
    latitude           REAL,
    longitude          REAL,
    installation_year  INTEGER,
    manufacturer       TEXT,
    rated_capacity     REAL,
    criticality_score  REAL,
    customers_served   INTEGER,
    downstream_assets  INTEGER,          -- network fan-out (network criticality)
    last_maintenance_date TEXT,
    current_status     TEXT
);

CREATE TABLE IF NOT EXISTS sensor_data (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp         TEXT NOT NULL,
    asset_id          TEXT NOT NULL,
    temperature       REAL,
    vibration         REAL,
    oil_temperature   REAL,
    oil_quality       REAL,
    partial_discharge REAL,
    voltage           REAL,
    current           REAL,
    load_percentage   REAL,
    humidity          REAL
);
CREATE INDEX IF NOT EXISTS ix_sensor_asset_ts ON sensor_data(asset_id, timestamp);

CREATE TABLE IF NOT EXISTS weather_data (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp             TEXT NOT NULL,
    geographic_area       TEXT NOT NULL,
    temperature           REAL,
    rainfall              REAL,
    wind_speed            REAL,
    storm_indicator       INTEGER,
    lightning_indicator   INTEGER,
    humidity              REAL,
    extreme_weather_score REAL
);
CREATE INDEX IF NOT EXISTS ix_weather_area_ts ON weather_data(geographic_area, timestamp);

CREATE TABLE IF NOT EXISTS incidents (
    incident_id       TEXT PRIMARY KEY,
    asset_id          TEXT NOT NULL,
    incident_type     TEXT,
    incident_timestamp TEXT,
    outage_duration   REAL,          -- minutes
    customers_affected INTEGER,
    root_cause        TEXT,
    severity          TEXT,
    recovery_time     REAL           -- minutes
);

CREATE TABLE IF NOT EXISTS maintenance_history (
    maintenance_id  TEXT PRIMARY KEY,
    asset_id        TEXT NOT NULL,
    date            TEXT,
    maintenance_type TEXT,
    technician      TEXT,
    issue_found     TEXT,
    action_taken    TEXT,
    parts_replaced  TEXT,
    result          TEXT
);

CREATE TABLE IF NOT EXISTS crews (
    crew_id             TEXT PRIMARY KEY,
    current_area        TEXT,
    latitude            REAL,
    longitude           REAL,
    skill_type          TEXT,
    availability        TEXT,          -- AVAILABLE / ON_JOB / OFF
    equipment_capability TEXT,
    base_response_min   REAL,
    active_assignment   TEXT
);

-- Live model outputs (populated by scripts/seed.py -> ml.model.score_all)
CREATE TABLE IF NOT EXISTS predictions (
    asset_id              TEXT PRIMARY KEY,
    as_of                 TEXT,
    failure_probability   REAL,
    risk_level            TEXT,
    predicted_failure_window TEXT,
    confidence            REAL,
    anomaly_score         REAL,
    top_risk_factors      TEXT,       -- json list
    grid_impact_score     REAL,
    impact_components      TEXT,      -- json dict
    weather_risk          REAL,
    priority              TEXT,
    recommended_action    TEXT
);

CREATE TABLE IF NOT EXISTS area_risk (
    area_id             TEXT PRIMARY KEY,
    as_of               TEXT,
    outage_probability  REAL,
    risk_level          TEXT,
    expected_customers_affected INTEGER,
    weather_risk        REAL,
    high_risk_assets    INTEGER,
    contributing_factors TEXT        -- json list
);

CREATE TABLE IF NOT EXISTS alerts (
    alert_id          TEXT PRIMARY KEY,
    created_at        TEXT,
    priority          TEXT,
    asset_id          TEXT,
    area_id           TEXT,
    title             TEXT,
    reason            TEXT,
    recommended_action TEXT,
    acknowledged      INTEGER DEFAULT 0,
    acknowledged_at   TEXT
);

-- Operator actions taken from the UI (dispatch / schedule / defer / reposition).
-- These are real state changes, not UI-only affordances.
CREATE TABLE IF NOT EXISTS work_orders (
    wo_id         TEXT PRIMARY KEY,
    created_at    TEXT,
    asset_id      TEXT,
    area_id       TEXT,
    crew_id       TEXT,
    wo_type       TEXT,          -- DISPATCH | SCHEDULED | DEFERRED | PRE_POSITION | EMERGENCY
    status        TEXT,          -- OPEN | DEFERRED | CLOSED
    priority      TEXT,
    scheduled_for TEXT,
    eta_min       REAL,
    notes         TEXT
);
CREATE INDEX IF NOT EXISTS ix_wo_asset ON work_orders(asset_id);

CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         TEXT,
    actor      TEXT,
    action     TEXT,
    detail     TEXT
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- Operator accounts. Minimal role model: 'operator' (default) or 'admin' —
-- the app has no per-page permission matrix, so a single role flag is enough
-- to distinguish normal operators from admins in the audit log / future gating.
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name  TEXT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'operator',
    created_at    TEXT NOT NULL
);
"""


def get_conn():
    conn = sqlite3.connect(str(config.DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


@contextmanager
def session():
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _ensure_column(conn, table, column, ddl):
    """Additive migration so databases seeded by an older build keep working."""
    existing = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")


def init_db():
    with session() as conn:
        conn.executescript(SCHEMA)
        _ensure_column(conn, "alerts", "acknowledged", "acknowledged INTEGER DEFAULT 0")
        _ensure_column(conn, "alerts", "acknowledged_at", "acknowledged_at TEXT")
        _ensure_column(conn, "users", "display_name", "display_name TEXT")


def reset_db():
    """Drop all data tables (used by the seed pipeline)."""
    with session() as conn:
        conn.executescript(SCHEMA)
        for tbl in ["assets", "sensor_data", "weather_data", "incidents",
                    "maintenance_history", "crews", "predictions", "area_risk",
                    "alerts", "audit_log", "work_orders"]:
            conn.execute(f"DELETE FROM {tbl}")


def rows_to_dicts(rows):
    out = []
    for r in rows:
        d = dict(r)
        for k, v in list(d.items()):
            if isinstance(v, str) and v[:1] in ("[", "{"):
                try:
                    d[k] = json.loads(v)
                except (ValueError, TypeError):
                    pass
        out.append(d)
    return out


def query(sql, params=()):
    with session() as conn:
        return rows_to_dicts(conn.execute(sql, params).fetchall())


def query_one(sql, params=()):
    res = query(sql, params)
    return res[0] if res else None


def set_meta(key, value):
    with session() as conn:
        conn.execute(
            "INSERT INTO meta(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, json.dumps(value) if not isinstance(value, str) else value),
        )


def get_meta(key, default=None):
    row = query_one("SELECT value FROM meta WHERE key=?", (key,))
    if not row:
        return default
    val = row["value"]
    try:
        return json.loads(val)
    except (ValueError, TypeError):
        return val


def audit(actor, action, detail):
    from datetime import datetime, timezone
    with session() as conn:
        conn.execute(
            "INSERT INTO audit_log(ts,actor,action,detail) VALUES(?,?,?,?)",
            (datetime.now(timezone.utc).isoformat(), actor, action,
             json.dumps(detail) if not isinstance(detail, str) else detail),
        )
