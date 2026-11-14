from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


def test_variables_endpoint():
    response = client.get('/api/v1/variables')
    assert response.status_code == 200
    payload = response.json()
    assert any(item['id'] == 'air_temperature' for item in payload)


def test_analysis_endpoint():
    payload = {
        'variable_id': 'air_temperature',
        'region_id': 'ceara',
        'start_date': '2015-01-01',
        'end_date': '2023-12-31',
    }
    response = client.post('/api/v1/analyses', json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body['variable_id'] == 'air_temperature'
    assert 'trend' in body
    assert body['trend']['direction'] in {'increasing', 'decreasing', 'stable', 'undetermined'}
