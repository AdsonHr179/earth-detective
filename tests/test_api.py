from fastapi.testclient import TestClient

import app.main as main

app = main.app

client = TestClient(app)


def test_health_endpoint():
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'
    assert response.json()['data_source'] == 'meteomatics'


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
