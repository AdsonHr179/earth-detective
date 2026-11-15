// Real archived observations, no API interception or synthetic data.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const base = process.env.SNAPSHOT_BASE_URL || 'http://127.0.0.1:4175';
const out = new URL('../../docs/entrega/A/', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = await (await fetch(`${base}/snapshots/manifest.json`)).json();
const jsonBytes = Buffer.from(await (await fetch(base + manifest.analysis_path)).arrayBuffer());
assert.equal(hash(jsonBytes), manifest.artifact_sha256);
const analysis = JSON.parse(jsonBytes);
assert.equal(analysis.analysis_id, manifest.analysis_id);
assert.equal(analysis.trend.inference_status, 'descriptive');
assert.equal(analysis.series.length, 48);
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const result = { scope: 'REAL archived NASA snapshot; no live query capability', base,
  candidate_sha: process.env.SNAPSHOT_CANDIDATE_SHA || 'not supplied', analysis_id: manifest.analysis_id,
  retrieved_at: analysis.retrieved_at, checks: [], browser: browser.version() };
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 960 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport, acceptDownloads: true });
    const forbidden = [], errors = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if ((url.origin === new URL(base).origin && url.pathname.startsWith('/api/')) || url.hostname.endsWith('power.larc.nasa.gov')) forbidden.push(request.url());
    });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await expect(page.getByRole('heading', { name: 'Archived NASA snapshot', exact: true })).toBeVisible();
    await expect(page.getByText('Descriptive estimate only', { exact: true })).toBeVisible();
    await expect(page.getByText('No live NASA queries', { exact: true })).toBeVisible();
    assert.equal(await page.getByRole('button', { name: 'Run analysis', exact: true }).count(), 0);
    assert.equal(await page.locator('.chart-forecast').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
    const download = await downloadPromise;
    const path = fileURLToPath(new URL(`snapshot-${name}.csv`, out));
    await download.saveAs(path);
    assert.equal(hash(await readFile(path)), manifest.csv_sha256);
    await page.screenshot({ path: fileURLToPath(new URL(`snapshot-${name}-details.png`, out)), fullPage: true });
    await page.getByRole('heading', { name: 'Archived NASA snapshot', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: fileURLToPath(new URL(`snapshot-${name}.png`, out)), fullPage: true });
    await page.reload();
    await expect(page.getByText('Descriptive estimate only', { exact: true })).toBeVisible();
    assert.deepEqual(forbidden, []);
    assert.deepEqual(errors, []);
    result.checks.push(`${name}: archived label, fixed inputs, no API/NASA queries, matching CSV, no overflow, reload and zero page errors`);
    await page.close();
  }
  result.passed = true;
} catch (error) {
  result.passed = false;
  result.error = error.message;
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(new URL('snapshot-browser-summary.json', out), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
