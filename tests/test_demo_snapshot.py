import csv
import hashlib
import io
import json
from datetime import date
from pathlib import Path
from statistics import covariance, variance

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator, FormatChecker

from app import main
from app.services import nasa

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOTS = ROOT / "data" / "demo" / "nasa-power"


@pytest.mark.parametrize(
    "start_year,months,expected_rate",
    [(2020, 48, 1.8691077193443377), (2021, 36, 2.9480148941351154)],
)
def test_real_snapshot_has_provenance_and_independent_rate(start_year, months, expected_rate):
    stem = f"ceara-{start_year}-2023"
    raw = json.loads((SNAPSHOTS / f"{stem}.provider.json").read_bytes())
    saved = json.loads((SNAPSHOTS / f"{stem}.analysis.json").read_bytes())
    schema = json.loads((ROOT / "contracts" / "analysis-response.schema.json").read_bytes())
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(saved)

    metadata = saved["quality"]["provider_metadata"]
    content = {key: value for key, value in raw.items() if key != "times"}
    digest = hashlib.sha256(json.dumps(content, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    assert metadata["response_sha256"] == digest
    assert raw["header"]["sources"] == ["MERRA2"]
    assert raw["parameters"]["T2M"]["units"] == "C"
    assert saved["spatial_query"]["coordinates"] == raw["geometry"]["coordinates"][:2] == [-39.5, -5.2]
    assert saved["quality"]["sample_count"] == saved["quality"]["expected_count"] == months
    assert saved["quality"]["coverage_fraction"] == 1

    dates = [date.fromisoformat(point["timestamp"]).toordinal() for point in saved["analysis_series"]]
    series = [point["value"] for point in saved["analysis_series"]]
    upstream = raw["properties"]["parameter"]["T2M"]
    for point in saved["analysis_series"]:
        key = point["timestamp"][:7].replace("-", "")
        assert point["value"] == upstream[key] != raw["header"]["fill_value"]
    reference_rate = covariance(dates, series) / variance(dates) * 3652.425
    assert reference_rate == pytest.approx(expected_rate, abs=1e-10)
    assert saved["trend"]["slope_per_decade"] == pytest.approx(reference_rate, abs=1e-10)
    assert saved["trend"]["inference_status"] == "descriptive"
    assert saved["trend"]["p_value"] is saved["trend"]["confidence_interval"] is saved["trend"]["significant"] is None


def test_seed_reopens_and_exports_without_a_provider(monkeypatch):
    from pipelines.seed_nasa_demo import load_demo

    def fail(*args, **kwargs):
        pytest.fail("A saved public snapshot must not query NASA")

    monkeypatch.setattr(nasa, "_json", fail)
    first = load_demo()
    assert load_demo() == first

    main.clear_analysis_cache()
    client = TestClient(main.app)
    assert len(client.get("/api/v1/analyses").json()) == 2
    for snapshot in first:
        route = f"/api/v1/analyses/{snapshot.analysis_id}"
        assert client.get(route).json() == snapshot.model_dump(mode="json")
        response = client.get(f"{route}/export")
        assert response.status_code == 200
        rows = list(csv.DictReader(io.StringIO(response.text)))
        assert len(rows) == len(snapshot.series)
        for row, point in zip(rows, snapshot.series):
            assert row["timestamp"] == point.timestamp
            assert float(row["value"]) == point.value
            assert row["unit"] == point.unit
            assert row["slope_unit"] == snapshot.trend.slope_unit
            assert float(row["slope_per_decade"]) == snapshot.trend.slope_per_decade
            assert row["analysis_id"] == snapshot.analysis_id
            assert row["method_version"] == snapshot.method_version
            assert row["inference_status"] == "descriptive"
