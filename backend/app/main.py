from __future__ import annotations

import csv
import io
import logging
import sqlite3
import threading
import time
import uuid
from collections import OrderedDict
from datetime import date

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import (
    API_PREFIX,
    ANALYSIS_CACHE_MAX_SIZE,
    ANALYSIS_CACHE_TTL_SECONDS,
    APP_NAME,
    APP_VERSION,
    DATA_SOURCE,
    MAX_CONCURRENT_ANALYSES,
    MAX_REQUEST_BODY_BYTES,
    UNVERIFIED_PROVIDER_WARNING,
    allowed_origins,
    unverified_providers_enabled,
)
from app.data_catalog import VARIABLES, REGIONS, get_region, get_variable
from app.schemas import (
    AnalysisRequest,
    AnalysisResponse,
    AvailabilityResponse,
    GeoJSONPoint,
    NasaAnalysisResponse,
    RegionCatalogItem,
    SavedAnalysisSummary,
    SeriesPoint,
    VariableCatalogItem,
)
from app.services import analysis_store, nasa, nasa_analysis
from app.services.meteomatics import (
    DATASET_VERSION as METEOMATICS_DATASET_VERSION,
    MAX_PERIOD_DAYS as METEOMATICS_MAX_PERIOD_DAYS,
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
    validate_provider_configuration,
)
from app.science.trend import (
    ALPHA,
    DAYS_PER_YEAR,
    DIRECTION_EPSILON,
    ESTIMATOR,
    INFERENCE_METHOD,
    MINIMUM_VALID_POINTS,
    TrendInputError,
    analyze_time_series,
    explain_trend,
    observed_period,
    unavailable_trend,
)

app = FastAPI(title=APP_NAME, version=APP_VERSION)
logger = logging.getLogger(__name__)
_ANALYSIS_SEMAPHORE = threading.BoundedSemaphore(MAX_CONCURRENT_ANALYSES)
_ANALYSIS_CACHE: OrderedDict[tuple, tuple[float, AnalysisResponse]] = OrderedDict()
_ANALYSIS_CACHE_LOCK = threading.Lock()


class RequestSizeLimitMiddleware:
    def __init__(self, app, max_body_bytes: int):
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        content_length = next(
            (value for name, value in scope.get("headers", []) if name.lower() == b"content-length"),
            None,
        )
        if content_length is not None:
            try:
                declared_length = int(content_length)
            except ValueError:
                declared_length = 0
            if declared_length > self.max_body_bytes:
                response = JSONResponse(
                    status_code=413,
                    content={
                        "detail": "Request body exceeds the allowed size",
                        "error": {
                            "code": "request_too_large",
                            "message": "Request body exceeds the allowed size",
                        },
                    },
                )
                await response(scope, receive, send)
                return

        received_bytes = 0

        async def limited_receive():
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > self.max_body_bytes:
                    raise HTTPException(status_code=413, detail="Request body exceeds the allowed size")
            return message

        await self.app(scope, limited_receive, send)


app.add_middleware(
    RequestSizeLimitMiddleware,
    max_body_bytes=MAX_REQUEST_BODY_BYTES,
)
origins = allowed_origins()
if origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        expose_headers=["Content-Disposition", "Retry-After"],
    )


def _error_response(status_code: int, code: str, message: str, headers=None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"detail": message, "error": {"code": code, "message": message}},
        headers=headers,
    )


@app.exception_handler(StarletteHTTPException)
async def handle_http_error(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
    code = {
        404: "not_found",
        409: "conflict",
        413: "request_too_large",
        422: "invalid_request",
        502: "upstream_error",
        503: "service_unavailable",
    }.get(exc.status_code, "http_error")
    return _error_response(exc.status_code, code, detail, exc.headers)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    issues = []
    for error in exc.errors():
        location = ".".join(str(part) for part in error.get("loc", ()))
        message = error.get("msg", "Invalid value")
        issues.append(f"{location}: {message}" if location else message)
    detail = "Request validation failed"
    if issues:
        detail = f"{detail}: {'; '.join(issues)}"
    return _error_response(422, "invalid_request", detail)


@app.exception_handler(sqlite3.Error)
async def handle_database_error(_request: Request, _exc: sqlite3.Error) -> JSONResponse:
    return _error_response(503, "analysis_storage_unavailable", "The analysis database is unavailable.")


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "Unhandled request failure: method=%s path=%s error_type=%s",
        request.method,
        request.url.path,
        type(exc).__name__,
    )
    return _error_response(500, "internal_error", "Internal server error")


def _build_limited_analysis(payload: AnalysisRequest) -> AnalysisResponse:
    region = get_region(payload.region_id)
    if region is not None and region["center"] is None and payload.spatial_query is None:
        raise HTTPException(status_code=422, detail="Choose a point for worldwide analysis.")

    product = nasa.PRODUCTS.get(payload.variable_id)
    if product is not None:
        months = nasa_analysis.validate(payload, product)
        model = product.version
    else:
        _validate_analysis_request(
            payload.variable_id, payload.region_id, payload.start_date,
            payload.end_date, payload.dataset_version,
        )
        try:
            model = validate_provider_configuration()
        except MeteomaticsConfigurationError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        if not unverified_providers_enabled():
            raise HTTPException(status_code=503, detail=UNVERIFIED_PROVIDER_WARNING)

    cache_key = _analysis_cache_key(payload, model)
    now = time.monotonic()
    with _ANALYSIS_CACHE_LOCK:
        cached = _ANALYSIS_CACHE.get(cache_key)
        if cached is not None:
            cached_at, result = cached
            if now - cached_at < ANALYSIS_CACHE_TTL_SECONDS:
                _ANALYSIS_CACHE.move_to_end(cache_key)
                return result.model_copy(deep=True)
            del _ANALYSIS_CACHE[cache_key]

    if not _ANALYSIS_SEMAPHORE.acquire(blocking=False):
        raise HTTPException(
            status_code=503,
            detail="Analysis capacity is temporarily full; retry the request shortly",
            headers={"Retry-After": "1"},
        )
    try:
        if product is not None:
            result = nasa_analysis.analyze(payload, product, months)
        else:
            result = _build_analysis_payload(
                payload.variable_id, payload.region_id, payload.start_date, payload.end_date,
                payload.dataset_version, payload.spatial_query, model,
            )
        with _ANALYSIS_CACHE_LOCK:
            _ANALYSIS_CACHE[cache_key] = (time.monotonic(), result)
            _ANALYSIS_CACHE.move_to_end(cache_key)
            while len(_ANALYSIS_CACHE) > ANALYSIS_CACHE_MAX_SIZE:
                _ANALYSIS_CACHE.popitem(last=False)
        return result.model_copy(deep=True)
    finally:
        _ANALYSIS_SEMAPHORE.release()


def _analysis_cache_key(payload: AnalysisRequest, model: str) -> tuple:
    region = get_region(payload.region_id)
    if payload.spatial_query is not None:
        geometry = (
            payload.spatial_query.type,
            *payload.spatial_query.coordinates,
        )
    elif region is not None and region["center"] is not None:
        geometry = (
            "Point",
            region["center"]["longitude"],
            region["center"]["latitude"],
        )
    else:
        geometry = None

    product = nasa.PRODUCTS.get(payload.variable_id)
    statistical_parameters = (
        ALPHA,
        MINIMUM_VALID_POINTS,
        ESTIMATOR,
        INFERENCE_METHOD,
        DIRECTION_EPSILON,
        DAYS_PER_YEAR,
    )
    return (
        payload.variable_id,
        payload.region_id,
        payload.start_date.isoformat(),
        payload.end_date.isoformat(),
        payload.dataset_version or (product.version if product else METEOMATICS_DATASET_VERSION),
        nasa_analysis.METHOD_VERSION if product else METEOMATICS_METHOD_VERSION,
        model,
        geometry,
        statistical_parameters,
    )


def clear_analysis_cache() -> None:
    with _ANALYSIS_CACHE_LOCK:
        _ANALYSIS_CACHE.clear()


def _build_analysis_payload(
    variable_id: str,
    region_id: str,
    start_date: date,
    end_date: date,
    dataset_version: str | None = None,
    spatial_query: GeoJSONPoint | None = None,
    model: str | None = None,
) -> AnalysisResponse:
    variable, region = _validate_analysis_request(
        variable_id,
        region_id,
        start_date,
        end_date,
        dataset_version,
    )

    try:
        data = fetch_monthly_series(
            variable_id,
            region,
            start_date,
            end_date,
            model=model,
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

    analysis_series = [SeriesPoint.model_validate(point) for point in data["series"]]
    spatial_query = {
        "type": "Point",
        "coordinates": [data["longitude"], data["latitude"]],
    }
    effective_version = METEOMATICS_DATASET_VERSION
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
        "aggregation": parameter_spec(variable_id).aggregation,
    }
    limitations = (
        "Values are hourly model output aggregated to complete calendar months at the selected "
        "point, not an area-weighted regional average. The live provider response is not an "
        "immutable archived dataset, and trend inference has not been validated for the selected "
        "Meteomatics product."
    )

    if parameter_spec(variable_id).supports_trend:
        try:
            trend = analyze_time_series(data["series"], variable["unit"])
        except TrendInputError as exc:
            raise HTTPException(status_code=502, detail="Meteomatics returned an invalid time series.") from exc
    else:
        trend = unavailable_trend(
            variable["unit"], "unsupported", "A linear fit is unavailable for circular wind direction.",
        )

    explanation = {
        "summary": f"{variable['name']} at the selected point near {region['name']}. {explain_trend(trend)}",
        "limitations": limitations,
    }
    payload = {
        "analysis_id": str(uuid.uuid4()),
        "schema_version": "1.0",
        "dataset_version": effective_version,
        "method_version": METEOMATICS_METHOD_VERSION,
        "variable_id": variable_id,
        "region_id": region_id,
        "requested_period": {"start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
        "effective_period": observed_period(analysis_series),
        "source": source,
        "product": product,
        "source_url": source_url,
        "retrieved_at": retrieved_at,
        "region_version": "selected-point-v1",
        "spatial_query": spatial_query,
        "series": [point.model_dump() for point in analysis_series],
        "analysis_series": [point.model_dump() for point in analysis_series],
        "trend": trend,
        "quality": quality,
        "explanation": explanation,
    }
    return AnalysisResponse.model_validate(payload)


def _validate_analysis_request(
    variable_id: str,
    region_id: str,
    start_date: date,
    end_date: date,
    dataset_version: str | None = None,
) -> tuple[dict, dict]:
    variable = get_variable(variable_id)
    region = get_region(region_id)
    if variable is None:
        raise HTTPException(status_code=404, detail="Unknown variable")
    if region is None:
        raise HTTPException(status_code=404, detail="Unknown region")
    if start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must be before or equal to end_date")

    if (end_date - start_date).days + 1 > METEOMATICS_MAX_PERIOD_DAYS:
        raise HTTPException(status_code=422, detail="Meteomatics analysis periods cannot exceed ten years.")
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
    return variable, region


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


@app.get(f"{API_PREFIX}/nasa/sources")
def list_nasa_sources() -> list[dict]:
    return nasa.source_pages()


@app.get(f"{API_PREFIX}/nasa/variables", response_model=list[VariableCatalogItem], response_model_by_alias=False)
def list_nasa_variables() -> list[VariableCatalogItem]:
    return nasa.catalogue()


@app.get(f"{API_PREFIX}/regions")
def list_regions() -> list[dict]:
    return [RegionCatalogItem.model_validate(item).model_dump(by_alias=True) for item in REGIONS]


@app.get(f"{API_PREFIX}/availability")
def availability(
    variable_id: str = Query(...),
    region_id: str = Query(...),
) -> AvailabilityResponse:
    if variable_id in nasa.PRODUCTS:
        return nasa_analysis.availability(variable_id, region_id)
    variable = get_variable(variable_id)
    region = get_region(region_id)
    if variable is None:
        raise HTTPException(status_code=404, detail="Unknown variable")
    if region is None:
        raise HTTPException(status_code=404, detail="Unknown region")

    supported = supported_variable(variable_id)
    warning = "No validated Meteomatics parameter is configured for this variable."
    if supported:
        try:
            validate_provider_configuration()
        except MeteomaticsConfigurationError as exc:
            supported, warning = False, str(exc)
        else:
            supported = unverified_providers_enabled()
            warning = (
                "Experimental configuration only. A successful query is required to confirm provider access and coverage."
                if supported else UNVERIFIED_PROVIDER_WARNING
            )
    return AvailabilityResponse(
        variable_id=variable_id,
        region_id=region_id,
        active_version="meteomatics-live",
        available=supported,
        start_date=None,
        end_date=None,
        warning=warning,
    )


@app.post(f"{API_PREFIX}/analyses")
def create_analysis(payload: AnalysisRequest) -> NasaAnalysisResponse | AnalysisResponse:
    analysis = _build_limited_analysis(payload)
    analysis_store.save(analysis)
    return analysis


@app.get(f"{API_PREFIX}/analyses")
def list_saved_analyses(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[SavedAnalysisSummary]:
    return analysis_store.recent(limit, offset)


@app.get(f"{API_PREFIX}/analyses/{{analysis_id}}")
def get_saved_analysis(analysis_id: str) -> NasaAnalysisResponse | AnalysisResponse:
    analysis = analysis_store.get(analysis_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="Saved analysis not found")
    return analysis


@app.get(f"{API_PREFIX}/analyses/{{analysis_id}}/export")
def export_saved_analysis(analysis_id: str) -> StreamingResponse:
    return _analysis_csv(get_saved_analysis(analysis_id))


@app.post(f"{API_PREFIX}/analyses/export")
def export_analysis(payload: AnalysisRequest) -> StreamingResponse:
    return _analysis_csv(_build_limited_analysis(payload))


def _analysis_csv(analysis: AnalysisResponse) -> StreamingResponse:
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
        "slope_unit",
        "inference_status",
        "inference_reason",
        "analysis_id",
        "dataset_version",
        "method_version",
        "source",
        "product",
        "retrieved_at",
    ])
    metadata = [
        _safe_csv_text(value or "")
        for value in (
            analysis.trend.slope_unit,
            analysis.trend.inference_status,
            analysis.trend.inference_reason,
            analysis.analysis_id,
            analysis.dataset_version,
            analysis.method_version,
            analysis.source,
            analysis.product,
            analysis.retrieved_at,
        )
    ]
    for point in analysis.series:
        writer.writerow([
            _safe_csv_text(point.timestamp),
            point.value,
            _safe_csv_text(point.unit),
            _safe_csv_text(point.quality_flags),
            point.coverage_fraction,
            analysis.trend.applicable,
            analysis.trend.direction,
            analysis.trend.slope_per_decade,
            *metadata,
        ])
    response = StreamingResponse(iter([output.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=earth_detective_analysis.csv"
    return response


def _safe_csv_text(value: str) -> str:
    if value.lstrip(" \t\r\n")[:1] in {"=", "+", "-", "@"}:
        return f"'{value}"
    return value
