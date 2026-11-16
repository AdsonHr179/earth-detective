from datetime import date
from math import atan, pi, sqrt, tan
from statistics import covariance, variance

import pytest

from app.science.trend import TrendInputError, analyze_time_series, fit_ols


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


def test_three_year_ols_interval_and_test_match_independent_cauchy_reference():
    days = tuple(date(year, 1, 1).toordinal() for year in (2020, 2021, 2022))
    values = (0, 1, 1.4)
    x = tuple((day - days[0]) / 365.2425 for day in days)
    covariance_xy = covariance(x, values)
    variance_x = variance(x)
    slope = covariance_xy / variance_x
    residual_sum = 2 * (variance(values) - slope * covariance_xy)
    stderr = sqrt(residual_sum / (2 * variance_x))
    # The t distribution with one degree of freedom is a standard Cauchy.
    p_expected = 2 * atan(stderr / abs(slope)) / pi
    margin = tan(0.475 * pi) * stderr
    expected_interval = (10 * (slope - margin), 10 * (slope + margin))

    fit = fit_ols(days, values)
    assert fit.slope_per_decade == pytest.approx(10 * slope, abs=1e-12)
    assert fit.standard_error_per_decade == pytest.approx(10 * stderr, abs=1e-12)
    assert fit.p_value == pytest.approx(p_expected, abs=1e-12)
    assert fit.confidence_interval == pytest.approx(expected_interval, abs=1e-8)
    assert (fit.p_value < 0.05) == (
        fit.confidence_interval[0] > 0 or fit.confidence_interval[1] < 0
    )
    assert fit.confidence_interval[0] < 0 < fit.confidence_interval[1]


@pytest.mark.parametrize("rate,direction", [(2, "increasing"), (-2, "decreasing"), (0, "stable")])
def test_irregular_calendar_dates_and_gap_preserve_physical_rate(rate, direction):
    dates = [date(2018, 1, 1), date(2018, 2, 1), date(2019, 7, 1), date(2023, 5, 1)]
    points = [
        {"timestamp": month.isoformat(), "value": None if i == 1 else 3 + rate * (month - dates[0]).days / 3652.425}
        for i, month in enumerate(dates)
    ]
    result = analyze_time_series(points, "°C")

    assert result["direction"] == direction
    assert result["slope_per_decade"] == pytest.approx(rate, abs=1e-12)
    assert result["slope_unit"] == "°C per decade"
    assert result["inference_status"] == "descriptive"
    assert result["applicable"] is True
    assert result["p_value"] is result["confidence_interval"] is result["significant"] is None


@pytest.mark.parametrize(
    "timestamp,value",
    [
        ("not-a-date", 1),
        ("2020-01-01T12:00:00Z", 1),
        ("2020-01-01", None),
        ("2020-13-01", None),
        ("2020-03-01", float("nan")),
        ("2020-03-01", float("inf")),
        ("2020-03-01", float("-inf")),
    ],
)
def test_invalid_or_duplicate_observations_fail_even_in_a_short_series(timestamp, value):
    with pytest.raises(TrendInputError):
        analyze_time_series([{"timestamp": "2020-01-01", "value": 0}, {"timestamp": timestamp, "value": value}])


def test_short_series_is_insufficient_and_has_no_estimate():
    result = analyze_time_series([
        {"timestamp": "2020-01-01", "value": 1},
        {"timestamp": "2020-02-01", "value": None},
        {"timestamp": "2020-03-01", "value": 2},
    ], "°C")

    assert result["inference_status"] == "insufficient_data"
    assert result["direction"] == "undetermined"
    assert result["applicable"] is False
    assert result["slope_per_decade"] is None
