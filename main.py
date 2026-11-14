from __future__ import annotations

import csv
import io
import uuid
from datetime import date, datetime, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.config import API_PREFIX, APP_NAME, APP_VERSION
from app.data_catalog import VARIABLES, REGIONS, build_demo_series, get_region, get_variable
from app.science.trend import analyze_time_series

app = FastAPI(title=APP_NAME, version=APP_VERSION)


def _build_analysis_payload(variable_id: str, region_id: str, start_date: date, end_date: date, dataset_version: str | None = None) -> dict:
    variable = get_variable(variable_id)
    region = get_region(region_id)
    if variable is None:
        raise HTTPException(status_code=404, detail="Unknown variable")
    if region is None:
        raise HTTPException(status_code=404, detail="Unknown region")
    if start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must be before or equal to end_date")

    series = build_demo_series(variable_id, region_id, start_date, end_date)
    if not series:
        raise HTTPException(status_code=422, detail="No data available for the selected period")

    trend = analyze_time_series(series)
    effective_version = dataset_version or "demo-v1"
    analysis_id = str(uuid.uuid4())
    analysis_series = [
        {"timestamp": point["timestamp"], "value": point["value"], "unit": point["unit"], "quality_flags": point["quality_flags"]}
        for point in series
    ]

    sample_count = len(series)
    quality = {
        "sample_count": sample_count,
        "expected_count": sample_count,
        "coverage_fraction": 1.0,
        "warnings": ["Synthetic demo dataset used for MVP validation. Replace with validated Earth-observation data before production."]
    }

    explanation = {
        "summary": f"The {variable['name']} time series for {region['name']} shows a {trend['direction']} trend over the selected period.",
        "limitations": "This is a prototype analysis using a synthetic demo dataset. Scientific interpretation must be validated with official source metadata and methodological checks before publication.",
    }

    return {
        "analysis_id": analysis_id,
        "schema_version": "1.0",
        "dataset_version": effective_version,
        "method_version": "trend-v1",
        "variable_id": variable_id,
        "region_id": region_id,
        "requested_period": {"start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
        "effective_period": {"start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
        "source": "synthetic-demo",
        "product": f"{variable_id}-demo-product",
        "source_url": "https://example.org/earth-detective/demo-data",
        "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "region_version": "region-v1",
        "series": analysis_series,
        "analysis_series": analysis_series,
        "trend": {
            **trend,
            "slope_unit": variable["unit"],
        },
        "quality": quality,
        "explanation": explanation,
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": APP_NAME, "version": APP_VERSION}


@app.get(f"{API_PREFIX}/variables")
def list_variables() -> list[dict]:
    return VARIABLES


@app.get(f"{API_PREFIX}/regions")
def list_regions() -> list[dict]:
    return REGIONS


@app.get(f"{API_PREFIX}/availability")
def availability(
    variable_id: str = Query(...),
    region_id: str = Query(...),
) -> dict:
    variable = get_variable(variable_id)
    region = get_region(region_id)
    if variable is None:
        raise HTTPException(status_code=404, detail="Unknown variable")
    if region is None:
        raise HTTPException(status_code=404, detail="Unknown region")

    return {
        "variable_id": variable_id,
        "region_id": region_id,
        "active_version": "demo-v1",
        "available": True,
        "start_date": "2014-01-01",
        "end_date": "2023-12-31",
        "warning": "Demo coverage is synthetic and should be replaced by real-source validation before release.",
    }


@app.post(f"{API_PREFIX}/analyses")
def create_analysis(payload: dict) -> dict:
    try:
        start_date = date.fromisoformat(payload["start_date"])
        end_date = date.fromisoformat(payload["end_date"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Invalid date format") from exc

    return _build_analysis_payload(
        payload["variable_id"],
        payload["region_id"],
        start_date,
        end_date,
        payload.get("dataset_version"),
    )


@app.post(f"{API_PREFIX}/analyses/export")
def export_analysis(payload: dict) -> StreamingResponse:
    analysis = _build_analysis_payload(
        payload["variable_id"],
        payload["region_id"],
        date.fromisoformat(payload["start_date"]),
        date.fromisoformat(payload["end_date"]),
        payload.get("dataset_version"),
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "value", "unit", "quality_flags", "direction", "slope_per_decade"])
    for point in analysis["series"]:
        writer.writerow([
            point["timestamp"],
            point["value"],
            point["unit"],
            point["quality_flags"],
            analysis["trend"]["direction"],
            analysis["trend"]["slope_per_decade"],
        ])
    response = StreamingResponse(iter([output.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=earth_detective_analysis.csv"
    return response
