from __future__ import annotations

import uuid
from calendar import monthrange
from datetime import date, datetime, timezone

from fastapi import HTTPException

from app.data_catalog import get_region
from app.schemas import AnalysisRequest, AvailabilityResponse, NasaAnalysisResponse
from app.science.nasa_projection import project, summarize
from app.science.trend import analyze_time_series
from app.services.nasa import (
    PRODUCTS, NasaAccessError, NasaDataError, Product,
    earthdata_token, full_months, monthly_series, product_end,
)


def availability(variable_id: str, region_id: str) -> AvailabilityResponse:
    if get_region(region_id) is None:
        raise HTTPException(status_code=404, detail="Unknown region")
    product = PRODUCTS[variable_id]
    available = not product.collection or bool(earthdata_token())
    warning = (
        "This archive requires EARTHDATA_TOKEN in the backend environment."
        if not available else None
    )
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
        months = full_months(payload.start_date, payload.end_date)
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
        series = monthly_series(product, months, latitude, longitude)
    except NasaAccessError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except NasaDataError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    valid = [point for point in series if point.value is not None]
    stats = summarize(series)
    trend = analyze_time_series([point.model_dump() for point in series])
    first = date.fromisoformat(valid[0].timestamp) if valid else months[0]
    last = date.fromisoformat(valid[-1].timestamp) if valid else months[-1]
    warnings = []
    if len(valid) != len(series):
        warnings.append("Missing months appear as gaps in the historical series.")
    if payload.start_date != months[0] or payload.end_date.day != monthrange(payload.end_date.year, payload.end_date.month)[1]:
        warnings.append("Partial months at the edges of the requested period were excluded.")
    return NasaAnalysisResponse(
        analysis_id=str(uuid.uuid4()), schema_version="1.0", method_version="nasa-monthly-v1",
        dataset_version=product.version, variable_id=payload.variable_id, region_id=payload.region_id,
        requested_period={"start_date": str(payload.start_date), "end_date": str(payload.end_date)},
        effective_period={
            "start_date": str(first), "end_date": str(last.replace(day=monthrange(last.year, last.month)[1])),
        },
        source="NASA GES DISC" if product.collection else "NASA POWER / MERRA-2",
        product=product.name, source_url=product.source_url,
        retrieved_at=datetime.now(timezone.utc).isoformat(), region_version="selected-point-v1",
        spatial_query={"type": "Point", "coordinates": [longitude, latitude]},
        series=series, analysis_series=series,
        trend={**trend, "slope_unit": product.unit},
        statistics=stats,
        forecast=project(series),
        quality={
            "sample_count": len(valid), "expected_count": len(series),
            "coverage_fraction": len(valid) / len(series), "warnings": warnings,
        },
        explanation={
            "summary": "Monthly data at the nearest NASA grid cell.",
            "limitations": (
                "The trend is a descriptive linear fit. Its significance assumes independent residuals, "
                "which may be affected by seasonality and serial correlation."
            ),
        },
    )
