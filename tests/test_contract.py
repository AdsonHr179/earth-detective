import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator, FormatChecker

from app import main
from app.services import nasa

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "contracts" / "analysis-response.schema.json"
FIXTURES = ROOT / "contracts" / "fixtures"
STATES = ("descriptive", "insufficient_data", "unsupported")
client = TestClient(main.app)


def contract_response(state, monkeypatch):
    main.clear_analysis_cache()
    payload = {
        "variable_id": "nasa_power_temperature",
        "region_id": "ceara",
        "start_date": "2020-01-01",
        "end_date": "2020-04-30",
        "spatial_query": {"type": "Point", "coordinates": [-39.5, -5.2]},
    }
    if state == "unsupported":
        payload["variable_id"] = "wind_direction_10m"
        monkeypatch.setenv("ENABLE_UNVERIFIED_PROVIDERS", "1")
        monkeypatch.setenv("METEOMATICS_USERNAME", "test-user")
        monkeypatch.setenv("METEOMATICS_PASSWORD", "test-password")
        monkeypatch.setattr(main, "fetch_monthly_series", lambda *args, **kwargs: {
            "series": [
                {"timestamp": "2020-01-01", "value": 359, "unit": "°", "quality_flags": "ok",
                 "coverage_fraction": 1},
                {"timestamp": "2020-02-01", "value": 1, "unit": "°", "quality_flags": "ok",
                 "coverage_fraction": 1},
            ],
            "longitude": -39.5, "latitude": -5.2, "model": "mix", "parameter": "wind_dir_10m:d",
            "retrieved_at": "2020-05-01T00:00:00+00:00", "sample_count": 2, "expected_count": 2,
            "coverage_fraction": 1, "hourly_coverage_fraction": 1,
            "warnings": ["Synthetic test fixture."],
        })
        payload["end_date"] = "2020-02-29"
    else:
        values = {"202001": 20.0, "202002": 20.6, "202003": -999, "202004": 21.8}
        if state == "insufficient_data":
            values = {"202001": -999, "202002": 20.6, "202003": None, "202004": 21.8}
        monkeypatch.setattr(nasa, "_json", lambda *args: {
            "header": {
                "sources": ["MERRA2"], "fill_value": -999, "api": {"version": "synthetic"},
                "time_standard": "LST",
            },
            "parameters": {"T2M": {"units": "C"}},
            "properties": {"parameter": {"T2M": values}},
        })

    response = client.post("/api/v1/analyses", json=payload)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["trend"]["inference_status"] == state
    result["analysis_id"] = f"synthetic-fixture-{state}"
    result["retrieved_at"] = "2020-05-01T00:00:00+00:00"
    return result


@pytest.mark.parametrize("state", STATES)
def test_http_and_complete_fixtures_match_v1_schema(state, monkeypatch):
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    expected = json.loads((FIXTURES / f"{state}.json").read_text(encoding="utf-8"))
    actual = contract_response(state, monkeypatch)
    validator.validate(expected)
    validator.validate(actual)
    assert actual == expected

    invalid_trend = {**actual["trend"], "p_value": 0.97}
    assert not validator.is_valid({**actual, "trend": invalid_trend})


if __name__ == "__main__":
    FIXTURES.mkdir(parents=True, exist_ok=True)
    for state in STATES:
        with pytest.MonkeyPatch.context() as patch:
            result = contract_response(state, patch)
        (FIXTURES / f"{state}.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
        )
