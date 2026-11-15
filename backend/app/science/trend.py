from __future__ import annotations

import math
from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from statistics import fmean

from scipy.stats import t

from app.schemas import EffectivePeriod, SeriesPoint

ALPHA = 0.05
MINIMUM_VALID_POINTS = 3
ESTIMATOR = "linear_regression"
INFERENCE_METHOD = "not_validated"
DIRECTION_EPSILON = 1e-9
DAYS_PER_YEAR = 365.2425


class TrendInputError(ValueError):
    pass


@dataclass(frozen=True)
class OrdinaryLeastSquares:
    slope_per_decade: float
    standard_error_per_decade: float
    p_value: float
    confidence_interval: tuple[float, float]


def fit_ols(days: tuple[int, ...], values: tuple[float, ...]) -> OrdinaryLeastSquares:
    """Classical two-sided slope test and matching interval under OLS assumptions."""
    if len(days) < MINIMUM_VALID_POINTS or len(days) != len(values):
        raise TrendInputError("An OLS fit needs at least three paired observations.")
    time = [(day - days[0]) / DAYS_PER_YEAR for day in days]
    mean_time, mean_value = fmean(time), fmean(values)
    centered_time = [year - mean_time for year in time]
    centered_values = [value - mean_value for value in values]
    sum_time_squared = math.fsum(year ** 2 for year in centered_time)
    if not sum_time_squared:
        raise TrendInputError("Observation time must vary.")
    slope = math.fsum(year * value for year, value in zip(centered_time, centered_values)) / sum_time_squared
    dof = len(values) - 2
    residual_sum = math.fsum(
        (value - slope * year) ** 2 for year, value in zip(centered_time, centered_values)
    )
    stderr = math.sqrt(residual_sum / dof / sum_time_squared)
    p_value = float(2 * t.sf(abs(slope / stderr), dof)) if stderr else float(slope == 0)
    rate = 10 * slope
    se = 10 * stderr
    margin = float(t.isf(ALPHA / 2, dof)) * se
    result = OrdinaryLeastSquares(rate, se, p_value, (rate - margin, rate + margin))
    if not all(math.isfinite(item) for item in (rate, se, p_value, *result.confidence_interval)):
        raise TrendInputError("OLS returned non-finite results.")
    return result


def _observations(points: list[dict]) -> list[tuple[int, float]]:
    seen = set()
    observations = []
    for point in points:
        try:
            timestamp = point["timestamp"]
            day = date.fromisoformat(timestamp)
            if day.isoformat() != timestamp:
                raise ValueError
        except (KeyError, TypeError, ValueError) as exc:
            raise TrendInputError("Observations must use ISO YYYY-MM-DD dates.") from exc
        if day in seen:
            raise TrendInputError("Observation dates must be unique.")
        seen.add(day)
        value = point["value"]
        if value is None:
            continue
        try:
            if isinstance(value, bool) or not math.isfinite(value):
                raise ValueError
        except (TypeError, ValueError, OverflowError) as exc:
            raise TrendInputError("Observations must be finite numbers or null.") from exc
        observations.append((day.toordinal(), float(value)))
    return sorted(observations)


def unavailable_trend(unit: str, status: str, reason: str) -> dict:
    return {
        "direction": "undetermined",
        "applicable": False,
        "slope_per_decade": None,
        "slope_unit": f"{unit} per decade".strip(),
        "confidence_interval": None,
        "p_value": None,
        "alpha": ALPHA,
        "estimator": ESTIMATOR if status == "insufficient_data" else "not_applicable",
        "inference_method": "not_enough_data" if status == "insufficient_data" else "circular_data",
        "significant": None,
        "inference_status": status,
        "inference_reason": reason,
    }


def analyze_time_series(points: list[dict], unit: str = "") -> dict:
    observations = _observations(points)
    slope_unit = f"{unit} per decade".strip()
    if len(observations) < MINIMUM_VALID_POINTS:
        return unavailable_trend(
            unit, "insufficient_data", "At least three finite observations at distinct dates are required.",
        )

    days, values = zip(*observations)
    try:
        rate = fit_ols(days, values).slope_per_decade
    except (OverflowError, ValueError) as exc:
        raise TrendInputError("The linear fit could not be calculated from these observations.") from exc
    if abs(rate) < DIRECTION_EPSILON:
        direction = "stable"
    elif rate > 0:
        direction = "increasing"
    else:
        direction = "decreasing"
    return {
        "direction": direction,
        "applicable": True,
        "slope_per_decade": rate,
        "slope_unit": slope_unit,
        "confidence_interval": None,
        "p_value": None,
        "alpha": ALPHA,
        "estimator": ESTIMATOR,
        "inference_method": INFERENCE_METHOD,
        "significant": None,
        "inference_status": "descriptive",
        "inference_reason": "Seasonality and serial dependence have not been validated for inference.",
    }


def observed_period(series: list[SeriesPoint]) -> EffectivePeriod:
    dates = [date.fromisoformat(point.timestamp) for point in series if point.value is not None]
    if not dates:
        return {"start_date": None, "end_date": None}
    first, last = min(dates), max(dates)
    return {
        "start_date": first.isoformat(),
        "end_date": last.replace(day=monthrange(last.year, last.month)[1]).isoformat(),
    }


def explain_trend(trend: dict) -> str:
    rate = trend["slope_per_decade"]
    if rate is None:
        return trend["inference_reason"]
    direction = {
        "increasing": "upward", "decreasing": "downward", "stable": "approximately flat",
    }[trend["direction"]]
    return f"The descriptive fit is {direction} ({rate:+.6g} {trend['slope_unit']})."
