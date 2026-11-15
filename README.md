# Earth Detective

Investigate monthly environmental observations at a selected point, inspect change over time, and reopen or export a saved analysis with its source and method identity.

## Delivery status — 15 November 2026

Front A is being prepared on `delivery/adson-20261115`, from agreed base `09b49c31242f2c8c6cb732cb58cf05ff564749d4`. [Delivery tracking](docs/FINALIZACAO.md) distinguishes local tests, real queries, pending backend delivery and official submission. No public deployment or submitted project is claimed here.

The baseline NASA POWER temperature case returned 48 real monthly observations on 15 November: one cell near longitude −39.5, latitude −5.2, January 2020–December 2023. This short point record is not a state average or evidence of long-term climate change. The baseline method has not been accepted as validated scientific inference. [Recorded query evidence](docs/entrega/A/nasa-real-baseline-summary.json) identifies its method and acquisition time.

## Main journey

1. Open the app and choose **Use NASA POWER case · 2020–2023**. This selects inputs; it does not invent or preload a conclusion.
2. Choose **Run analysis**. Inspect observations, requested/effective periods, point, data coverage, method and source.
3. Read the inference status and restriction reason. `descriptive` is a descriptive estimate, `insufficient_data`/`unsupported` show no inapplicable magnitude, and `validated` reflects the service's declared method status rather than external scientific certification. Saved responses missing V1 status/reason display a legacy warning and no significance seal or inferential interval. Missing values remain missing.
4. Change a filter to mark the existing result out of date. **Results → Saved analyses** reopens an ID; retry repeats that GET. **Download CSV** exports the saved ID without recalculating.

The main journey excludes the former projection. The response adapter still preserves saved forecast metadata for compatibility; it is not presented as a validated prediction. Regional labels locate a point; they do not imply spatial averaging.

## Reproduce locally

Tested: Python 3.12.10, Node 24.18.0, npm 11.16.0. System Python 3.14 was not used for the pinned backend dependencies. Use an isolated environment; do not reuse private databases or commit environment files.

```powershell
python3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
cd frontend
npm ci
npm test
npm run lint
npm run build
cd ..
$env:PYTHONPATH = 'backend'
$env:ANALYSIS_DB_PATH = Join-Path (Get-Location) 'local-analyses.sqlite3'
.\.venv\Scripts\python.exe -m uvicorn serve:app --host 127.0.0.1 --port 8000 --no-server-header
```

If `python3.12` is not an installed command, use the absolute path to Python 3.12 or `py -3.12`. On POSIX, activate `.venv/bin/activate`, then run `PYTHONPATH=backend ANALYSIS_DB_PATH=/persistent/path/analyses.sqlite3 uvicorn serve:app --host 127.0.0.1 --port 8000`. `serve.py` requires the frontend build and serves UI/API on one origin. Health: `/health`; API prefix: `/api/v1`.

For frontend development, run the existing backend at `127.0.0.1:8000`, then `npm run dev` in `frontend/`; Vite proxies `/api`. Keep the development server private.

## Tests and evidence

```powershell
$env:PYTHONPATH = 'backend'
.\.venv\Scripts\python.exe -m pytest tests -q
cd frontend
npm ci
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

On a machine with Edge, `$env:PLAYWRIGHT_CHANNEL = 'msedge'` uses the installed browser. E2E intercepts API responses with **TEST FIXTURE — not real data**. These deterministic tests do not validate NASA access or public persistence. The optional `node tests/e2e/live-baseline.mjs` explicitly queries a running local server at port 8910; it is separate from CI. [Evidence](docs/entrega/A/) records the actual revision and scope. The Quality workflow runs backend tests, frontend tests/lint/build and deterministic browser tests; a local pass does not mean hosted CI passed.

## Sources and access

NASA POWER provides public monthly temperature derived from MERRA-2. The other NASA archive entries (IMERG, MERRA-2 archive and GLDAS) require successful Earthdata/GES DISC authorization. Meteomatics requires account entitlements for its configured products. Environment variable names are `EARTHDATA_TOKEN`, `METEOMATICS_USERNAME`, `METEOMATICS_PASSWORD`, optional `METEOMATICS_MODEL`, and `ANALYSIS_DB_PATH`; keep their values server-side. A configured catalog entry or present token does not prove a successful query. The UI displays API availability and error reasons.

The challenge Resources list was inspected. POWER is not directly named there; resource-list compliance remains pending documented evidence or organizer clarification. Do not infer eligibility from the NASA name alone. [Portal verification](docs/entrega/A/ED01-portal.md).

## Operation, credits and limitations

Use a persistent volume for SQLite, a single application instance and HTTPS on a publicly authorized host. [Operation and publication](docs/frente-a/PUBLICACAO.md) records the prepared container route, recovery steps and unverified items. Vercel's existing frontend config alone does not host the Python API or preserve SQLite history.

[Credits and AI disclosure](docs/frente-a/CREDITOS-E-IA.md) records observed assets and dependencies. The project owner must confirm the project license and full authorship disclosures. [Earlier timeline](docs/CRONOGRAMA_DO_PROJETO_PT_BR.md) is historical. Backend/scientific acceptance awaits the identified delivery from Front B; no p-value alone establishes environmental inference validity.
