# Deterministic browser journey

These tests run the real React interface in a real browser. Every API response and
the map geometry are **TEST FIXTURES — not real data**. They do not prove NASA
availability, public deployment, scientific validity, or persistent storage.

From `frontend/` with Node 20 or newer:

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:e2e
```

On this Windows machine the existing Edge installation was used instead of
downloading a browser:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

The runner owns a temporary Vite server on `127.0.0.1:4179` and stops it after
execution. It refuses to reuse a server already occupying that port. Projects
cover desktop 1440×960 and mobile 390×844 with one worker and no retries.

Coverage: keyboard opening/closing of the period control and returned focus;
query request coordinates/dates; descriptive state and restriction reason;
requested/effective periods and point scope; saved GET failure/retry without a
POST; export by saved ID; stale result after a filter change; document horizontal
overflow. This is not a complete accessibility audit.

Logs, screenshots, downloaded fixture CSVs, JSON/HTML reports and traces are in
`docs/entrega/A/e2e-*`. Traces record local test activity only.

To prove detection, set `E2E_CONTROLLED_DEFECT=1` and run the desktop query test.
This changes only the served test fixture to an inconsistent inference state and
must fail at the descriptive badge assertion. Unset it for ordinary execution.

Implementation references: [web server](https://playwright.dev/docs/test-webserver),
[network interception](https://playwright.dev/docs/network), and
[downloads](https://playwright.dev/docs/downloads).
