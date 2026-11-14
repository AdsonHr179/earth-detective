from __future__ import annotations

import datetime as dt

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.services import meteomatics


def _hourly_frame(parameter: str, start: str, end: str, value: float) -> pd.DataFrame:
    timestamps = pd.date_range(start, end, freq="h", tz="UTC")
    index = pd.MultiIndex.from_arrays(
        [
            [-5.2] * len(timestamps),
            [-39.5] * len(timestamps),
            timestamps,
        ],
        names=["lat", "lon", "validdate"],
    )
    return pd.DataFrame({parameter: [value] * len(timestamps)}, index=index)


@pytest.fixture(autouse=True)
def clear_provider_cache():
    meteomatics.clear_cache()
    yield
    meteomatics.clear_cache()


def test_temperature_query_uses_center_and_aggregates_hourly_mean(monkeypatch):
    monkeypatch.setenv("METEOMATICS_USERNAME", "test-user")
    monkeypatch.setenv("METEOMATICS_PASSWORD", "test-password")
    calls = []

    def fake_query(*args, **kwargs):
        calls.append((args, kwargs))
        return _hourly_frame("t_2m:C", "2024-01-01 00:00", "2024-01-31 23:00", 23.5)

    monkeypatch.setattr(meteomatics.meteomatics_api, "query_time_series", fake_query)
    region = {
        "id": "ceara",
        "center": {"latitude": -5.2, "longitude": -39.5},
    }

    result = meteomatics.fetch_monthly_series(
        "air_temperature", region, dt.date(2024, 1, 1), dt.date(2024, 1, 31)
    )
    cached_result = meteomatics.fetch_monthly_series(
        "air_temperature", region, dt.date(2024, 1, 1), dt.date(2024, 1, 31)
    )

    assert result["series"][0]["value"] == 23.5
    assert cached_result["series"][0]["value"] == 23.5
    assert len(calls) == 1
    assert result["series"][0]["unit"] == "°C"
    assert result["hourly_coverage_fraction"] == 1
    args, kwargs = calls[0]
    assert args[0] == [(-5.2, -39.5)]
    assert args[3] == dt.timedelta(hours=1)
    assert args[4] == ["t_2m:C"]
    assert kwargs["model"] == "mix"


def test_query_uses_selected_northeast_region_center(monkeypatch):
    monkeypatch.setenv("METEOMATICS_USERNAME", "test-user")
    monkeypatch.setenv("METEOMATICS_PASSWORD", "test-password")
    calls = []

    def fake_query(*args, **kwargs):
        calls.append((args, kwargs))
        return pd.DataFrame()

    monkeypatch.setattr(meteomatics.meteomatics_api, "query_time_series", fake_query)
    region = next(item for item in main.REGIONS if item["id"] == "northeast_brazil")

    meteomatics.fetch_monthly_series(
        "air_temperature", region, dt.date(2024, 1, 1), dt.date(2024, 1, 31)
    )

    assert calls[0][0][0] == [(-9.0, -38.5)]


def test_query_uses_map_selected_point(monkeypatch):
    monkeypatch.setenv("METEOMATICS_USERNAME", "test-user")
    monkeypatch.setenv("METEOMATICS_PASSWORD", "test-password")
    calls = []

    def fake_query(*args, **kwargs):
        calls.append((args, kwargs))
        return pd.DataFrame()

    monkeypatch.setattr(meteomatics.meteomatics_api, "query_time_series", fake_query)
    region = next(item for item in main.REGIONS if item["id"] == "ceara")

    result = meteomatics.fetch_monthly_series(
        "air_temperature",
        region,
        dt.date(2024, 1, 1),
        dt.date(2024, 1, 31),
        spatial_query={"type": "Point", "coordinates": [-38.52, -3.73]},
    )

    assert calls[0][0][0] == [(-3.73, -38.52)]
    assert result["latitude"] == -3.73
    assert result["longitude"] == -38.52


def test_precipitation_sums_hourly_amounts_only_for_complete_month(monkeypatch):
    monkeypatch.setenv("METEOMATICS_USERNAME", "test-user")
    monkeypatch.setenv("METEOMATICS_PASSWORD", "test-password")
    monkeypatch.setattr(
        meteomatics.meteomatics_api,
        "query_time_series",
        lambda *args, **kwargs: _hourly_frame(
            "precip_1h:mm", "2024-02-01 00:00", "2024-02-29 23:00", 0.1
        ),
    )

    result = meteomatics.fetch_monthly_series(
        "precipitation",
        {"id": "ceara", "center": {"latitude": -5.2, "longitude": -39.5}},
        dt.date(2024, 2, 1),
        dt.date(2024, 2, 29),
    )

    assert result["series"][0]["value"] == pytest.approx(69.6)
    assert result["series"][0]["unit"] == "mm/month"


def test_incomplete_month_is_null_and_not_zero(monkeypatch):
    monkeypatch.setenv("METEOMATICS_USERNAME", "test-user")
    monkeypatch.setenv("METEOMATICS_PASSWORD", "test-password")
    monkeypatch.setattr(
        meteomatics.meteomatics_api,
        "query_time_series",
        lambda *args, **kwargs: _hourly_frame(
            "precip_1h:mm", "2024-01-01 00:00", "2024-01-01 01:00", 0
        ),
    )

    result = meteomatics.fetch_monthly_series(
        "precipitation",
        {"id": "ceara", "center": {"latitude": -5.2, "longitude": -39.5}},
        dt.date(2024, 1, 1),
        dt.date(2024, 1, 31),
    )

    assert result["series"][0]["value"] is None
    assert result["series"][0]["quality_flags"] == "insufficient_hourly_coverage"


def test_credentials_are_required_before_provider_call(monkeypatch):
    monkeypatch.delenv("METEOMATICS_USERNAME", raising=False)
    monkeypatch.delenv("METEOMATICS_PASSWORD", raising=False)
    monkeypatch.setattr(
        meteomatics.meteomatics_api,
        "query_time_series",
        lambda *args, **kwargs: pytest.fail("Provider should not be called without credentials"),
    )

    with pytest.raises(meteomatics.MeteomaticsConfigurationError):
        meteomatics.fetch_monthly_series(
            "air_temperature",
            {"id": "ceara", "center": {"latitude": -5.2, "longitude": -39.5}},
            dt.date(2024, 1, 1),
            dt.date(2024, 1, 31),
        )


def test_live_analysis_endpoint_uses_provider_payload(monkeypatch):
    calls = []

    def fake_fetch_monthly_series(*args, **kwargs):
        calls.append((args, kwargs))
        return {
            "series": [
                {"timestamp": "2024-01-01", "value": 20.0, "unit": "°C", "quality_flags": "ok"},
                {"timestamp": "2024-02-01", "value": 21.0, "unit": "°C", "quality_flags": "ok"},
                {"timestamp": "2024-03-01", "value": 22.0, "unit": "°C", "quality_flags": "ok"},
            ],
            "sample_count": 3,
            "expected_count": 3,
            "coverage_fraction": 1.0,
            "hourly_coverage_fraction": 1.0,
            "model": "mix",
            "parameter": "t_2m:C",
            "latitude": -3.73,
            "longitude": -38.52,
            "retrieved_at": "2024-04-01T00:00:00+00:00",
            "warnings": ["Representative point only."],
        }

    monkeypatch.setattr(
        main,
        "fetch_monthly_series",
        fake_fetch_monthly_series,
    )
    client = TestClient(main.app)

    response = client.post(
        "/api/v1/analyses",
        json={
            "variable_id": "air_temperature",
            "region_id": "ceara",
            "start_date": "2024-01-01",
            "end_date": "2024-03-31",
            "spatial_query": {
                "type": "Point",
                "coordinates": [-38.52, -3.73],
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "Meteomatics Weather API"
    assert body["product"] == "model=mix; parameter=t_2m:C"
    assert body["series"][0]["value"] == 20
    assert body["quality"]["hourly_coverage_fraction"] == 1
    assert body["spatial_query"] == {
        "type": "Point",
        "coordinates": [-38.52, -3.73],
    }
    assert calls[0][1]["spatial_query"] == {
        "type": "Point",
        "coordinates": (-38.52, -3.73),
    }


def test_soil_water_query_uses_layer_parameter_and_monthly_mean(monkeypatch):
    monkeypatch.setenv("METEOMATICS_USERNAME", "test-user")
    monkeypatch.setenv("METEOMATICS_PASSWORD", "test-password")
    calls = []

    def fake_query(*args, **kwargs):
        calls.append((args, kwargs))
        return _hourly_frame(
            "volumetric_soil_water_-5cm:m3m3",
            "2024-01-01 00:00",
            "2024-01-31 23:00",
            0.24,
        )

    monkeypatch.setattr(meteomatics.meteomatics_api, "query_time_series", fake_query)
    result = meteomatics.fetch_monthly_series(
        "soil_moisture_0_7cm",
        {"id": "ceara", "center": {"latitude": -5.2, "longitude": -39.5}},
        dt.date(2024, 1, 1),
        dt.date(2024, 1, 31),
    )

    assert calls[0][0][4] == ["volumetric_soil_water_-5cm:m3m3"]
    assert result["series"][0]["value"] == pytest.approx(0.24)
    assert result["series"][0]["unit"] == "m3/m3"


def test_evapotranspiration_sums_hourly_amounts(monkeypatch):
    monkeypatch.setenv("METEOMATICS_USERNAME", "test-user")
    monkeypatch.setenv("METEOMATICS_PASSWORD", "test-password")
    monkeypatch.setattr(
        meteomatics.meteomatics_api,
        "query_time_series",
        lambda *args, **kwargs: _hourly_frame(
            "evapotranspiration_1h:mm", "2024-01-01 00:00", "2024-01-31 23:00", 0.1
        ),
    )

    result = meteomatics.fetch_monthly_series(
        "evapotranspiration",
        {"id": "ceara", "center": {"latitude": -5.2, "longitude": -39.5}},
        dt.date(2024, 1, 1),
        dt.date(2024, 1, 31),
    )

    assert result["series"][0]["value"] == pytest.approx(74.4)
    assert result["series"][0]["unit"] == "mm/month"


def test_wind_direction_uses_circular_mean_across_north(monkeypatch):
    monkeypatch.setenv("METEOMATICS_USERNAME", "test-user")
    monkeypatch.setenv("METEOMATICS_PASSWORD", "test-password")

    def fake_query(*args, **kwargs):
        frame = _hourly_frame(
            "wind_dir_10m:d", "2024-01-01 00:00", "2024-01-31 23:00", 350
        )
        frame.iloc[len(frame) // 2 :, 0] = 10
        return frame

    monkeypatch.setattr(meteomatics.meteomatics_api, "query_time_series", fake_query)
    result = meteomatics.fetch_monthly_series(
        "wind_direction_10m",
        {"id": "ceara", "center": {"latitude": -5.2, "longitude": -39.5}},
        dt.date(2024, 1, 1),
        dt.date(2024, 1, 31),
    )

    direction = result["series"][0]["value"]
    assert direction is not None
    assert min(direction, 360 - direction) == pytest.approx(0, abs=0.1)
    assert result["supports_trend"] is False
    assert "circular" in result["warnings"][-1]


def test_undefined_wind_direction_mean_is_null(monkeypatch):
    monkeypatch.setenv("METEOMATICS_USERNAME", "test-user")
    monkeypatch.setenv("METEOMATICS_PASSWORD", "test-password")

    def fake_query(*args, **kwargs):
        frame = _hourly_frame(
            "wind_dir_10m:d", "2024-01-01 00:00", "2024-01-31 23:00", 0
        )
        frame.iloc[len(frame) // 2 :, 0] = 180
        return frame

    monkeypatch.setattr(meteomatics.meteomatics_api, "query_time_series", fake_query)
    result = meteomatics.fetch_monthly_series(
        "wind_direction_10m",
        {"id": "ceara", "center": {"latitude": -5.2, "longitude": -39.5}},
        dt.date(2024, 1, 1),
        dt.date(2024, 1, 31),
    )

    assert result["series"][0]["value"] is None
    assert result["series"][0]["quality_flags"] == "undefined_circular_mean"


def test_wind_analysis_does_not_calculate_linear_trend(monkeypatch):
    def fake_fetch_monthly_series(*args, **kwargs):
        return {
            "series": [
                {"timestamp": "2024-01-01", "value": 359.0, "unit": "°", "quality_flags": "ok"},
                {"timestamp": "2024-02-01", "value": 1.0, "unit": "°", "quality_flags": "ok"},
            ],
            "sample_count": 2,
            "expected_count": 2,
            "coverage_fraction": 1.0,
            "hourly_coverage_fraction": 1.0,
            "model": "mix",
            "parameter": "wind_dir_10m:d",
            "latitude": -5.2,
            "longitude": -39.5,
            "retrieved_at": "2024-04-01T00:00:00+00:00",
            "warnings": [],
            "supports_trend": False,
        }

    monkeypatch.setattr(main, "fetch_monthly_series", fake_fetch_monthly_series)
    monkeypatch.setattr(
        main,
        "analyze_time_series",
        lambda *_: pytest.fail("Circular wind directions must not use linear trend analysis"),
    )
    response = TestClient(main.app).post(
        "/api/v1/analyses",
        json={
            "variable_id": "wind_direction_10m",
            "region_id": "ceara",
            "start_date": "2024-01-01",
            "end_date": "2024-02-29",
        },
    )

    assert response.status_code == 200
    assert response.json()["trend"]["applicable"] is False
    assert response.json()["trend"]["slope_per_decade"] is None


def test_live_catalog_exposes_all_configured_variables_and_trend_metadata(monkeypatch):
    client = TestClient(main.app)

    response = client.get("/api/v1/variables")

    assert response.status_code == 200
    variables = response.json()
    assert {item["id"] for item in variables} == set(meteomatics.VARIABLE_PARAMETERS)
    wind = next(item for item in variables if item["id"] == "wind_direction_10m")
    assert wind["trend_supported"] is False
    assert wind["circular"] is True
    assert wind["group"] == "Atmosphere"


def test_live_analysis_requires_credentials(monkeypatch):
    monkeypatch.delenv("METEOMATICS_USERNAME", raising=False)
    monkeypatch.delenv("METEOMATICS_PASSWORD", raising=False)
    client = TestClient(main.app)

    response = client.post(
        "/api/v1/analyses",
        json={
            "variable_id": "air_temperature",
            "region_id": "ceara",
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
        },
    )

    assert response.status_code == 503
    assert "credentials are not configured" in response.json()["detail"]


def test_provider_failure_is_reported_without_internal_details(monkeypatch):
    def fail_request(*args, **kwargs):
        raise meteomatics.MeteomaticsRequestError("sensitive provider response")

    monkeypatch.setattr(main, "fetch_monthly_series", fail_request)
    client = TestClient(main.app)
    response = client.post(
        "/api/v1/analyses",
        json={
            "variable_id": "air_temperature",
            "region_id": "ceara",
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
        },
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "Meteomatics data could not be retrieved or parsed"
    assert "sensitive provider response" not in response.text
