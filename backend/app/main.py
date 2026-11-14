from __future__ import annotations

import csv
import io
import uuid
from datetime import date

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.config import API_PREFIX, APP_NAME, APP_VERSION, DATA_SOURCE
from app.data_catalog import VARIABLES, REGIONS, get_region, get_variable
from app.schemas import AnalysisRequest, AnalysisResponse, AvailabilityResponse, GeoJSONPoint, RegionCatalogItem, SeriesPoint, VariableCatalogItem
from app.services.meteomatics import (
    METHOD_VERSION as METEOMATICS_METHOD_VERSION,
    SOURCE_URL as METEOMATICS_SOURCE_URL,
    MeteomaticsConfigurationError,
    MeteomaticsRequestError,
    MeteomaticsResponseError,
    UnsupportedMeteomaticsVariable,
    configured_model,
    fetch_monthly_series,
    parameter_spec,
    supported_variable,
)
from app.science.trend import analyze_time_series

app = FastAPI(title=APP_NAME, version=APP_VERSION)


def _build_analysis_payload(
    variable_id: str,
    region_id: str,
    start_date: date,
    end_date: date,
    dataset_version: str | None = None,
    spatial_query: GeoJSONPoint | None = None,
) -> AnalysisResponse:
    variable = get_variable(variable_id)
    region = get_region(region_id)
    if variable is None:
        raise HTTPException(status_code=404, detail="Unknown variable")
    if region is None:
        raise HTTPException(status_code=404, detail="Unknown region")
    if start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must be before or equal to end_date")

    if not supported_variable(variable_id):
        raise HTTPException(
            status_code=422,
            detail="No validated Meteomatics parameter is configured for this variable",
        )
    if dataset_version and dataset_version != "meteomatics-live":
        raise HTTPException(
            status_code=409,
            detail="The requested dataset_version is not available from the live Meteomatics source",
        )
    try:
        data = fetch_monthly_series(
            variable_id,
            region,
            start_date,
            end_date,
            spatial_query=spatial_query.model_dump() if spatial_query else None,
        )
    except MeteomaticsConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except UnsupportedMeteomaticsVariable as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (MeteomaticsRequestError, MeteomaticsResponseError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Meteomatics data could not be retrieved or parsed",
        ) from exc

    series = data["series"]
    spatial_query = {
        "type": "Point",
        "coordinates": [data["longitude"], data["latitude"]],
    }
    effective_version = "meteomatics-live"
    source = "Meteomatics Weather API"
    product = f"model={data['model']}; parameter={data['parameter']}"
    source_url = METEOMATICS_SOURCE_URL
    retrieved_at = data["retrieved_at"]
    quality = {
        "sample_count": data["sample_count"],
        "expected_count": data["expected_count"],
        "coverage_fraction": round(data["coverage_fraction"], 6),
        "hourly_coverage_fraction": round(data["hourly_coverage_fraction"], 6),
        "warnings": data["warnings"],
    }
    limitations = (
        "Values are hourly model output aggregated to complete calendar months at the selected "
        "point, not an area-weighted regional average. The live provider response is not an "
        "immutable archived dataset, and trend inference has not been validated for the selected "
        "Meteomatics product."
    )

    if data.get("supports_trend", True):
        trend = analyze_time_series(series)
        trend_applicable = True
        summary = (
            f"The {variable['name']} point time series associated with {region['name']} "
            f"shows a {trend['direction']} trend over the selected period."
        )
    else:
        trend = {
            "direction": "undetermined",
            "slope_per_decade": None,
            "slope_unit": variable["unit"],
            "confidence_interval": None,
            "p_value": None,
            "alpha": 0.05,
            "significant": None,
            "estimator": "not_applicable",
            "inference_method": "circular_data",
        }
        trend_applicable = False
        summary = (
            f"The {variable['name']} point time series is charted as a circular monthly mean. "
            "A linear trend is not calculated for wind direction."
        )
    analysis_id = str(uuid.uuid4())
    analysis_series = [
        SeriesPoint(
            timestamp=point["timestamp"],
            value=point["value"],
            unit=point["unit"],
            quality_flags=point["quality_flags"],
            coverage_fraction=point.get("coverage_fraction"),
        )
        for point in series
    ]

    explanation = {
        "summary": summary,
        "limitations": limitations,
    }

    payload = {
        "analysis_id": analysis_id,
        "schema_version": "1.0",
        "dataset_version": effective_version,
        "method_version": METEOMATICS_METHOD_VERSION,
        "variable_id": variable_id,
        "region_id": region_id,
        "requested_period": {"start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
        "effective_period": {"start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
        "source": source,
        "product": product,
        "source_url": source_url,
        "retrieved_at": retrieved_at,
        "region_version": "selected-point-v1",
        "spatial_query": spatial_query,
        "series": [point.model_dump() for point in analysis_series],
        "analysis_series": [point.model_dump() for point in analysis_series],
        "trend": {
            **trend,
            "slope_unit": variable["unit"],
            "applicable": trend_applicable,
        },
        "quality": quality,
        "explanation": explanation,
    }
    return AnalysisResponse.model_validate(payload)


@app.get("/health")
@app.get(f"{API_PREFIX}/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": APP_NAME,
        "version": APP_VERSION,
        "data_source": DATA_SOURCE,
    }


@app.get(f"{API_PREFIX}/variables")
def list_variables() -> list[dict]:
    try:
        model = configured_model()
    except MeteomaticsConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    records = []
    for item in VARIABLES:
        if not supported_variable(item["id"]):
            continue
        spec = parameter_spec(item["id"])
        records.append(
            VariableCatalogItem.model_validate(
                {
                    **item,
                    "source": f"Meteomatics Weather API ({spec.parameter}; model {model})",
                    "trendSupported": spec.supports_trend,
                }
            ).model_dump()
        )
    return records


@app.get(f"{API_PREFIX}/regions")
def list_regions() -> list[dict]:
    return [RegionCatalogItem.model_validate(item).model_dump(by_alias=True) for item in REGIONS]


@app.get(f"{API_PREFIX}/availability")
def availability(
    variable_id: str = Query(...),
    region_id: str = Query(...),
) -> AvailabilityResponse:
    variable = get_variable(variable_id)
    region = get_region(region_id)
    if variable is None:
        raise HTTPException(status_code=404, detail="Unknown variable")
    if region is None:
        raise HTTPException(status_code=404, detail="Unknown region")

    try:
        configured_model()
    except MeteomaticsConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    supported = supported_variable(variable_id)
    return AvailabilityResponse(
        variable_id=variable_id,
        region_id=region_id,
        active_version="meteomatics-live",
        available=supported,
        start_date=None,
        end_date=None,
        warning=(
            "Parameter is configured, but account access and date coverage are confirmed only when an analysis request succeeds."
            if supported
            else "No validated Meteomatics parameter is configured for this variable."
        ),
    )


@app.post(f"{API_PREFIX}/analyses")
def create_analysis(payload: AnalysisRequest) -> AnalysisResponse:
    return _build_analysis_payload(
        payload.variable_id,
        payload.region_id,
        payload.start_date,
        payload.end_date,
        payload.dataset_version,
        payload.spatial_query,
    )


@app.post(f"{API_PREFIX}/analyses/export")
def export_analysis(payload: AnalysisRequest) -> StreamingResponse:
    analysis = _build_analysis_payload(
        payload.variable_id,
        payload.region_id,
        payload.start_date,
        payload.end_date,
        payload.dataset_version,
        payload.spatial_query,
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "timestamp",
        "value",
        "unit",
        "quality_flags",
        "coverage_fraction",
        "trend_applicable",
        "direction",
        "slope_per_decade",
    ])
    for point in analysis.series:
        writer.writerow([
            point.timestamp,
            point.value,
            point.unit,
            point.quality_flags,
            point.coverage_fraction,
            analysis.trend.applicable,
            analysis.trend.direction,
            analysis.trend.slope_per_decade,
        ])
    response = StreamingResponse(iter([output.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=earth_detective_analysis.csv"
    return response
