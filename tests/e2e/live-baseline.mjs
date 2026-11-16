// Explicit opt-in LIVE baseline check. No fixture is substituted for NASA observations.
// Run from repo root: node tests/e2e/live-baseline.mjs
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const base = process.env.LIVE_BASE_URL || 'http://127.0.0.1:8910';
const expectedInference = process.env.LIVE_EXPECTED_INFERENCE || 'legacy';
const prefix = expectedInference === 'legacy' ? 'live' : 'integrated';
const out = new URL('../../docs/entrega/A/', import.meta.url);
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const result = { scope: 'LIVE NASA local query; not public deployment or external scientific certification',
  candidate_sha: process.env.LIVE_CANDIDATE_SHA || 'not supplied',
  observed_at: new Date().toISOString(), base, checks: [], browser: browser.version() };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.getByRole('button', { name: 'Use NASA POWER case · 2020–2023', exact: true }).click();
  const run = page.getByRole('button', { name: 'Run analysis', exact: true });
  await expect(run).toBeEnabled();
  const responsePromise = page.waitForResponse(r => r.url() === `${base}/api/v1/analyses` && r.request().method() === 'POST', { timeout: 120_000 });
  await run.click();
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  const body = await response.json();
  assert.match(body.source, /NASA POWER/);
  assert.equal(body.series.length, 48);
  const assertInference = async () => {
    if (expectedInference === 'legacy') {
      await expect(page.getByRole('heading', { name: 'Legacy inference not validated', exact: true })).toBeVisible();
    } else {
      assert.equal(body.trend.inference_status, expectedInference);
      assert.equal(body.method_version, 'nasa-monthly-v2');
      assert.equal(body.trend.p_value, null);
      assert.equal(body.trend.significant, null);
      assert.equal(body.trend.confidence_interval, null);
      await expect(page.getByText('Descriptive estimate only', { exact: true })).toBeVisible();
    }
  };
  await assertInference();
  await writeFile(new URL(`${prefix}-nasa-real.json`, out), JSON.stringify(body, null, 2));
  assert.equal(await page.locator('.chart-forecast').count(), 0);
  assert.equal(await page.getByText(/^Significant \(p/).count(), 0);
  result.analysis_id = body.analysis_id;
  result.method_version = body.method_version;
  result.checks.push(`Live POST returned 48 monthly observations; ${expectedInference} inference shown; no significance seal or projection`);
  await page.screenshot({ path: fileURLToPath(new URL(`${prefix}-nasa-desktop.png`, out)), fullPage: true });
  await page.getByText('Method and sources', { exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Result', exact: true }).getByText('5.20° S, 39.50° W', { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  const download = await downloadPromise;
  const csvPath = fileURLToPath(new URL(`${prefix}-nasa-browser.csv`, out));
  await download.saveAs(csvPath);
  const apiCsv = await (await fetch(`${base}/api/v1/analyses/${body.analysis_id}/export`)).text();
  assert.equal(await readFile(csvPath, 'utf8'), apiCsv);
  result.checks.push('Browser CSV equals saved export endpoint byte-for-byte');
  await page.setViewportSize({ width: 390, height: 844 });
  await assertInference();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: fileURLToPath(new URL(`${prefix}-nasa-mobile.png`, out)), fullPage: true });
  result.checks.push('390px renders with no document horizontal overflow');
  await page.reload();
  await page.getByRole('button', { name: /^Results:/ }).click();
  await page.getByRole('dialog', { name: 'Results', exact: true }).locator('.saved-item').filter({ hasText: 'NASA POWER' }).first().click();
  await assertInference();
  result.checks.push('Saved NASA result reopens after reload without recalculation');
  assert.deepEqual(errors, []);
  result.checks.push('No browser page errors');
  result.passed = true;
} catch (error) {
  result.passed = false;
  result.error = error.message;
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(new URL(`${prefix}-browser-summary.json`, out), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
