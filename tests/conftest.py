import pytest


@pytest.fixture(autouse=True)
def isolate_analysis_database(monkeypatch, tmp_path):
    monkeypatch.setenv("ANALYSIS_DB_PATH", str(tmp_path / "analysis.sqlite3"))
