from __future__ import annotations

import math
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class VariableCatalogItem(BaseModel):
    id: str
    name: str
    unit: str
    description: str
    source: str
    group: str = "Environment"
    trend_supported: bool = Field(default=True, alias="trendSupported")
    circular: bool = False


class RegionCenter(BaseModel):
    latitude: float
    longitude: float


class RegionCatalogItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    country: str
    geometry_name: str = Field(..., alias="geometryName")
    geometry_ref: str = Field(..., alias="geometryRef")
    boundary_state_codes: list[str] = Field(..., alias="boundaryStateCodes")
    center: RegionCenter


class AvailabilityResponse(BaseModel):
    variable_id: str
    region_id: str
    active_version: str
    available: bool
    start_date: date | None
    end_date: date | None
    warning: str | None = None


class GeoJSONPoint(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float]

    @field_validator("coordinates")
    @classmethod
    def validate_coordinates(cls, value: tuple[float, float]) -> tuple[float, float]:
        longitude, latitude = value
        if not math.isfinite(longitude) or not math.isfinite(latitude):
            raise ValueError("coordinates must be finite")
        if not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
            raise ValueError("coordinates must be valid WGS 84 longitude and latitude")
        return value


class AnalysisRequest(BaseModel):
    variable_id: str
    region_id: str
    start_date: date
    end_date: date
    dataset_version: str | None = None
    spatial_query: GeoJSONPoint | None = None

    @field_validator("variable_id", "region_id")
    @classmethod
    def clean_identifiers(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("identifier cannot be empty")
        return cleaned

    @model_validator(mode="after")
    def validate_dates(self) -> "AnalysisRequest":
        if self.start_date > self.end_date:
            raise ValueError("start_date must be before or equal to end_date")
        return self

    @field_validator("dataset_version")
    @classmethod
    def normalize_dataset_version(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class SeriesPoint(BaseModel):
    timestamp: str
    value: float | None
    unit: str
    quality_flags: str = "ok"
    coverage_fraction: float | None = None


class TrendResult(BaseModel):
    direction: Literal["increasing", "decreasing", "stable", "undetermined"]
    applicable: bool = True
    slope_per_decade: float | None
    slope_unit: str
    confidence_interval: tuple[float, float] | list[float] | None
    p_value: float | None
    alpha: float = 0.05
    estimator: str
    inference_method: str
    significant: bool | None


class AnalysisResponse(BaseModel):
    analysis_id: str
    schema_version: str
    dataset_version: str
    method_version: str
    variable_id: str
    region_id: str
    requested_period: dict[str, str]
    effective_period: dict[str, str]
    source: str
    product: str
    source_url: str
    retrieved_at: str
    region_version: str
    spatial_query: GeoJSONPoint | None = None
    series: list[SeriesPoint]
    analysis_series: list[SeriesPoint]
    trend: TrendResult
    quality: dict[str, Any]
    explanation: dict[str, str]
