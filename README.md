# Earth Detective

Earth Detective is an MVP for exploring environmental change using Earth observation data, time-series analysis, and accessible explanations for non-specialist users.

## Goals

- Let users select an environmental variable, region, and period.
- Visualize monthly time series with provenance and quality indicators.
- Compute an estimated trend and rate per decade.
- Explain statistical evidence in clear English.
- Export an analysis as CSV.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Python + FastAPI
- Science: NumPy + SciPy + pandas
- Data: curated demo datasets and manifests
- Testing: pytest + Vitest/Playwright-ready structure

## Repository layout

- `backend/` — FastAPI application and scientific module
- `frontend/` — React interface
- `data/` — catalog files and generated demo data
- `pipelines/` — reproducible dataset-generation scripts
- `contracts/` — API contract artifacts and schema files
- `tests/` — backend and integration tests
- `docs/` — supporting project documentation

## Quick start

### Backend

```bash
cd backend
python -m venv .venv
. .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Current status

This repository currently includes a documentation foundation and a runnable MVP scaffold for the API, science logic, and front-end shell based on the design documents. Real data integration is intentionally represented by a clearly labeled synthetic demo dataset until a validated source is selected.

## Notes

The project follows the English-language internationalization requirement and keeps the core product centered on evidence-based environmental analysis rather than unsupported claims.
