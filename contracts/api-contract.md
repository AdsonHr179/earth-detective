# Earth Detective API V1

The API uses `/api/v1`. Health is available at `/health` and `/api/v1/health`.

| Method | Path relative to `/api/v1` | Result |
| --- | --- | --- |
| GET | `/variables` and `/nasa/variables` | Meteomatics and NASA variable catalogs |
| GET | `/nasa/sources` | NASA reference pages and reachability |
| GET | `/regions` | Region metadata, including map center and `boundaryStateCodes` |
| GET | `/availability?variable_id=…&region_id=…` | Configured bounds, eligibility and warning |
| POST | `/analyses` | Acquire or reuse a bounded cached analysis and persist its result |
| GET | `/analyses?limit=20&offset=0` | Saved analysis summaries, newest first |
| GET | `/analyses/{id}` | Full saved analysis |
| GET | `/analyses/{id}/export` | CSV for the same saved analysis |
| POST | `/analyses/export` | Compatibility export by request, which may query after cache expiry |

## Request

```json
{
  "variable_id": "nasa_power_temperature",
  "region_id": "ceara",
  "start_date": "2020-01-01",
  "end_date": "2023-12-31",
  "dataset_version": "nasa-power-monthly",
  "spatial_query": {"type": "Point", "coordinates": [-39.5, -5.2]}
}
```

Both dates are inclusive ISO calendar dates. `spatial_query` is optional and defaults to
the catalog center. Point coordinates are WGS 84 `[longitude, latitude]`. Region IDs provide
map context for a grid cell or model point. `dataset_version` can be omitted to select
the provider's configured version. POWER accepts up to 120 complete months, excludes
partial edge months and uses the last complete calendar year as its catalog upper bound.

## Response and quality

The [JSON Schema](analysis-response.schema.json) describes newly created analyses.
Complete synthetic test responses cover [descriptive](fixtures/descriptive.json),
[insufficient data](fixtures/insufficient_data.json), and [unsupported](fixtures/unsupported.json).
NASA responses add `statistics` and `forecast`, each nullable. The forecast is a separate
historical same-calendar-month mean where the sample supports it.

`requested_period` echoes the dates. `effective_period` spans the first and last non-null
monthly values, with the last date set to the last day of that month. Both effective dates
are null if every month is missing. `series` and `analysis_series` retain gaps with null
values. `quality.sample_count` counts finite months, `expected_count` counts represented
months, and `coverage_fraction` is their ratio. POWER point coverage is binary per month
and describes returned monthly values. Hourly coverage is available separately from Meteomatics.

POWER records the requested point and, in `quality.provider_metadata`, the query URL,
source API version, canonical provider response SHA-256 and time standard. `retrieved_at`
records UTC acquisition. `dataset_version` identifies the product route. The POWER
response hash identifies the acquired content.

## Trend semantics

| `inference_status` | `applicable` | Rate | p-value, CI, significant | `inference_reason` |
| --- | --- | --- | --- | --- |
| `descriptive` | true | finite | null | Explicit reason in English |
| `insufficient_data` | false | null | null | Minimum data rule in English |
| `unsupported` | false | null | null | Limitation in English |
| `validated` | true | finite | non-null | Null if unrestricted |

The current methods are `nasa-monthly-v2` and `meteomatics-hourly-monthly-v3`.
V1 reserves `validated` for methods with evidence for the selected series. This release
emits the other three states. `slope_unit` already includes “per decade.” Direction
retains `increasing`, `decreasing`, `stable`, and `undetermined`. Stable denotes a
near-zero fitted slope. `applicable` is independent of statistical significance.
Historical payloads keep the original method and fields. Clients should flag historical
inference as unvalidated when either new field is absent.

## Errors, configuration and storage

Errors retain `detail` and `error.code`/`error.message`. Common codes include
`invalid_request` (422), `not_found` (404), `conflict` (409),
`request_too_large` (413), `upstream_error` (502), and
`service_unavailable` or `analysis_storage_unavailable` (503).
Coordinates, complete NASA periods, product bounds, and version compatibility are
validated before querying. The request body limit is 16 KiB. Four concurrent uncached
analyses per process are allowed. Saturation returns `Retry-After: 1`. Upstream failures
produce structured errors without synthetic fallback.

Use a same-origin proxy for `/api/v1` or set `ALLOWED_ORIGINS` on the backend to a
comma-separated list of explicit HTTP(S) origins with optional ports. Cross-origin
credentials are disabled. POWER uses a public endpoint. Experimental Meteomatics and
Earthdata access requires `ENABLE_UNVERIFIED_PROVIDERS=1` plus server-only
`METEOMATICS_USERNAME` and `METEOMATICS_PASSWORD` or `EARTHDATA_TOKEN`.
`METEOMATICS_MODEL` is optional. Availability describes configuration, with live
coverage established by a successful query. Stored analyses remain readable when
provider access changes.

Set `ANALYSIS_DB_PATH` to a writable SQLite file on the persistent filesystem used by
the backend. The response is written before a successful POST returns. The existing
SQLite layout is compatible. The CSV preserves the original eight columns, then appends
unit, inference, analysis ID and provenance columns. `GET /analyses/{id}` supplies the full
saved period, parameters, series and quality metadata as JSON. Null CSV cells are empty.
