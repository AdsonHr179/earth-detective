from __future__ import annotations

from typing import Any

VARIABLES = [
    {
        "id": "air_temperature",
        "name": "Air temperature at 2 m",
        "unit": "°C",
        "description": "Monthly mean near-surface air temperature.",
        "group": "Atmosphere",
    },
    {
        "id": "precipitation",
        "name": "Precipitation",
        "unit": "mm/month",
        "description": "Monthly total precipitation from hourly accumulations.",
        "group": "Water balance",
    },
    {
        "id": "soil_moisture_0_7cm",
        "name": "Soil water content (0-7 cm)",
        "unit": "m3/m3",
        "description": "Monthly mean volumetric water content in the topsoil layer.",
        "group": "Soil",
    },
    {
        "id": "soil_moisture_7_28cm",
        "name": "Soil water content (7-28 cm)",
        "unit": "m3/m3",
        "description": "Monthly mean volumetric water content at 7-28 cm depth.",
        "group": "Soil",
    },
    {
        "id": "soil_moisture_28_100cm",
        "name": "Soil water content (28-100 cm)",
        "unit": "m3/m3",
        "description": "Monthly mean volumetric water content at 28-100 cm depth.",
        "group": "Soil",
    },
    {
        "id": "soil_moisture_100_289cm",
        "name": "Soil water content (100-289 cm)",
        "unit": "m3/m3",
        "description": "Monthly mean volumetric water content at 100-289 cm depth.",
        "group": "Soil",
    },
    {
        "id": "soil_moisture_index_0_7cm",
        "name": "Soil moisture index (0-7 cm)",
        "unit": "index",
        "description": "Monthly mean soil wetness index for the 0-7 cm layer.",
        "group": "Soil",
    },
    {
        "id": "soil_moisture_index_7_28cm",
        "name": "Soil moisture index (7-28 cm)",
        "unit": "index",
        "description": "Monthly mean soil wetness index for the 7-28 cm layer.",
        "group": "Soil",
    },
    {
        "id": "soil_moisture_index_28_100cm",
        "name": "Soil moisture index (28-100 cm)",
        "unit": "index",
        "description": "Monthly mean soil wetness index for the 28-100 cm layer.",
        "group": "Soil",
    },
    {
        "id": "soil_moisture_index_100_289cm",
        "name": "Soil moisture index (100-289 cm)",
        "unit": "index",
        "description": "Monthly mean soil wetness index for the 100-289 cm layer.",
        "group": "Soil",
    },
    {
        "id": "soil_moisture_deficit",
        "name": "Soil moisture deficit",
        "unit": "mm",
        "description": "Monthly mean water deficit relative to soil water-holding capacity.",
        "group": "Soil",
    },
    {
        "id": "soil_temperature_0_7cm",
        "name": "Soil temperature (0-7 cm)",
        "unit": "°C",
        "description": "Monthly mean soil temperature in the 0-7 cm layer.",
        "group": "Soil",
    },
    {
        "id": "soil_temperature_7_28cm",
        "name": "Soil temperature (7-28 cm)",
        "unit": "°C",
        "description": "Monthly mean soil temperature in the 7-28 cm layer.",
        "group": "Soil",
    },
    {
        "id": "soil_temperature_28_100cm",
        "name": "Soil temperature (28-100 cm)",
        "unit": "°C",
        "description": "Monthly mean soil temperature in the 28-100 cm layer.",
        "group": "Soil",
    },
    {
        "id": "soil_temperature_100_289cm",
        "name": "Soil temperature (100-289 cm)",
        "unit": "°C",
        "description": "Monthly mean soil temperature in the 100-289 cm layer.",
        "group": "Soil",
    },
    {
        "id": "wind_speed_10m",
        "name": "Wind speed at 10 m",
        "unit": "m/s",
        "description": "Monthly mean wind speed at 10 m above ground.",
        "group": "Atmosphere",
    },
    {
        "id": "wind_direction_10m",
        "name": "Wind direction at 10 m",
        "unit": "°",
        "description": "Circular monthly mean wind direction, measured clockwise from north.",
        "group": "Atmosphere",
        "circular": True,
    },
    {
        "id": "relative_humidity_2m",
        "name": "Relative humidity at 2 m",
        "unit": "%",
        "description": "Monthly mean relative humidity at 2 m above ground.",
        "group": "Atmosphere",
    },
    {
        "id": "sea_level_pressure",
        "name": "Mean sea-level pressure",
        "unit": "hPa",
        "description": "Monthly mean atmospheric pressure adjusted to sea level.",
        "group": "Atmosphere",
    },
    {
        "id": "global_radiation",
        "name": "Global radiation",
        "unit": "W/m2",
        "description": "Monthly mean global shortwave radiation flux.",
        "group": "Radiation",
    },
    {
        "id": "evapotranspiration",
        "name": "Reference evapotranspiration",
        "unit": "mm/month",
        "description": "Monthly total reference evapotranspiration.",
        "group": "Water balance",
    },
]

REGIONS = [
    {
        "id": "world",
        "name": "Worldwide",
        "country": "",
        "geometryName": "world",
        "geometryRef": "",
        "boundaryStateCodes": [],
        "center": None,
    },
    {
        "id": "ceara",
        "name": "Ceará",
        "country": "Brazil",
        "geometryName": "ceara_outline",
        "geometryRef": "https://servicodados.ibge.gov.br/api/v3/malhas/estados",
        "boundaryStateCodes": ["23"],
        "center": {"latitude": -5.2, "longitude": -39.5},
    },
    {
        "id": "northeast_brazil",
        "name": "Northeast Brazil",
        "country": "Brazil",
        "geometryName": "northeast_brazil_outline",
        "geometryRef": "https://servicodados.ibge.gov.br/api/v3/malhas/estados",
        "boundaryStateCodes": ["21", "22", "23", "24", "25", "26", "27", "28", "29"],
        "center": {"latitude": -9.0, "longitude": -38.5},
    },
]


def get_variable(variable_id: str) -> dict[str, Any] | None:
    return next((item for item in VARIABLES if item["id"] == variable_id), None)


def get_region(region_id: str) -> dict[str, Any] | None:
    return next((item for item in REGIONS if item["id"] == region_id), None)
