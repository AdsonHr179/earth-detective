# Earth Detective

Earth Detective is an MVP for exploring environmental change using Earth observation data, time-series analysis, and accessible explanations for non-specialist users.

## Goals

- Let users select an environmental variable, region, map position, and period.
- Visualize monthly time series with provenance and quality indicators.
- Compute an estimated trend and rate per decade.
- Explain statistical evidence in clear English.
- Export an analysis as CSV.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Python + FastAPI
- Meteomatics Python connector for a server-side API connectivity check
- Science: NumPy + SciPy + pandas
- Data: Meteomatics Weather API, queried server-side
- Testing: pytest + Vitest/Playwright-ready structure

## Repository layout

- `backend/` — FastAPI application and scientific module
- `frontend/` — React interface
- `data/` — catalog files
- `pipelines/` — reproducible dataset-generation scripts
- `contracts/` — API contract artifacts and schema files
- `tests/` — backend and integration tests
- `docs/` — supporting project documentation

Project timeline and outstanding MVP work (Portuguese): [docs/CRONOGRAMA_DO_PROJETO_PT_BR.md](docs/CRONOGRAMA_DO_PROJETO_PT_BR.md).

## Quick start

### Backend

```bash
cd backend
python -m venv .venv
. .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The backend uses Meteomatics for analyses and requires server-side credentials.
It does not generate synthetic analysis values or fall back to mock data.

### Meteomatics connectivity check

The optional script `pipelines/check_meteomatics.py` runs the Meteomatics
three-day hourly example for the provider's St. Gallen coordinates. It reads
credentials from the process environment or the ignored root `.env.local` file;
never put them in source files or commit them.

After filling `.env.local` with a newly issued credential, run this from the
repository root in PowerShell:

```powershell
.\backend\.venv\Scripts\python.exe .\pipelines\check_meteomatics.py
```

This is only a connectivity check; its sample point and forecast window do not
validate regional data coverage or a historical product suitable for trend
analysis.

### Run analyses against Meteomatics

The root `.env.local` file is ignored by Git and contains the local settings for
the Meteomatics source. Fill in `METEOMATICS_USERNAME` and
`METEOMATICS_PASSWORD` once with a newly issued credential. This file stores
the password as plain text, so keep the machine account protected and do not
sync or share the file.

```powershell
.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --env-file .env.local --reload
```

The backend catalog configures 21 time-series variables across atmosphere,
soil, radiation, and water balance. Hourly values are aggregated to monthly
means or totals as appropriate; wind direction uses a circular mean and does
not receive a linear trend. Click the map to select the query point; otherwise,
the selected region's approximate center is used. Results are point queries,
not regional spatial averages; months with insufficient coverage are null.
Static soil properties are not part of this time-series catalog. Configuring a
parameter does not confirm account entitlement, historical coverage, licensing,
or trend methodology.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Current status

The backend queries Meteomatics for its configured environmental variables and
does not include synthetic analysis data. Users can select a point on the map;
otherwise, analyses use the selected region's approximate center. Product
history, account access, licensing, regional representativeness, and statistical
methodology still require validation. Only a successful live query confirms
that a configured variable is accessible for the selected period.

## Notes

The project follows the English-language internationalization requirement and keeps the core product centered on evidence-based environmental analysis rather than unsupported claims.
