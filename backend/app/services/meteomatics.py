from __future__ import annotations

import copy
import datetime as dt
import logging
import math
import os
import re
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Literal

import meteomatics.api as meteomatics_api
import pandas as pd
from meteomatics.exceptions import WeatherApiException
from requests.exceptions import RequestException

logging.getLogger(meteomatics_api.__name__).setLevel(logging.WARNING)

SOURCE_URL = "https://www.meteomatics.com/en/api/getting-started/"
METHOD_VERSION = "meteomatics-hourly-monthly-v2"
MAX_PERIOD_DAYS = 3660
MIN_MONTHLY_COVERAGE = 0.9
CACHE_MAX_SIZE = 32
CACHE_TTL_SECONDS = 300

@dataclass(frozen=True)
class ParameterSpec:
    parameter: str
    aggregation: Literal["mean", "sum", "circular_mean"]
    unit: str
    supports_trend: bool = True


VARIABLE_PARAMETERS: dict[str, ParameterSpec] = {
    "air_temperature": ParameterSpec("t_2m:C", "mean", "°C"),
    "precipitation": ParameterSpec("precip_1h:mm", "sum", "mm/month"),
    "soil_moisture_0_7cm": ParameterSpec("volumetric_soil_water_-5cm:m3m3", "mean", "m3/m3"),
    "soil_moisture_7_28cm": ParameterSpec("volumetric_soil_water_-15cm:m3m3", "mean", "m3/m3"),
    "soil_moisture_28_100cm": ParameterSpec("volumetric_soil_water_-50cm:m3m3", "mean", "m3/m3"),
    "soil_moisture_100_289cm": ParameterSpec("volumetric_soil_water_-150cm:m3m3", "mean", "m3/m3"),
    "soil_moisture_index_0_7cm": ParameterSpec("soil_moisture_index_-5cm:idx", "mean", "index"),
    "soil_moisture_index_7_28cm": ParameterSpec("soil_moisture_index_-15cm:idx", "mean", "index"),
    "soil_moisture_index_28_100cm": ParameterSpec("soil_moisture_index_-50cm:idx", "mean", "index"),
    "soil_moisture_index_100_289cm": ParameterSpec("soil_moisture_index_-150cm:idx", "mean", "index"),
    "soil_moisture_deficit": ParameterSpec("soil_moisture_deficit:mm", "mean", "mm"),
    "soil_temperature_0_7cm": ParameterSpec("t_-5cm:C", "mean", "°C"),
    "soil_temperature_7_28cm": ParameterSpec("t_-15cm:C", "mean", "°C"),
    "soil_temperature_28_100cm": ParameterSpec("t_-50cm:C", "mean", "°C"),
    "soil_temperature_100_289cm": ParameterSpec("t_-150cm:C", "mean", "°C"),
    "wind_speed_10m": ParameterSpec("wind_speed_10m:ms", "mean", "m/s"),
    "wind_direction_10m": ParameterSpec("wind_dir_10m:d", "circular_mean", "°", False),
    "relative_humidity_2m": ParameterSpec("relative_humidity_2m:p", "mean", "%"),
    "sea_level_pressure": ParameterSpec("msl_pressure:hPa", "mean", "hPa"),
    "global_radiation": ParameterSpec("global_rad:W", "mean", "W/m2"),
    "evapotranspiration": ParameterSpec("evapotranspiration_1h:mm", "sum", "mm/month"),
}

_cache: OrderedDict[tuple[Any, ...], tuple[float, dict[str, Any]]] = OrderedDict()
_cache_lock = threading.Lock()


class MeteomaticsConfigurationError(Exception):
    pass


class UnsupportedMeteomaticsVariable(Exception):
    pass


class MeteomaticsRequestError(Exception):
    pass


class MeteomaticsResponseError(Exception):
    pass


def supported_variable(variable_id: str) -> bool:
    return variable_id in VARIABLE_PARAMETERS


def parameter_spec(variable_id: str) -> ParameterSpec:
    try:
        return VARIABLE_PARAMETERS[variable_id]
    except KeyError as exc:
        raise UnsupportedMeteomaticsVariable(
            "No Meteomatics parameter is configured for this variable."
        ) from exc


def configured_model() -> str:
    model = os.environ.get("METEOMATICS_MODEL", "mix").strip()
    if not model or not re.fullmatch(r"[A-Za-z0-9_.-]+", model):
        raise MeteomaticsConfigurationError("METEOMATICS_MODEL is invalid.")
    return model


def _credentials() -> tuple[str, str]:
    username = os.environ.get("METEOMATICS_USERNAME", "").strip()
    password = os.environ.get("METEOMATICS_PASSWORD", "")
    if not username or not password:
        raise MeteomaticsConfigurationError(
            "Meteomatics is selected but server credentials are not configured."
        )
    return username, password


def _month_series(
    frame: pd.DataFrame,
    parameter: str,
    aggregation: str,
    unit: str,
    start_date: dt.date,
    end_date: dt.date,
) -> dict[str, Any]:
    start = pd.Timestamp(dt.datetime.combine(start_date, dt.time.min), tz="UTC")
    end = pd.Timestamp(dt.datetime.combine(end_date, dt.time(23)), tz="UTC")

    values = pd.Series(dtype="float64", index=pd.DatetimeIndex([], tz="UTC"))
    if not frame.empty:
        if parameter not in frame.columns:
            raise MeteomaticsResponseError("Meteomatics response omitted the requested parameter.")
        if isinstance(frame.index, pd.MultiIndex):
            if "validdate" not in frame.index.names:
                raise MeteomaticsResponseError("Meteomatics response has no timestamp index.")
            timestamps = frame.index.get_level_values("validdate")
        else:
            timestamps = frame.index

        values = pd.Series(
            pd.to_numeric(frame[parameter], errors="coerce").to_numpy(),
            index=pd.DatetimeIndex(pd.to_datetime(timestamps, utc=True)),
        )
        values = values.groupby(level=0).mean().sort_index()

    periods = pd.period_range(start=start_date.isoformat(), end=end_date.isoformat(), freq="M")
    points: list[dict[str, Any]] = []
    total_expected_hours = 0
    total_valid_hours = 0

    for period in periods:
        month_start = pd.Timestamp(period.start_time).tz_localize("UTC")
        month_end = pd.Timestamp(period.end_time).floor("h").tz_localize("UTC")
        expected_month_hours = len(pd.date_range(month_start, month_end, freq="h"))
        total_expected_hours += expected_month_hours

        selected_start = max(start, month_start)
        selected_end = min(end, month_end)
        if selected_start <= selected_end:
            month_values = values.loc[
                (values.index >= selected_start) & (values.index <= selected_end)
            ].dropna()
        else:
            month_values = values.iloc[0:0]

        valid_hours = int(month_values.index.nunique())
        total_valid_hours += valid_hours
        coverage = valid_hours / expected_month_hours if expected_month_hours else 0.0
        complete = coverage >= MIN_MONTHLY_COVERAGE
        value = None
        quality_flags = "ok" if complete else "insufficient_hourly_coverage"
        if complete and not month_values.empty:
            if aggregation == "mean":
                value = float(month_values.mean())
            elif aggregation == "sum":
                value = float(month_values.sum())
            else:
                angles = [math.radians(float(item)) for item in month_values]
                mean_sin = math.fsum(math.sin(angle) for angle in angles) / len(angles)
                mean_cos = math.fsum(math.cos(angle) for angle in angles) / len(angles)
                if math.hypot(mean_sin, mean_cos) > 1e-8:
                    value = math.degrees(math.atan2(mean_sin, mean_cos)) % 360.0
                else:
                    quality_flags = "undefined_circular_mean"

        points.append(
            {
                "timestamp": period.start_time.strftime("%Y-%m-%d"),
                "value": round(value, 6) if value is not None else None,
                "unit": unit,
                "quality_flags": quality_flags,
                "coverage_fraction": round(coverage, 6),
            }
        )

    valid_months = sum(point["value"] is not None for point in points)
    expected_months = len(points)
    return {
        "series": points,
        "sample_count": valid_months,
        "expected_count": expected_months,
        "coverage_fraction": valid_months / expected_months if expected_months else 0.0,
        "hourly_coverage_fraction": (
            total_valid_hours / total_expected_hours if total_expected_hours else 0.0
        ),
    }


def _fetch_uncached(
    variable_id: str,
    region_id: str,
    latitude: float,
    longitude: float,
    start_date: dt.date,
    end_date: dt.date,
    model: str,
) -> dict[str, Any]:
    spec = parameter_spec(variable_id)
    username, password = _credentials()
    start = dt.datetime.combine(start_date, dt.time.min, tzinfo=dt.timezone.utc)
    end = dt.datetime.combine(end_date, dt.time(23), tzinfo=dt.timezone.utc)

    try:
        frame = meteomatics_api.query_time_series(
            [(latitude, longitude)],
            start,
            end,
            dt.timedelta(hours=1),
            [spec.parameter],
            username,
            password,
            model=model,
        )
    except (WeatherApiException, RequestException) as exc:
        raise MeteomaticsRequestError(
            "Meteomatics could not fulfill the data request. Check account access, product coverage, and dates."
        ) from exc

    result = _month_series(
        frame,
        spec.parameter,
        spec.aggregation,
        spec.unit,
        start_date,
        end_date,
    )
    warnings = [
        "Values represent the Meteomatics grid at the selected point, not an area-weighted regional average.",
        "The live Meteomatics model response is not an immutable archived dataset; repeated requests may differ.",
    ]
    if any(point["quality_flags"] == "insufficient_hourly_coverage" for point in result["series"]):
        warnings.append(
            "Months with less than 90% valid hourly coverage are returned as null, not as zero."
        )
    if any(point["quality_flags"] == "undefined_circular_mean" for point in result["series"]):
        warnings.append(
            "A month with a mathematically undefined circular mean is returned as null."
        )
    if not spec.supports_trend:
        warnings.append(
            "Wind direction is circular; a linear trend and statistical significance are not reported."
        )

    result.update(
        {
            "model": model,
            "parameter": spec.parameter,
            "supports_trend": spec.supports_trend,
            "region_id": region_id,
            "latitude": latitude,
            "longitude": longitude,
            "retrieved_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "warnings": warnings,
        }
    )
    return result


def fetch_monthly_series(
    variable_id: str,
    region: dict[str, Any],
    start_date: dt.date,
    end_date: dt.date,
    model: str | None = None,
    spatial_query: dict[str, Any] | None = None,
) -> dict[str, Any]:
    parameter_spec(variable_id)
    if start_date > end_date:
        raise ValueError("start_date must be before or equal to end_date.")
    if (end_date - start_date).days + 1 > MAX_PERIOD_DAYS:
        raise ValueError("Meteomatics analysis periods cannot exceed ten years.")

    try:
        if spatial_query is not None:
            longitude, latitude = (float(value) for value in spatial_query["coordinates"])
        else:
            center = region["center"]
            latitude = float(center["latitude"])
            longitude = float(center["longitude"])
    except (KeyError, TypeError, ValueError) as exc:
        raise MeteomaticsConfigurationError(
            "The selected point or region center has invalid coordinates."
        ) from exc
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise MeteomaticsConfigurationError("The selected point has invalid coordinates.")

    _credentials()
    selected_model = model or configured_model()
    key = (
        variable_id,
        region["id"],
        latitude,
        longitude,
        start_date.isoformat(),
        end_date.isoformat(),
        selected_model,
        METHOD_VERSION,
    )

    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(key)
        if cached is not None:
            cached_at, result = cached
            if now - cached_at < CACHE_TTL_SECONDS:
                _cache.move_to_end(key)
                return copy.deepcopy(result)
            del _cache[key]

    result = _fetch_uncached(
        variable_id,
        str(region["id"]),
        latitude,
        longitude,
        start_date,
        end_date,
        selected_model,
    )
    with _cache_lock:
        _cache[key] = (time.monotonic(), result)
        _cache.move_to_end(key)
        while len(_cache) > CACHE_MAX_SIZE:
            _cache.popitem(last=False)
    return copy.deepcopy(result)


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()
