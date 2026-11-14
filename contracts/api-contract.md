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
  "dataset_version": "meteomatics-live",
  "spatial_query": {
    "type": "Point",
    "coordinates": [-39.5, -5.2]
  }
}
```

`spatial_query` is optional. Coordinates are WGS 84 GeoJSON order
`[longitude, latitude]`; when omitted, the API uses the selected region's
catalog center. Analysis requests always use Meteomatics and never fall back to
synthetic values.

Region records include `boundaryStateCodes`, using IBGE state codes for the free
official state boundaries displayed on the map. The frontend fetches simplified
GeoJSON only for member states that intersect the current map viewport. This
highlight is a geographic boundary mask. Click the map to choose an analysis
point; otherwise, climate analysis uses the selected region's center. Neither is
an area-weighted regional average.

## Data source configuration

The backend uses Meteomatics only. Set `METEOMATICS_USERNAME` and
`METEOMATICS_PASSWORD` server-side before starting it.
`METEOMATICS_MODEL` is optional and defaults to `mix`. Restart the backend after
changing these variables. Credentials must never be sent by the browser.

For live Meteomatics analyses:

- The variable catalog exposes these point time series (each selectable as its
  own chart):

  | Variable | Meteomatics parameter | Monthly aggregation |
  | --- | --- | --- |
  | Air temperature at 2 m | `t_2m:C` | Mean |
  | Precipitation | `precip_1h:mm` | Sum |
  | Soil water content (0-7 cm) | `volumetric_soil_water_-5cm:m3m3` | Mean |
  | Soil water content (7-28 cm) | `volumetric_soil_water_-15cm:m3m3` | Mean |
  | Soil water content (28-100 cm) | `volumetric_soil_water_-50cm:m3m3` | Mean |
  | Soil water content (100-289 cm) | `volumetric_soil_water_-150cm:m3m3` | Mean |
  | Soil moisture index (0-7, 7-28, 28-100, 100-289 cm) | `soil_moisture_index` at representative depths -5, -15, -50, -150 cm | Mean |
  | Soil moisture deficit | `soil_moisture_deficit:mm` | Mean |
  | Soil temperature (0-7, 7-28, 28-100, 100-289 cm) | `t_-5cm:C`, `t_-15cm:C`, `t_-50cm:C`, `t_-150cm:C` | Mean |
  | Wind speed at 10 m | `wind_speed_10m:ms` | Mean |
  | Wind direction at 10 m | `wind_dir_10m:d` | Circular mean (0-360 degrees) |
  | Relative humidity at 2 m | `relative_humidity_2m:p` | Mean |
  | Mean sea-level pressure | `msl_pressure:hPa` | Mean |
  | Global radiation | `global_rad:W` | Mean |
  | Reference evapotranspiration | `evapotranspiration_1h:mm` | Sum |

- Hourly observations are aggregated to calendar months. A month with less than
  90% hourly coverage is returned as `null`, never as zero. A mathematically
  undefined circular mean is also returned as `null`.
- The variable catalog groups measurements and marks whether trend analysis is
  supported. Wind direction is shown as a circular series; linear trend,
  significance, and confidence intervals are not calculated for it.
- The parameters above are configured in the API, but the account's plan,
  product access, model availability, and historical coverage are not verified
  until the corresponding live analysis request succeeds. Availability does not
  guarantee account entitlement.
- Queries use the clicked map coordinate or, if omitted, the configured
  region-center coordinate. This is a point query, not an area-weighted regional
  mean.
- Analysis responses include the actual `spatial_query` as a GeoJSON `Point`,
  with coordinates ordered `[longitude, latitude]` in WGS 84.
- Static soil properties such as soil type are not time series and are not
  included in this chart catalog.
- `dataset_version` is reported as `meteomatics-live`; it is not an immutable
  provider archive. Results include that limitation in `quality.warnings`.
- Availability can confirm a configured parameter, but account access and
  historical coverage are only confirmed by a successful analysis query.

Provider configuration failures return HTTP 503; provider request/response
failures return HTTP 502; unsupported variables and periods over ten years
return HTTP 422. A requested non-live dataset version returns HTTP 409. Live
analysis fails explicitly and does not fall back to synthetic values.
