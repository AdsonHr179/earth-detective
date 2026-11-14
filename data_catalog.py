from __future__ import annotations

from datetime import date, datetime
from typing import Any

VARIABLES = [
    {
        "id": "air_temperature",
        "name": "Air Temperature",
        "unit": "°C",
        "description": "Land surface or near-surface temperature used to estimate warming patterns.",
        "source": "Synthetic demo source for MVP",
    },
    {
        "id": "precipitation",
        "name": "Precipitation",
        "unit": "mm/month",
        "description": "Monthly precipitation total used to assess rainfall change.",
        "source": "Synthetic demo source for MVP",
    },
    {
        "id": "soil_moisture",
        "name": "Soil Moisture",
        "unit": "m3/m3",
        "description": "Surface soil moisture used to estimate water availability change.",
        "source": "Synthetic demo source for MVP",
    },
]

REGIONS = [
    {
        "id": "ceara",
        "name": "Ceará",
        "country": "Brazil",
        "geometryName": "ceara_outline",
        "geometryRef": "https://example.org/geojson/ceara",
    },
    {
        "id": "northeast_brazil",
        "name": "Northeast Brazil",
        "country": "Brazil",
        "geometryName": "northeast_brazil_outline",
        "geometryRef": "https://example.org/geojson/northeast-brazil",
    },
]


def _make_demo_values(variable_id: str, year: int) -> float:
    if variable_id == "air_temperature":
        base = 26.2 + ((year - 2014) * 0.12)
        seasonal = (year % 12) * 0.45
        return round(base + seasonal / 10, 3)
    if variable_id == "precipitation":
        base = 70.0 - (year - 2014) * 0.6
        seasonal = ((year + 2) % 12) * 2.5
        return round(max(25.0, base + seasonal), 3)
    base = 0.24 + ((year - 2014) * 0.004)
    seasonal = ((year + 3) % 12) * 0.006
    return round(base + seasonal, 4)


def build_demo_series(variable_id: str, region_id: str, start: date, end: date) -> list[dict[str, Any]]:
    series: list[dict[str, Any]] = []
    current = datetime(start.year, start.month, 1)
    final = datetime(end.year, end.month, 1)
    while current <= final:
        raw_value = _make_demo_values(variable_id, current.year)
        series.append(
            {
                "timestamp": current.strftime("%Y-%m-%d"),
                "value": raw_value,
                "unit": next(item["unit"] for item in VARIABLES if item["id"] == variable_id),
                "quality_flags": "ok",
            }
        )
        if current.month == 12:
            current = datetime(current.year + 1, 1, 1)
        else:
            current = datetime(current.year, current.month + 1, 1)

    return series


def get_variable(variable_id: str) -> dict[str, Any] | None:
    return next((item for item in VARIABLES if item["id"] == variable_id), None)


def get_region(region_id: str) -> dict[str, Any] | None:
    return next((item for item in REGIONS if item["id"] == region_id), None)
