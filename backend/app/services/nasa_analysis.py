from __future__ import annotations

import uuid
from calendar import monthrange
from datetime import date

from fastapi import HTTPException

from app.config import UNVERIFIED_PROVIDER_WARNING, unverified_providers_enabled
from app.data_catalog import get_region
from app.schemas import AnalysisRequest, AvailabilityResponse, NasaAnalysisResponse
from app.science.nasa_projection import project, summarize
from app.science.trend import TrendInputError, analyze_time_series, explain_trend, observed_period
from app.services.nasa import (
    PRODUCTS, NasaAccessError, NasaDataError, Product,
    earthdata_token, full_months, monthly_series, product_end,
)


METHOD_VERSION = "nasa-monthly-v2"


def availability(variable_id: str, region_id: str) -> AvailabilityResponse:
    if get_region(region_id) is None:
        raise HTTPException(status_code=404, detail="Unknown region")
    product = PRODUCTS[variable_id]
    warning = "Public NASA POWER product. A successful query confirms coverage at the selected point."
    available = True
    if product.collection:
        token_configured = bool(earthdata_token())
        available = token_configured and unverified_providers_enabled()
        if available:
            warning = "Experimental archive access. A successful query is required to confirm access and coverage."
        elif not token_configured:
            warning = "This archive requires EARTHDATA_TOKEN in the backend environment."
        else:
            warning = UNVERIFIED_PROVIDER_WARNING
    return AvailabilityResponse(
        variable_id=variable_id, region_id=region_id, active_version=product.version,
        available=available, start_date=product.start, end_date=product_end(product),
        warning=warning,
    )


def validate(payload: AnalysisRequest, product: Product) -> list[date]:
    status = availability(payload.variable_id, payload.region_id)
    if payload.dataset_version not in (None, product.version):
        raise HTTPException(status_code=409, detail="The requested NASA dataset version is unavailable.")
    if not status.available:
        raise HTTPException(status_code=503, detail=status.warning)
    try:
        months = full_months(payload.start_date, payload.end_date, product.max_months)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if months[0] < product.start or (status.end_date and months[-1] > status.end_date):
        raise HTTPException(status_code=422, detail="The selected months are outside this NASA product's coverage.")
    return months


def analyze(payload: AnalysisRequest, product: Product, months: list[date]) -> NasaAnalysisResponse:
    center = get_region(payload.region_id)["center"]
    longitude, latitude = (
        payload.spatial_query.coordinates if payload.spatial_query
        else (center["longitude"], center["latitude"])
    )
    try:
        observations = monthly_series(product, months, latitude, longitude)
        series = observations.series
        trend = analyze_time_series([point.model_dump() for point in series], product.unit)
    except NasaAccessError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except NasaDataError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except TrendInputError as exc:
        raise HTTPException(status_code=502, detail="NASA returned an invalid time series.") from exc

    valid = [point for point in series if point.value is not None]
    stats = summarize(series)
    warnings = []
    if len(valid) != len(series):
        warnings.append("Missing months appear as gaps in the historical series.")
    if payload.start_date != months[0] or payload.end_date.day != monthrange(payload.end_date.year, payload.end_date.month)[1]:
        warnings.append("Partial months at the edges of the requested period were excluded.")
    return NasaAnalysisResponse(
        analysis_id=str(uuid.uuid4()), schema_version="1.0", method_version=METHOD_VERSION,
        dataset_version=product.version, variable_id=payload.variable_id, region_id=payload.region_id,
        requested_period={"start_date": str(payload.start_date), "end_date": str(payload.end_date)},
        effective_period=observed_period(series),
        source="NASA GES DISC" if product.collection else "NASA POWER / MERRA-2",
        product=product.name, source_url=product.source_url,
        retrieved_at=observations.retrieved_at, region_version="selected-point-v1",
        spatial_query={"type": "Point", "coordinates": [longitude, latitude]},
        series=series, analysis_series=series,
        trend=trend,
        statistics=stats,
        forecast=project(series),
        quality={
            "sample_count": len(valid), "expected_count": len(series),
            "coverage_fraction": len(valid) / len(series), "warnings": warnings,
            "provider_metadata": observations.provenance,
        },
        explanation={
            "summary": f"Monthly data for the selected NASA grid cell. {explain_trend(trend)}",
            "limitations": (
                "The data represent a grid cell at the selected point. Seasonal variability and serial "
                "dependence limit interpretation. The fitted rate describes only the observed period."
            ),
        },
    )
