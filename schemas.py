from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field


class VariableCatalogItem(BaseModel):
    id: str
    name: str
    unit: str
    description: str
    source: str


class RegionCatalogItem(BaseModel):
    id: str
    name: str
    country: str
    geometry_name: str = Field(..., alias="geometryName")
    geometry_ref: str = Field(..., alias="geometryRef")


class AvailabilityResponse(BaseModel):
    variable_id: str
    region_id: str
    active_version: str
    available: bool
    start_date: date
    end_date: date
    warning: str | None = None


class AnalysisRequest(BaseModel):
    variable_id: str
    region_id: str
    start_date: date
    end_date: date
    dataset_version: str | None = None


class SeriesPoint(BaseModel):
    timestamp: str
    value: float | None
    unit: str
    quality_flags: str = "ok"


class TrendResult(BaseModel):
    direction: Literal["increasing", "decreasing", "stable", "undetermined"]
    slope_per_decade: float | None
    slope_unit: str
    confidence_interval: tuple[float, float] | None
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
    series: list[SeriesPoint]
    analysis_series: list[SeriesPoint]
    trend: TrendResult
    quality: dict[str, Any]
    explanation: dict[str, str]
