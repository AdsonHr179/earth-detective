from __future__ import annotations

from datetime import date

import numpy as np
from scipy import stats

ALPHA = 0.05
MINIMUM_VALID_POINTS = 3
ESTIMATOR = "linear_regression"
INFERENCE_METHOD = "OLS with standard error estimate"
DIRECTION_EPSILON = 1e-9
CONFIDENCE_MULTIPLIER = 1.96
DAYS_PER_YEAR = 365.2425


def analyze_time_series(points: list[dict]) -> dict:
    valid_points = [point for point in points if point["value"] is not None]
    values = [float(point["value"]) for point in valid_points]
    if len(values) < MINIMUM_VALID_POINTS:
        return {
            "direction": "undetermined",
            "slope_per_decade": None,
            "slope_unit": "per decade",
            "confidence_interval": None,
            "p_value": None,
            "alpha": ALPHA,
            "significant": None,
            "estimator": ESTIMATOR,
            "inference_method": "not_enough_data",
        }

    try:
        timestamps = [
            date.fromisoformat(str(point["timestamp"])[:10]).toordinal() / DAYS_PER_YEAR
            for point in valid_points
        ]
    except (KeyError, TypeError, ValueError):
        timestamps = np.arange(len(values), dtype=float).tolist()

    time_axis = np.asarray(timestamps, dtype=float)
    if len(np.unique(time_axis)) < 2:
        time_axis = np.arange(len(values), dtype=float)

    slope, intercept, r_value, p_value, stderr = stats.linregress(time_axis, values)
    slope_per_decade = slope * 10.0
    interval = CONFIDENCE_MULTIPLIER * stderr * 10.0
    ci_lower = slope_per_decade - interval
    ci_upper = slope_per_decade + interval
    significant = bool(p_value is not None and p_value < ALPHA)

    if abs(slope_per_decade) < DIRECTION_EPSILON:
        direction = "stable"
    elif slope_per_decade > 0:
        direction = "increasing"
    else:
        direction = "decreasing"

    return {
        "direction": direction,
        "slope_per_decade": round(float(slope_per_decade), 6),
        "slope_unit": "per decade",
        "confidence_interval": [round(float(ci_lower), 6), round(float(ci_upper), 6)],
        "p_value": round(float(p_value), 6) if p_value is not None else None,
        "alpha": ALPHA,
        "significant": significant,
        "estimator": ESTIMATOR,
        "inference_method": INFERENCE_METHOD,
    }
