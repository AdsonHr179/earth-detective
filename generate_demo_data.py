from __future__ import annotations

import csv
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "generated" / "demo_series.csv"


def build_series(variable: str, year_start: int = 2014, year_end: int = 2023) -> list[dict]:
    rows: list[dict] = []
    for year in range(year_start, year_end + 1):
        for month in range(1, 13):
            if variable == "air_temperature":
                value = 26.4 + (year - 2014) * 0.12 + (month * 0.4)
            elif variable == "precipitation":
                value = 70 - (year - 2014) * 0.6 + month * 2.5
            else:
                value = 0.24 + (year - 2014) * 0.004 + month * 0.006
            rows.append(
                {
                    "date": date(year, month, 1).isoformat(),
                    "variable": variable,
                    "region": "ceara",
                    "value": round(value, 3),
                    "unit": "°C" if variable == "air_temperature" else "mm/month" if variable == "precipitation" else "m3/m3",
                }
            )
    return rows


if __name__ == "__main__":
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["date", "variable", "region", "value", "unit"]
    with OUTPUT.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        for variable in ["air_temperature", "precipitation", "soil_moisture"]:
            for row in build_series(variable):
                writer.writerow(row)
    print(f"Generated demo dataset at {OUTPUT}")
