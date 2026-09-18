"""
Data Onboarding & SCADA Ingestion Router.

Endpoints
---------
GET  /api/ingest/template          — download a blank CSV asset manifest template
POST /api/ingest/assets/csv        — batch-upsert assets from a multipart CSV upload
POST /api/ingest/assets/json       — batch-upsert assets from a JSON array body
POST /api/ingest/assets/single     — add or update a single asset (form-friendly JSON)
POST /api/ingest/telemetry         — ingest a single SCADA telemetry packet
POST /api/ingest/re-score          — re-run the full ML pipeline (synchronous)
POST /api/ingest/seed-telemetry    — backfill synthetic sensor history for assets with no data

All write operations are reflected in the audit_log table.
"""
from __future__ import annotations

import csv
import io
import json
import math
import random
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ValidationError

from .. import db
from ..schemas.ingest import AssetRecord, RescoreRequest, TelemetryPacket

router = APIRouter()

# ---------------------------------------------------------------------------
# Columns we write during an asset upsert.
# Must be a subset of the `assets` table columns; optional DB-only columns
# (manufacturer, downstream_assets, last_maintenance_date, current_status)
# are left untouched when the row already exists and NULL-initialised on insert.
# ---------------------------------------------------------------------------
_ASSET_COLS = [
    "asset_id", "asset_type", "substation_id", "geographic_area",
    "latitude", "longitude", "customers_served", "criticality_score",
    "installation_year", "rated_capacity",
]


def _upsert_assets(records: List[AssetRecord]):
    """INSERT OR REPLACE the given validated asset records. Returns (inserted, updated)."""
    existing_ids = {
        r["asset_id"]
        for r in db.query("SELECT asset_id FROM assets")
    }
    inserted = updated = 0
    for rec in records:
        data = rec.model_dump()
        vals = [data[c] for c in _ASSET_COLS]
        placeholders = ", ".join("?" * len(_ASSET_COLS))
        cols = ", ".join(_ASSET_COLS)
        db.query(
            f"INSERT OR REPLACE INTO assets ({cols}) VALUES ({placeholders})",
            tuple(vals),
        )
        if rec.asset_id in existing_ids:
            updated += 1
        else:
            inserted += 1
    return inserted, updated


def _parse_csv_rows(raw_bytes: bytes):
    """Parse CSV bytes into a list of (row_index, dict). Returns (rows, decode_error)."""
    try:
        text = raw_bytes.decode("utf-8-sig")  # strip BOM if present
    except UnicodeDecodeError:
        text = raw_bytes.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    return list(enumerate(reader, start=2)), None  # row 1 is the header


# ---------------------------------------------------------------------------
# GET /template
# ---------------------------------------------------------------------------
@router.get("/template")
def download_template():
    """Return a ready-to-fill CSV manifest template with one example row."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_ASSET_COLS)
    writer.writerow([
        "EXAMPLE-001", "Transformer", "SUB-A", "NORTH-04",
        23.05, 72.58, 450, 7.5, 2005, 100.0,
    ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="asset_template.csv"'},
    )


# ---------------------------------------------------------------------------
# POST /assets/csv
# ---------------------------------------------------------------------------
@router.post("/assets/csv")
async def ingest_assets_csv(file: UploadFile = File(...)):
    """Batch-upsert grid assets from a multipart CSV upload."""
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Uploaded file is empty.")

    rows, err = _parse_csv_rows(raw)
    if err:
        raise HTTPException(400, f"Cannot decode file: {err}")

    valid: List[AssetRecord] = []
    errors = []

    for row_num, row_dict in rows:
        # Strip whitespace from keys/values
        cleaned = {k.strip(): v.strip() for k, v in row_dict.items() if k}
        try:
            valid.append(AssetRecord(**cleaned))
        except (ValidationError, Exception) as exc:
            reason = _validation_reason(exc)
            errors.append({"row": row_num, "reason": reason})

    inserted = updated = 0
    if valid:
        inserted, updated = _upsert_assets(valid)
        db.audit("ingest", "asset_upsert_csv",
                 {"inserted": inserted, "updated": updated, "errors": len(errors)})

    return {"inserted": inserted, "updated": updated, "errors": errors}


# ---------------------------------------------------------------------------
# POST /assets/json
# ---------------------------------------------------------------------------
@router.post("/assets/json")
async def ingest_assets_json(records: List[AssetRecord]):
    """Batch-upsert grid assets from a JSON array body."""
    if not records:
        return {"inserted": 0, "updated": 0, "errors": []}

    inserted, updated = _upsert_assets(records)
    db.audit("ingest", "asset_upsert_json",
             {"inserted": inserted, "updated": updated})
    return {"inserted": inserted, "updated": updated, "errors": []}


# ---------------------------------------------------------------------------
# POST /telemetry
# ---------------------------------------------------------------------------
@router.post("/telemetry")
async def ingest_telemetry(packet: TelemetryPacket):
    """Append a single SCADA sensor reading to sensor_data."""
    ts = packet.timestamp
    if ts.tzinfo is not None:
        ts_str = ts.astimezone(timezone.utc).isoformat()
    else:
        ts_str = ts.isoformat()

    row = db.query_one(
        """INSERT INTO sensor_data
           (timestamp, asset_id, temperature, vibration, oil_temperature, oil_quality,
            partial_discharge, voltage, current, load_percentage, humidity)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)
           RETURNING id""",
        (
            ts_str, packet.asset_id,
            packet.temperature, packet.vibration, packet.oil_temperature,
            packet.oil_quality, packet.partial_discharge, packet.voltage,
            packet.current, packet.load_percentage, packet.humidity,
        ),
    )
    row_id = (row or {}).get("id")
    if row_id is None:
        # Fallback for SQLite builds without RETURNING support (< 3.35)
        row_id = db.query_one("SELECT last_insert_rowid() AS id")["id"]

    return {"status": "ok", "id": row_id}


# ---------------------------------------------------------------------------
# POST /re-score
# ---------------------------------------------------------------------------
@router.post("/re-score")
def re_score(req: RescoreRequest = None):
    """
    Re-run the full ML pipeline synchronously:
      build_frames → score_all → compute_impact → compute_area_risk

    Returns counts of scored assets and updated areas.
    """
    if req is None:
        req = RescoreRequest()

    # Lazy imports — keep startup fast and avoid circular import issues
    from ..ml.features import build_frames
    from ..ml.model import score_all
    from ..services.impact import compute_impact, compute_area_risk

    try:
        build_frames()
    except Exception as exc:
        raise HTTPException(500, f"Feature engineering failed: {exc}") from exc

    try:
        score_all()
    except Exception as exc:
        raise HTTPException(500, f"ML scoring failed: {exc}") from exc

    try:
        compute_impact()
        compute_area_risk()
    except Exception as exc:
        raise HTTPException(500, f"Impact computation failed: {exc}") from exc

    as_of = datetime.now(timezone.utc).isoformat()
    db.set_meta("last_rescore_at", as_of)

    scored = (db.query_one("SELECT COUNT(*) AS c FROM predictions") or {}).get("c", 0)
    areas_updated = (db.query_one("SELECT COUNT(*) AS c FROM area_risk") or {}).get("c", 0)

    db.audit("ingest", "re_score", {"scored": scored, "areas_updated": areas_updated, "as_of": as_of})

    return {"scored": scored, "areas_updated": areas_updated, "as_of": as_of}


# ---------------------------------------------------------------------------
# POST /assets/single  — manual single-asset add/update
# ---------------------------------------------------------------------------
@router.post("/assets/single")
async def ingest_asset_single(record: AssetRecord):
    """Add or update a single asset. Identical to /assets/json with one record."""
    inserted, updated = _upsert_assets([record])
    db.audit("ingest", "asset_upsert_single",
             {"asset_id": record.asset_id, "inserted": inserted, "updated": updated})
    return {
        "status": "ok",
        "asset_id": record.asset_id,
        "inserted": inserted,
        "updated": updated,
    }


# ---------------------------------------------------------------------------
# POST /seed-telemetry  — backfill synthetic sensor history
# ---------------------------------------------------------------------------
class SeedTelemetryRequest(BaseModel):
    asset_ids: Optional[List[str]] = None   # None → all assets with zero sensor rows
    history_hours: int = 504                 # 21 days matches the seeded dataset


@router.post("/seed-telemetry")
def seed_telemetry(req: SeedTelemetryRequest = None):
    """
    Generate and insert synthetic sensor history for assets that have no readings,
    then immediately run the full ML re-score pipeline so predictions appear instantly.

    Uses the same physics-based degradation model as scripts/seed.py so the
    generated telemetry is statistically consistent with the existing dataset.
    """
    if req is None:
        req = SeedTelemetryRequest()

    hours = max(72, min(req.history_hours, 1008))  # clamp 3d–6w

    # Determine which assets to backfill
    if req.asset_ids:
        candidates = [
            db.query_one("SELECT * FROM assets WHERE asset_id=?", (aid,))
            for aid in req.asset_ids
        ]
        candidates = [a for a in candidates if a is not None]
    else:
        # Only assets with zero existing sensor rows
        existing = {
            r["asset_id"]
            for r in db.query("SELECT DISTINCT asset_id FROM sensor_data")
        }
        candidates = [
            a for a in db.query("SELECT * FROM assets")
            if a["asset_id"] not in existing
        ]

    if not candidates:
        return {"seeded": 0, "rows_inserted": 0, "message": "No assets needed backfill"}

    rng = np.random.default_rng(42)
    now_str = db.get_meta("now")
    now = datetime.fromisoformat(now_str.replace("Z", "+00:00")) if now_str else datetime.now(timezone.utc)
    # strip tz for arithmetic — we'll re-attach on output
    now_naive = now.replace(tzinfo=None)
    start = now_naive - timedelta(hours=hours)

    rows_inserted = 0
    BATCH = 500  # insert in batches to avoid huge single transactions

    for asset in candidates:
        aid = asset["asset_id"]
        rated = float(asset.get("rated_capacity") or 50)
        inst_year = int(asset.get("installation_year") or (now_naive.year - 10))
        age = now_naive.year - inst_year
        crit = float(asset.get("criticality_score") or 5.0)
        cust = int(asset.get("customers_served") or 500)

        # Derive a degradation state from asset metadata
        # Higher criticality + older age → more interesting (but not broken) reading
        base_load = float(np.clip(rng.normal(55 + crit * 0.4, 10), 20, 95))
        degrading = crit >= 8.0 or age >= 12
        degrade_rate = rng.uniform(0.6, 1.2) if degrading else rng.uniform(0.05, 0.3)
        slope = degrade_rate * (0.5 + 0.02 * age + 0.004 * (base_load - 50)) / 1000.0

        t_base = 45 + 0.15 * base_load + rng.normal(0, 2)
        v_base = 1.2 + rng.normal(0, 0.15)
        pd_base = 30 + rng.normal(0, 5)
        oil_q_base = 88 + rng.normal(0, 3)
        health = rng.uniform(0.82, 0.97)

        batch: list = []
        for h in range(hours + 1):
            ts = start + timedelta(hours=h)
            ts_iso = ts.isoformat()

            stress = slope * (1 + rng.normal(0, 0.1))
            health = float(np.clip(health - stress + rng.normal(0, 0.0006), 0.0, 1.0))
            deg = 1.0 - health

            load = float(np.clip(
                base_load + 10 * math.sin((ts.hour / 24) * 2 * math.pi)
                + rng.normal(0, 3) + 20 * deg, 5, 115))

            temperature  = t_base + 0.25 * load + 35 * deg**1.4 + rng.normal(0, 1.2)
            oil_temp     = temperature + 8 + 20 * deg + rng.normal(0, 1.0)
            vibration    = v_base + 3.2 * deg**1.5 + 0.01 * (load - 50) + rng.normal(0, 0.08)
            pd           = pd_base + 260 * deg**2 + rng.normal(0, 4)
            oil_quality  = float(np.clip(oil_q_base - 45 * deg + rng.normal(0, 1.5), 5, 100))
            voltage      = float(np.clip(rng.normal(11.0, 0.15) - 0.6 * deg, 9.5, 12))
            current      = float(np.clip(load / 100 * rated * 5 + rng.normal(0, 3), 0, 800))
            humidity     = float(np.clip(rng.normal(58, 10), 20, 100))

            batch.append((
                ts_iso, aid,
                round(temperature, 2), round(vibration, 3), round(oil_temp, 2),
                round(oil_quality, 1), round(pd, 1), round(voltage, 3),
                round(current, 1), round(load, 1), round(humidity, 1),
            ))

            if len(batch) >= BATCH:
                with db.session() as conn:
                    conn.executemany(
                        """INSERT INTO sensor_data
                           (timestamp, asset_id, temperature, vibration, oil_temperature,
                            oil_quality, partial_discharge, voltage, current,
                            load_percentage, humidity)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                        batch,
                    )
                rows_inserted += len(batch)
                batch = []

        if batch:
            with db.session() as conn:
                conn.executemany(
                    """INSERT INTO sensor_data
                       (timestamp, asset_id, temperature, vibration, oil_temperature,
                        oil_quality, partial_discharge, voltage, current,
                        load_percentage, humidity)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                    batch,
                )
            rows_inserted += len(batch)

    db.audit("ingest", "seed_telemetry",
             {"seeded_assets": len(candidates), "rows_inserted": rows_inserted})

    # Immediately re-score so predictions appear without a manual re-score click
    from ..ml.features import build_frames
    from ..ml.model import score_all
    from ..services.impact import compute_impact, compute_area_risk
    try:
        build_frames()
        score_all()
        compute_impact()
        compute_area_risk()
        as_of = datetime.now(timezone.utc).isoformat()
        db.set_meta("last_rescore_at", as_of)
    except Exception as exc:
        # Telemetry was inserted — report partial success, don't roll back
        return {
            "seeded": len(candidates),
            "rows_inserted": rows_inserted,
            "rescore_error": str(exc),
        }

    return {
        "seeded": len(candidates),
        "rows_inserted": rows_inserted,
        "scored": (db.query_one("SELECT COUNT(*) AS c FROM predictions") or {}).get("c", 0),
    }


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
def _validation_reason(exc) -> str:
    """Produce a concise human-readable validation error string."""
    if isinstance(exc, ValidationError):
        errors = exc.errors()
        if errors:
            e = errors[0]
            loc = " → ".join(str(l) for l in e.get("loc", []))
            msg = e.get("msg", str(exc))
            return f"{loc}: {msg}" if loc else msg
    return str(exc)
