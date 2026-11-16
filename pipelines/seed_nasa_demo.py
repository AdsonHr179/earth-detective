"""Import the two bundled, publicly acquired NASA analyses into a named SQLite database."""
import argparse
import os
from pathlib import Path

from app.schemas import NasaAnalysisResponse
from app.services import analysis_store

SNAPSHOT_DIR = Path(__file__).resolve().parents[1] / "data" / "demo" / "nasa-power"
SNAPSHOTS = ("ceara-2020-2023.analysis.json", "ceara-2021-2023.analysis.json")


def load_demo() -> list[NasaAnalysisResponse]:
    analyses = [
        NasaAnalysisResponse.model_validate_json((SNAPSHOT_DIR / filename).read_bytes())
        for filename in SNAPSHOTS
    ]
    for analysis in analyses:
        existing = analysis_store.get(analysis.analysis_id)
        if existing is not None and existing != analysis:
            raise ValueError(f"Database already holds different data for {analysis.analysis_id}")
        analysis_store.save(analysis)
        if analysis_store.get(analysis.analysis_id) != analysis:
            raise ValueError(f"Stored result differs from snapshot {analysis.analysis_id}")
    return analyses


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True, help="SQLite file used by ANALYSIS_DB_PATH")
    args = parser.parse_args()
    os.environ["ANALYSIS_DB_PATH"] = str(args.database.resolve())
    for result in load_demo():
        print(f"{result.analysis_id}  GET /api/v1/analyses/{result.analysis_id}  {result.retrieved_at}")
