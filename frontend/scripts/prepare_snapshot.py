"""Package B's real NASA snapshot and its exact saved CSV; never generate observations."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import os
import subprocess
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data/demo/nasa-power/ceara-2020-2023.analysis.json"
OUT = ROOT / "frontend/public/snapshots"
API = os.environ.get("SNAPSHOT_API_ORIGIN", "http://127.0.0.1:8000").rstrip("/")


def get(path: str) -> bytes:
    with urllib.request.urlopen(API + path, timeout=30) as response:
        return response.read()


def main() -> None:
    raw_bytes = SOURCE.read_bytes()
    analysis = json.loads(raw_bytes)
    ident = analysis["analysis_id"]
    assert analysis["source"] == "NASA POWER / MERRA-2"
    assert analysis["method_version"] == "nasa-monthly-v2"
    assert analysis["trend"]["inference_status"] == "descriptive"
    assert all(analysis["trend"][k] is None for k in ("p_value", "confidence_interval", "significant"))
    assert analysis["requested_period"] == {"start_date": "2020-01-01", "end_date": "2023-12-31"}
    assert analysis["spatial_query"]["coordinates"] == [-39.5, -5.2]
    assert len(analysis["series"]) == 48
    assert all(math.isfinite(p["value"]) and p["value"] != -999 for p in analysis["series"])
    assert datetime.fromisoformat(analysis["retrieved_at"])
    # Imported with B's idempotent seed command. GET/export must not recalculate.
    assert json.loads(get(f"/api/v1/analyses/{ident}")) == analysis
    csv_bytes = get(f"/api/v1/analyses/{ident}/export")
    rows = list(csv.DictReader(io.StringIO(csv_bytes.decode("utf-8-sig"))))
    assert len(rows) == len(analysis["series"])
    assert [float(row["value"]) for row in rows] == [p["value"] for p in analysis["series"]]
    regions = json.loads(get("/api/v1/regions"))
    variables = json.loads(get("/api/v1/nasa/variables"))
    manifest = {
        "kind": "archived-nasa-observations",
        "packaged_at": datetime.now(timezone.utc).isoformat(),
        "backend_integration_sha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "backend_delivery_sha": "0d864a4389044ef354101baa6810512d17e1e950",
        "analysis_id": ident,
        "analysis_path": "/snapshots/nasa-power-ceara-2020-2023.json",
        "csv_path": "/snapshots/nasa-power-ceara-2020-2023.csv",
        "artifact_sha256": hashlib.sha256(raw_bytes).hexdigest(),
        "csv_sha256": hashlib.sha256(csv_bytes).hexdigest(),
        "region": next(r for r in regions if r["id"] == analysis["region_id"]),
        "variable": next(v for v in variables if v["id"] == analysis["variable_id"]),
        "notice": "Archived real NASA observations. Fixed inputs; no live environmental queries.",
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "nasa-power-ceara-2020-2023.json").write_bytes(raw_bytes)
    (OUT / "nasa-power-ceara-2020-2023.csv").write_bytes(csv_bytes)
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"analysis_id": ident, "months": len(rows), "json_sha256": manifest["artifact_sha256"],
                      "csv_sha256": manifest["csv_sha256"], "snapshot_matches_saved_analysis": True}, indent=2))


if __name__ == "__main__":
    main()
