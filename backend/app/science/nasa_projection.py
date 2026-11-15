from __future__ import annotations

from collections import defaultdict
from datetime import date
from statistics import fmean, median, stdev

from app.schemas import SeriesPoint
from app.services.nasa import next_month

FORECAST_MONTHS = 6


def summarize(series: list[SeriesPoint]) -> dict | None:
    values = [point.value for point in series if point.value is not None]
    if not values:
        return None
    return {
        "count": len(values),
        "mean": fmean(values),
        "median": median(values),
        "min": min(values),
        "max": max(values),
        "standard_deviation": stdev(values) if len(values) >= 2 else None,
    }


def project(series: list[SeriesPoint]) -> dict | None:
    history = [(date.fromisoformat(point.timestamp), point.value) for point in series if point.value is not None]
    if not history:
        return None

    by_month: dict[int, list[float]] = defaultdict(list)
    absolute_errors = []
    for month, value in history:
        previous = by_month[month.month]
        if len(previous) >= 3:
            absolute_errors.append(abs(value - fmean(previous)))
        previous.append(value)

    months = []
    month = history[-1][0]
    for _ in range(FORECAST_MONTHS):
        month = next_month(month)
        reference = by_month[month.month]
        if len(reference) < 3:
            return None
        months.append({"timestamp": month.isoformat(), "value": fmean(reference)})

    return {
        "method": "Historical mean for the same calendar month",
        "points": months,
        "backtest_mae": fmean(absolute_errors) if absolute_errors else None,
        "backtest_count": len(absolute_errors),
    }
