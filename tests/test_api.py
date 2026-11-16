import threading

from fastapi.testclient import TestClient
import pytest

import app.main as main

app = main.app

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_analysis_cache(monkeypatch):
    monkeypatch.setenv("ENABLE_UNVERIFIED_PROVIDERS", "1")
    main.clear_analysis_cache()
    yield
    main.clear_analysis_cache()


def _sample_analysis() -> main.AnalysisResponse:
    return main.AnalysisResponse.model_validate(
        {
            "analysis_id": "test-analysis",
            "schema_version": "1.0",
            "dataset_version": "meteomatics-live",
            "method_version": "test-method",
            "variable_id": "air_temperature",
            "region_id": "ceara",
            "requested_period": {"start_date": "2024-01-01", "end_date": "2024-01-31"},
            "effective_period": {"start_date": "2024-01-01", "end_date": "2024-01-31"},
            "source": "test",
            "product": "test",
            "source_url": "https://example.com",
            "retrieved_at": "2024-02-01T00:00:00+00:00",
            "region_version": "test",
            "series": [
                {
                    "timestamp": "=1+1",
                    "value": 20.0,
                    "unit": "+SUM(1,1)",
                    "quality_flags": "@SUM(1,1)",
                }
            ],
            "analysis_series": [],
            "trend": {
                "direction": "stable",
                "slope_per_decade": 0.0,
                "slope_unit": "°C",
                "confidence_interval": [0.0, 0.0],
                "p_value": 1.0,
                "estimator": "test",
                "inference_method": "test",
                "significant": False,
            },
            "quality": {},
            "explanation": {},
        }
    )


def test_health_endpoint():
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'
    assert response.json()['data_source'] == 'nasa-power'


def test_variables_endpoint():
    response = client.get('/api/v1/variables')
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 21
    assert all('Meteomatics Weather API' in item['source'] for item in payload)


def test_regions_endpoint_includes_map_centers():
    response = client.get('/api/v1/regions')
    assert response.status_code == 200
    payload = response.json()

    ceara = next(item for item in payload if item['id'] == 'ceara')
    assert ceara['center'] == {'latitude': -5.2, 'longitude': -39.5}
    assert ceara['boundaryStateCodes'] == ['23']

    northeast = next(item for item in payload if item['id'] == 'northeast_brazil')
    assert northeast['boundaryStateCodes'] == ['21', '22', '23', '24', '25', '26', '27', '28', '29']


def test_analysis_does_not_fall_back_to_synthetic_data(monkeypatch):
    monkeypatch.delenv('METEOMATICS_USERNAME', raising=False)
    monkeypatch.delenv('METEOMATICS_PASSWORD', raising=False)
    payload = {
        'variable_id': 'air_temperature',
        'region_id': 'ceara',
        'start_date': '2015-01-01',
        'end_date': '2023-12-31',
    }
    response = client.post('/api/v1/analyses', json=payload)
    assert response.status_code == 503
    assert 'credentials are not configured' in response.json()['detail']


def test_analysis_rejects_invalid_selected_coordinates():
    response = client.post(
        '/api/v1/analyses',
        json={
            'variable_id': 'air_temperature',
            'region_id': 'ceara',
            'start_date': '2024-01-01',
            'end_date': '2024-01-31',
            'spatial_query': {'type': 'Point', 'coordinates': [-181, -5]},
        },
    )
    assert response.status_code == 422


def test_request_body_size_is_bounded():
    response = client.post(
        "/api/v1/analyses",
        content=b"x" * (main.MAX_REQUEST_BODY_BYTES + 1),
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "request_too_large"


def test_analysis_concurrency_limit_returns_retryable_error(monkeypatch):
    monkeypatch.setenv("METEOMATICS_USERNAME", "test-user")
    monkeypatch.setenv("METEOMATICS_PASSWORD", "test-password")
    semaphore = threading.BoundedSemaphore(1)
    semaphore.acquire()
    monkeypatch.setattr(main, "_ANALYSIS_SEMAPHORE", semaphore)

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
    assert response.headers["retry-after"] == "1"
    assert response.json()["error"]["code"] == "service_unavailable"


def test_validation_errors_use_the_public_error_shape():
    response = client.post("/api/v1/analyses", json={"variable_id": ""})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"
    assert isinstance(response.json()["detail"], str)
    assert "input" not in response.json()["detail"].lower()


def test_analysis_cache_reuses_identical_requests_and_copies_results(monkeypatch):
    monkeypatch.setenv("METEOMATICS_USERNAME", "test-user")
    monkeypatch.setenv("METEOMATICS_PASSWORD", "test-password")
    calls = []
    analysis = _sample_analysis()

    def fake_build(*args, **kwargs):
        calls.append((args, kwargs))
        return analysis

    monkeypatch.setattr(main, "_build_analysis_payload", fake_build)
    request = main.AnalysisRequest(
        variable_id="air_temperature",
        region_id="ceara",
        start_date="2024-01-01",
        end_date="2024-01-31",
    )

    first = main._build_limited_analysis(request)
    first.series[0].value = 999.0
    second = main._build_limited_analysis(request)

    assert len(calls) == 1
    assert first.analysis_id == second.analysis_id
    assert second.series[0].value == 20.0


def test_analysis_cache_key_covers_versions_geometry_and_statistics(monkeypatch):
    request = main.AnalysisRequest(
        variable_id="air_temperature",
        region_id="ceara",
        start_date="2024-01-01",
        end_date="2024-01-31",
    )
    key = main._analysis_cache_key(request, "mix")

    assert key[4] == main.METEOMATICS_DATASET_VERSION
    assert key[5] == main.METEOMATICS_METHOD_VERSION
    assert key[6] == "mix"
    assert key[7] == ("Point", -39.5, -5.2)

    changed_point = request.model_copy(
        update={
            "spatial_query": main.GeoJSONPoint(
                coordinates=(-38.52, -3.73),
            )
        }
    )
    changed_version = request.model_copy(update={"dataset_version": "other-version"})
    assert main._analysis_cache_key(changed_point, "mix") != key
    assert main._analysis_cache_key(changed_version, "mix") != key
    assert main._analysis_cache_key(request, "other-model") != key

    monkeypatch.setattr(main, "METEOMATICS_METHOD_VERSION", "next-method")
    changed_method = main._analysis_cache_key(request, "mix")
    assert changed_method != key
    monkeypatch.setattr(main, "ALPHA", 0.1)
    assert main._analysis_cache_key(request, "mix") != changed_method


def test_csv_export_escapes_formula_like_text(monkeypatch):
    monkeypatch.setenv("METEOMATICS_USERNAME", "test-user")
    monkeypatch.setenv("METEOMATICS_PASSWORD", "test-password")
    analysis = _sample_analysis()
    monkeypatch.setattr(main, "_build_analysis_payload", lambda *_args, **_kwargs: analysis)

    response = client.post(
        "/api/v1/analyses/export",
        json={
            "variable_id": "air_temperature",
            "region_id": "ceara",
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
        },
    )

    assert response.status_code == 200
    assert "'=1+1" in response.text
    assert "'+SUM(1,1)" in response.text
    assert "'@SUM(1,1)" in response.text


def test_experimental_meteomatics_availability_requires_opt_in(monkeypatch):
    monkeypatch.delenv("ENABLE_UNVERIFIED_PROVIDERS", raising=False)
    monkeypatch.setenv("METEOMATICS_USERNAME", "test-user")
    monkeypatch.setenv("METEOMATICS_PASSWORD", "test-password")
    response = client.get("/api/v1/availability?variable_id=air_temperature&region_id=ceara")
    assert response.status_code == 200
    assert response.json()["available"] is False
    assert "disabled" in response.json()["warning"]


def test_legacy_record_reopens_without_assigning_new_inference_state():
    from app.services import analysis_store

    original = _sample_analysis().model_dump(mode="json")
    analysis_store.save(_sample_analysis())
    main.clear_analysis_cache()

    response = client.get("/api/v1/analyses/test-analysis")
    assert response.status_code == 200
    assert response.json() == original
    assert response.json()["trend"]["p_value"] == 1.0
    assert "inference_status" not in response.json()["trend"]
    assert "inference_reason" not in response.json()["trend"]


@pytest.mark.parametrize("start_date", [1577836800, "20200101", "2020-01-01T00:00:00"])
def test_analysis_requires_iso_calendar_dates(start_date):
    response = client.post("/api/v1/analyses", json={
        "variable_id": "nasa_power_temperature", "region_id": "ceara",
        "start_date": start_date, "end_date": "2020-12-31",
    })
    assert response.status_code == 422
    assert "ISO YYYY-MM-DD" in response.json()["detail"]



def test_streamed_request_uses_the_same_body_limit():
    body = iter([b"x" * (main.MAX_REQUEST_BODY_BYTES // 2)] * 3)
    response = client.post("/api/v1/analyses", content=body, headers={"content-type": "application/json"})
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "request_too_large"
