"""Operation entry point: serve the built UI and existing API on one origin.

Run from the repository root with PYTHONPATH=backend. Backend ownership stays B.
This wrapper does not change API routes, science, CORS or persistence semantics.
"""
from pathlib import Path

from fastapi.staticfiles import StaticFiles

from app.main import app

_dist = Path(__file__).resolve().parent / "frontend" / "dist"
if not (_dist / "index.html").is_file():
    raise RuntimeError("Build the frontend first: cd frontend && npm ci && npm run build")

# Register last so /api/v1 and /health retain their existing handlers.
app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")
