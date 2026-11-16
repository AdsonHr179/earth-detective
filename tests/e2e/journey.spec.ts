import process from 'node:process';
import { expect, test, type Page } from '../../frontend/node_modules/@playwright/test/index';
import {
  fixtureAvailability,
  fixtureBackendAnalysis,
  fixtureRegions,
  fixtureVariables,
} from '../../frontend/src/test/fixtures';

// TEST FIXTURE ONLY — network responses below are not NASA observations or public API proof.
const notice = 'TEST FIXTURE — not real data';
const period = { start_date: '2020-01-01', end_date: '2023-12-31' };
const fixture = fixtureBackendAnalysis({
  analysis_id: 'e2e-saved-fixture',
  requested_period: period,
  effective_period: period,
  spatial_query: { type: 'Point', coordinates: [-39.5, -5.2] },
  retrieved_at: '2000-01-02T03:04:05Z',
  series: Array.from({ length: 48 }, (_, i) => ({
    timestamp: `${2020 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}-01`,
    value: 20 + i / 100,
    unit: 'fixture-unit',
    quality_flags: notice,
  })),
  trend: {
    ...fixtureBackendAnalysis().trend,
    inference_status: 'descriptive',
    inference_reason: `${notice}. Seasonality and serial dependence are not validated.`,
    slope_per_decade: 0.5,
    slope_unit: 'fixture-unit per decade',
    significant: null,
    p_value: null,
    confidence_interval: null,
  },
  quality: { sample_count: 48, expected_count: 48, coverage_fraction: 1, warnings: [notice] },
  explanation: { summary: notice, limitations: 'One fixture cell only; no regional inference.' },
});

// Opt-in controlled defect, restricted to this test fixture, proves the journey detects an invalid state.
const servedFixture = process.env.E2E_CONTROLLED_DEFECT === '1'
  ? { ...fixture, trend: { ...fixture.trend, inference_status: 'validated' as const } }
  : fixture;

async function interceptFixtureApi(page: Page, options: { failSavedOnce?: boolean } = {}) {
  const calls = { posts: 0, savedIds: [] as string[], exportIds: [] as string[] };
  await page.route('https://servicodados.ibge.gov.br/**', (route) => route.fulfill({
    json: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: notice },
      geometry: { type: 'Polygon', coordinates: [[[-41, -7], [-38, -7], [-38, -3], [-41, -3], [-41, -7]]] } }] },
  }));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/api/v1/variables') return route.fulfill({ json: fixtureVariables });
    if (path === '/api/v1/nasa/variables') return route.fulfill({ json: [] });
    if (path === '/api/v1/regions') return route.fulfill({ json: fixtureRegions.map((region) => ({
      ...region, center: { longitude: -39.5, latitude: -5.2 },
    })) });
    if (path === '/api/v1/availability') return route.fulfill({ json: fixtureAvailability(
      url.searchParams.get('variable_id')!, url.searchParams.get('region_id')!,
    ) });
    if (path === '/api/v1/analyses' && request.method() === 'POST') {
      calls.posts += 1;
      expect(request.postDataJSON()).toMatchObject({
        variable_id: 'air_temperature', region_id: 'ceara', ...period,
        spatial_query: { type: 'Point', coordinates: [-39.5, -5.2] },
      });
      return route.fulfill({ json: servedFixture });
    }
    if (path === '/api/v1/analyses') return route.fulfill({ json: [{
      analysis_id: fixture.analysis_id, variable_id: fixture.variable_id,
      region_id: fixture.region_id, product: fixture.product, ...period,
      retrieved_at: fixture.retrieved_at,
    }] });
    if (path === `/api/v1/analyses/${fixture.analysis_id}/export`) {
      calls.exportIds.push(fixture.analysis_id);
      return route.fulfill({ contentType: 'text/csv', body: `${notice}\ntimestamp,value\n2020-01-01,20\n` });
    }
    if (path === `/api/v1/analyses/${fixture.analysis_id}`) {
      calls.savedIds.push(fixture.analysis_id);
      if (options.failSavedOnce && calls.savedIds.length === 1) {
        return route.fulfill({ status: 503, json: { detail: `${notice}: temporary saved-analysis failure` } });
      }
      return route.fulfill({ json: servedFixture });
    }
    throw new Error(`Unexpected fixture API request: ${request.method()} ${path}`);
  });
  return calls;
}

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Run analysis', exact: true })).toBeEnabled();
}

async function setPeriodWithKeyboard(page: Page) {
  const chip = page.getByRole('button', { name: /^Period:/ });
  await chip.focus();
  await chip.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Period', exact: true })).toBeVisible();
  await page.getByLabel('Start date', { exact: true }).fill(period.start_date);
  await page.getByLabel('End date', { exact: true }).fill(period.end_date);
  await page.getByLabel('End date', { exact: true }).press('Escape');
  await expect(chip).toBeFocused();
}

test('TEST FIXTURE: query, interpret, export and mark changed filters stale', async ({ page }, testInfo) => {
  const calls = await interceptFixtureApi(page);
  await ready(page);
  await setPeriodWithKeyboard(page);
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Air temperature (TEST FIXTURE) at the selected point' })).toBeVisible();
  await expect(page.getByText('Descriptive estimate only', { exact: true })).toBeVisible();
  await expect(page.getByText(/Statistical inference has not been validated/)).toBeVisible();
  await expect(page.getByText(/Significant \(p/)).toHaveCount(0);
  await expect(page.getByText('One point, not an area average', { exact: true })).toBeVisible();
  await page.screenshot({ path: `../docs/entrega/A/e2e-${testInfo.project.name}-fixture.png`, fullPage: true });
  await page.getByText('Method and sources', { exact: true }).click();
  await expect(page.getByText('2020-01-01 to 2023-12-31', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('complementary', { name: 'Result', exact: true }).getByText('5.20° S, 39.50° W', { exact: true })).toBeVisible();
  await page.screenshot({ path: `../docs/entrega/A/e2e-${testInfo.project.name}-fixture-method.png`, fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(`../docs/entrega/A/e2e-${testInfo.project.name}-fixture.csv`);
  expect(calls.posts).toBe(1);
  expect(calls.exportIds).toEqual([fixture.analysis_id]);
  const chip = page.getByRole('button', { name: /^Period:/ });
  await chip.click();
  await page.getByLabel('End date', { exact: true }).fill('2022-12-31');
  await page.getByLabel('End date', { exact: true }).press('Escape');
  await expect(page.getByRole('heading', { name: 'Out of date', exact: true })).toBeVisible();
  expect(calls.posts).toBe(1);
  const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noHorizontalOverflow).toBe(true);
  await testInfo.attach('fixture-environment', { body: `${notice}\nBrowser: ${page.context().browser()?.version()}`, contentType: 'text/plain' });
});

test('TEST FIXTURE: failed saved GET retries same ID without POST', async ({ page }, testInfo) => {
  const calls = await interceptFixtureApi(page, { failSavedOnce: true });
  await ready(page);
  await page.getByRole('button', { name: /Saved analyses/ }).click();
  await page.getByRole('list', { name: 'Saved analyses', exact: true }).getByRole('button').click();
  await expect(page.getByRole('alert')).toContainText('temporary saved-analysis failure');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Air temperature (TEST FIXTURE) at the selected point' })).toBeVisible();
  await expect(page.getByText('Descriptive estimate only', { exact: true })).toBeVisible();
  expect(calls.savedIds).toEqual([fixture.analysis_id, fixture.analysis_id]);
  expect(calls.posts).toBe(0);
  await testInfo.attach('fixture-network', { body: JSON.stringify({ notice, ...calls }, null, 2), contentType: 'application/json' });
});
