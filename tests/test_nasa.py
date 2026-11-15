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
            "header": {"sources": ["MERRA2"], "fill_value": -999},
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
