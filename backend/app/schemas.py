from __future__ import annotations

import math
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_serializer, model_validator
from typing_extensions import TypedDict


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
    center: RegionCenter | None


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

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def validate_iso_date(cls, value: object) -> date:
        if type(value) is date:
            return value
        if isinstance(value, str):
            try:
                parsed = date.fromisoformat(value)
                if parsed.isoformat() == value:
                    return parsed
            except ValueError:
                pass
        raise ValueError("date must use ISO YYYY-MM-DD")

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
    inference_status: Literal["validated", "descriptive", "insufficient_data", "unsupported"] | None = None
    inference_reason: str | None = None

    @model_validator(mode="after")
    def require_consistent_inference(self) -> "TrendResult":
        status = self.inference_status
        if status is None and not self.model_fields_set.intersection({"inference_status", "inference_reason"}):
            return self
        if status is None or "inference_reason" not in self.model_fields_set:
            raise ValueError("Both inference fields are required for a new result")

        evidence = (self.p_value, self.confidence_interval, self.significant)
        if status == "validated":
            if not self.applicable or self.slope_per_decade is None or any(item is None for item in evidence):
                raise ValueError("Validated inference requires a slope and complete inferential evidence")
        else:
            if not self.inference_reason or any(item is not None for item in evidence):
                raise ValueError("Restricted inference requires a reason and null inferential fields")
            if status == "descriptive":
                if not self.applicable or self.slope_per_decade is None:
                    raise ValueError("Descriptive trends require an applicable slope")
            elif self.applicable or self.slope_per_decade is not None or self.direction != "undetermined":
                raise ValueError("Unavailable trends require a null slope and undetermined direction")
        return self

    @model_serializer(mode="wrap")
    def preserve_legacy_shape(self, handler):
        result = handler(self)
        if self.inference_status is None:
            result.pop("inference_status", None)
            result.pop("inference_reason", None)
        return result


class RequestedPeriod(TypedDict):
    start_date: str
    end_date: str


class EffectivePeriod(TypedDict):
    start_date: str | None
    end_date: str | None


class AnalysisResponse(BaseModel):
    analysis_id: str
    schema_version: str
    dataset_version: str
    method_version: str
    variable_id: str
    region_id: str
    requested_period: RequestedPeriod
    effective_period: EffectivePeriod
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


class DescriptiveStatistics(BaseModel):
    count: int
    mean: float
    median: float
    min: float
    max: float
    standard_deviation: float | None


class ForecastPoint(BaseModel):
    timestamp: str
    value: float


class MonthlyForecast(BaseModel):
    method: str
    points: list[ForecastPoint]
    backtest_mae: float | None
    backtest_count: int


class NasaAnalysisResponse(AnalysisResponse):
    statistics: DescriptiveStatistics | None
    forecast: MonthlyForecast | None


class SavedAnalysisSummary(BaseModel):
    analysis_id: str
    variable_id: str
    region_id: str
    product: str
    start_date: date
    end_date: date
    retrieved_at: str
