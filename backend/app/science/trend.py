from __future__ import annotations

from statistics import mean

import numpy as np
from scipy import stats


def analyze_time_series(points: list[dict]) -> dict:
    values = [float(point["value"]) for point in points if point["value"] is not None]
    if len(values) < 3:
        return {
            "direction": "undetermined",
            "slope_per_decade": None,
            "slope_unit": "per decade",
            "confidence_interval": None,
            "p_value": None,
            "alpha": 0.05,
            "significant": None,
            "estimator": "linear_regression",
            "inference_method": "not_enough_data",
        }

    years = np.arange(len(values), dtype=float)
    slope, intercept, r_value, p_value, stderr = stats.linregress(years, values)
    slope_per_decade = slope * 10.0
    interval = 1.96 * stderr * 10.0
    ci_lower = slope_per_decade - interval
    ci_upper = slope_per_decade + interval
    significant = bool(p_value is not None and p_value < 0.05)

    if abs(slope_per_decade) < 1e-9:
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
        "alpha": 0.05,
        "significant": significant,
        "estimator": "linear_regression",
        "inference_method": "OLS with standard error estimate",
    }
