# Earth Detective API contract

Base path: `/api/v1`

## Endpoints

- `GET /health`
- `GET /variables`
- `GET /regions`
- `GET /availability?variable_id=...&region_id=...`
- `POST /analyses`
- `POST /analyses/export`

## Analysis request body

```json
{
  "variable_id": "air_temperature",
  "region_id": "ceara",
  "start_date": "2015-01-01",
  "end_date": "2023-12-31",
  "dataset_version": null
}
```

This is a starter contract aligned with the project specification and the MVP scaffold.
