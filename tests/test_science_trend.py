from datetime import date

import pytest

from app.science.trend import analyze_time_series


def test_monthly_trend_uses_elapsed_time_and_reports_rate_per_decade():
    points = []
    for month_index in range(120):
        if month_index == 60:
            continue
        year = 2000 + month_index // 12
        month = month_index % 12 + 1
        timestamp = date(year, month, 1).isoformat()
        points.append(
            {
                "timestamp": timestamp,
                "value": month_index * 2.0 / 120,
            }
        )

    result = analyze_time_series(points)

    assert result["slope_per_decade"] == pytest.approx(2.0, abs=0.005)
