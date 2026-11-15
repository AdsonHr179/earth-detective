from datetime import date

import h5py
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app, clear_analysis_cache
from app.services import nasa

client = TestClient(app)


def test_public_nasa_analysis_exposes_statistics_and_forecast(monkeypatch):
    clear_analysis_cache()

    def power_response(url, params):
        assert url == nasa.POWER and params["parameters"] == "T2M"
        return {
            "header": {
                "sources": ["MERRA2"], "fill_value": -999, "api": {"version": "synthetic"},
                "time_standard": "LST",
            },
            "parameters": {"T2M": {"units": "C"}},
            "properties": {"parameter": {"T2M": {
                f"{year}{month:02d}": 20 + month
                for year in range(2020, 2024) for month in range(1, 13)
            }}},
        }

    monkeypatch.setattr(nasa, "_json", power_response)
    payload = {
        "variable_id": "nasa_power_temperature", "region_id": "ceara",
        "start_date": "2020-01-01", "end_date": "2023-12-31",
    }
    response = client.post("/api/v1/analyses", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["statistics"]["count"] == 48
    assert data["statistics"]["mean"] == 26.5
    assert data["forecast"]["points"][0] == {"timestamp": "2024-01-01", "value": 21.0}
    assert data["forecast"]["backtest_count"] == 12
    assert data["forecast"]["backtest_mae"] == 0
    assert data["trend"]["inference_status"] == "descriptive"
    assert data["trend"]["p_value"] is data["trend"]["confidence_interval"] is data["trend"]["significant"] is None

    export = client.post("/api/v1/analyses/export", json=payload)
    assert export.status_code == 200
    assert "2023-12-01,32.0" in export.text
    assert "2024-01-01" not in export.text
    analysis_id = data["analysis_id"]
    assert client.post("/api/v1/analyses", json=payload).json()["analysis_id"] == analysis_id
    assert len(client.get("/api/v1/analyses").json()) == 1

    clear_analysis_cache()
    monkeypatch.setattr(nasa, "_json", lambda *args, **kwargs: pytest.fail("A saved analysis must not refetch NASA"))
    assert client.get(f"/api/v1/analyses/{analysis_id}").json() == data
    assert client.get(f"/api/v1/analyses/{analysis_id}/export").text == export.text
    assert client.get("/api/v1/analyses/unknown").status_code == 404


def test_nasa_archives_require_earthdata_configuration(monkeypatch):
    monkeypatch.delenv("EARTHDATA_TOKEN", raising=False)
    response = client.get("/api/v1/availability?variable_id=nasa_imerg_precipitation&region_id=ceara")
    assert response.status_code == 200
    assert not response.json()["available"]
    assert "EARTHDATA_TOKEN" in response.json()["warning"]
    assert client.post("/api/v1/analyses", json={
        "variable_id": "nasa_imerg_precipitation", "region_id": "ceara",
        "start_date": "2024-02-01", "end_date": "2024-02-29",
    }).status_code == 503


def test_archive_cell_axis_order_units_and_fill_values(tmp_path):
    file = tmp_path / "archive.h5"
    month = date(2024, 2, 1)
    with h5py.File(file, "w") as handle:
        grid = handle.create_group("Grid")
        grid["lat"] = [-6, -5]
        grid["lon"] = [-40, -39, -38]
        grid["precipitation"] = np.array([[[0, 0], [0, 2], [0, 0]]])
        handle["lat"] = [-6, -5]
        handle["lon"] = [-40, -39, -38]
        handle["T2M"] = np.array([[[0, 0, 0], [0, 300, 0]]], dtype=float)
        soil = handle.create_dataset("SoilMoi0_10cm_inst", data=[[[0, 0, 0], [0, 35, -9999]]])
        soil.attrs["_FillValue"] = -9999
        assert nasa._cell_value(handle, nasa.PRODUCTS["nasa_imerg_precipitation"], -5, -39, month) == 1392
        assert round(nasa._cell_value(handle, nasa.PRODUCTS["nasa_merra2_temperature"], -5, -39, month), 2) == 26.85
        assert nasa._cell_value(handle, nasa.PRODUCTS["nasa_gldas_soil_water"], -5, -39, month) == 35
        assert nasa._cell_value(handle, nasa.PRODUCTS["nasa_gldas_soil_water"], -5, -38, month) is None


def test_power_wrong_unit_returns_structured_upstream_error(monkeypatch):
    clear_analysis_cache()
    monkeypatch.setattr(nasa, "_json", lambda *_: {
        "header": {"sources": ["MERRA2"], "fill_value": -999},
        "parameters": {"T2M": {"units": "K"}},
    })
    response = client.post("/api/v1/analyses", json={
        "variable_id": "nasa_power_temperature", "region_id": "ceara",
        "start_date": "2020-01-01", "end_date": "2020-02-29",
    })
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "upstream_error"
    assert "temperature unit" in response.json()["detail"]


def test_power_empty_months_preserve_gaps_and_null_effective_period(monkeypatch):
    clear_analysis_cache()
    monkeypatch.setattr(nasa, "_json", lambda *_: {
        "header": {
            "sources": ["MERRA2"], "fill_value": -999, "api": {"version": "synthetic"},
            "time_standard": "LST",
        },
        "parameters": {"T2M": {"units": "C"}},
        "properties": {"parameter": {"T2M": {"202002": -999, "202003": float("inf")}}},
    })
    response = client.post("/api/v1/analyses", json={
        "variable_id": "nasa_power_temperature", "region_id": "ceara",
        "start_date": "2020-01-02", "end_date": "2020-05-15",
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["trend"]["inference_status"] == "insufficient_data"
    assert body["effective_period"] == {"start_date": None, "end_date": None}
    assert body["quality"]["coverage_fraction"] == 0
    assert [point["timestamp"] for point in body["series"]] == ["2020-02-01", "2020-03-01", "2020-04-01"]
    assert all(point["value"] is None for point in body["series"])
    assert any("Partial months" in warning for warning in body["quality"]["warnings"])


def test_requested_power_period_above_360_complete_months_is_rejected(monkeypatch):
    monkeypatch.setattr(nasa, "_json", lambda *_: pytest.fail("Over-limit requests must not query NASA"))
    response = client.post("/api/v1/analyses", json={
        "variable_id": "nasa_power_temperature", "region_id": "ceara",
        "start_date": "1994-01-01", "end_date": "2024-01-31",
    })
    assert response.status_code == 422
    assert "360 complete calendar months" in response.json()["detail"]


def test_large_period_remains_limited_for_earthdata(monkeypatch):
    monkeypatch.setenv("EARTHDATA_TOKEN", "synthetic-test-token")
    monkeypatch.setenv("ENABLE_UNVERIFIED_PROVIDERS", "1")

    def fail(*args):
        pytest.fail("Over-limit requests must not query Earthdata")

    monkeypatch.setattr(nasa, "_archive_urls", fail)
    response = client.post("/api/v1/analyses", json={
        "variable_id": "nasa_merra2_temperature", "region_id": "ceara",
        "start_date": "2010-01-01", "end_date": "2020-01-31",
    })
    assert response.status_code == 422
    assert "120 complete calendar months" in response.json()["detail"]


def test_worldwide_analysis_requires_and_uses_the_selected_coordinates(monkeypatch):
    clear_analysis_cache()

    def power_response(url, params):
        assert url == nasa.POWER
        assert (params["longitude"], params["latitude"]) == (139.6917, 35.6895)
        return {
            "header": {
                "sources": ["MERRA2"], "fill_value": -999, "api": {"version": "synthetic"},
                "time_standard": "LST",
            },
            "parameters": {"T2M": {"units": "C"}},
            "properties": {"parameter": {"T2M": {"202001": 5, "202002": 6, "202003": 7}}},
        }

    monkeypatch.setattr(nasa, "_json", power_response)
    region = next(item for item in client.get("/api/v1/regions").json() if item["id"] == "world")
    assert region["center"] is None
    assert region["boundaryStateCodes"] == []
    assert client.get(
        "/api/v1/availability?variable_id=nasa_power_temperature&region_id=world"
    ).json()["available"] is True

    request = {
        "variable_id": "nasa_power_temperature", "region_id": "world",
        "start_date": "2020-01-01", "end_date": "2020-03-31",
    }
    missing_point = client.post("/api/v1/analyses", json=request)
    assert missing_point.status_code == 422
    assert "Choose a point" in missing_point.json()["error"]["message"]

    point = {"type": "Point", "coordinates": [139.6917, 35.6895]}
    response = client.post("/api/v1/analyses", json={**request, "spatial_query": point})
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["region_id"] == "world"
    assert saved["spatial_query"] == point
    assert saved["quality"]["sample_count"] == 3
    assert client.get(f"/api/v1/analyses/{saved['analysis_id']}").json() == saved
