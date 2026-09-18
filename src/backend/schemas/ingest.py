"""
Pydantic v2 schemas for the Data Onboarding & SCADA Ingestion endpoints.

Field names in AssetRecord match the `assets` table columns exactly so that
upsert SQL can be built directly from model_dump().
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class AssetRecord(BaseModel):
    asset_id: str = Field(..., min_length=1)
    asset_type: str = Field(..., min_length=1)
    substation_id: str = Field(..., min_length=1)
    geographic_area: str = Field(..., min_length=1)
    latitude: float
    longitude: float
    customers_served: int = Field(..., ge=0)
    criticality_score: float = Field(..., ge=0.0, le=10.0)
    installation_year: int = Field(..., ge=1900, le=2100)
    rated_capacity: float = Field(..., gt=0.0)


class TelemetryPacket(BaseModel):
    asset_id: str = Field(..., min_length=1)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    temperature: Optional[float] = None
    vibration: Optional[float] = None
    oil_temperature: Optional[float] = None
    oil_quality: Optional[float] = None
    partial_discharge: Optional[float] = None
    voltage: Optional[float] = None
    current: Optional[float] = None
    load_percentage: Optional[float] = None
    humidity: Optional[float] = None

    @field_validator("timestamp", mode="before")
    @classmethod
    def _parse_ts(cls, v):
        if v is None:
            return datetime.now(timezone.utc)
        if isinstance(v, str):
            # Accept ISO strings with or without timezone
            try:
                return datetime.fromisoformat(v.replace("Z", "+00:00"))
            except ValueError:
                raise ValueError(f"Cannot parse timestamp: {v!r}")
        return v


class RescoreRequest(BaseModel):
    asset_ids: Optional[List[str]] = None


class IngestionStatusResponse(BaseModel):
    last_telemetry_at: Optional[str] = None
    total_telemetry_rows: int
    onboarded_asset_count: int
    last_rescore_at: Optional[str] = None
