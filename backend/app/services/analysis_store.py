from __future__ import annotations

import os
import sqlite3
from contextlib import closing
from pathlib import Path

from pydantic import TypeAdapter

from app.schemas import AnalysisResponse, NasaAnalysisResponse, SavedAnalysisSummary

_DEFAULT_PATH = Path(__file__).resolve().parents[3] / "data" / "earth_detective.sqlite3"
_ANALYSIS_TYPE = TypeAdapter(NasaAnalysisResponse | AnalysisResponse)


def _connect() -> sqlite3.Connection:
    path = Path(os.environ.get("ANALYSIS_DB_PATH") or _DEFAULT_PATH).expanduser()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise sqlite3.OperationalError("Could not create the analysis database directory") from exc
    connection = sqlite3.connect(path, timeout=10)
    try:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS analyses (
                analysis_id TEXT PRIMARY KEY,
                variable_id TEXT NOT NULL,
                region_id TEXT NOT NULL,
                product TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                retrieved_at TEXT NOT NULL,
                payload TEXT NOT NULL
            )
        """)
        connection.execute("""
            CREATE INDEX IF NOT EXISTS analyses_by_retrieval
            ON analyses (retrieved_at DESC, analysis_id DESC)
        """)
    except sqlite3.Error:
        connection.close()
        raise
    return connection


def save(analysis: AnalysisResponse) -> None:
    with closing(_connect()) as connection, connection:
        connection.execute(
            """
            INSERT INTO analyses (
                analysis_id, variable_id, region_id, product, start_date, end_date, retrieved_at, payload
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (analysis_id) DO NOTHING
            """,
            (
                analysis.analysis_id, analysis.variable_id, analysis.region_id, analysis.product,
                analysis.requested_period["start_date"], analysis.requested_period["end_date"],
                analysis.retrieved_at, analysis.model_dump_json(),
            ),
        )


def get(analysis_id: str) -> NasaAnalysisResponse | AnalysisResponse | None:
    with closing(_connect()) as connection:
        row = connection.execute(
            "SELECT payload FROM analyses WHERE analysis_id = ?", (analysis_id,),
        ).fetchone()
    return _ANALYSIS_TYPE.validate_json(row[0]) if row is not None else None


def recent(limit: int, offset: int) -> list[SavedAnalysisSummary]:
    with closing(_connect()) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            SELECT analysis_id, variable_id, region_id, product, start_date, end_date, retrieved_at
            FROM analyses ORDER BY retrieved_at DESC, analysis_id DESC LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()
    return [SavedAnalysisSummary.model_validate(dict(row)) for row in rows]
