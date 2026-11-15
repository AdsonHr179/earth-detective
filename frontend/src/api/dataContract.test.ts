import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  adaptBackendAnalysis,
  exportAnalysisCsv,
  fetchSavedAnalyses,
  fetchSavedAnalysis,
  fetchVariables,
  requestAnalysis,
} from './client';
import { ApiError } from './errors';
import { server } from '../test/server';
import {
  fixtureBackendAnalysis,
  fixtureForecast,
  fixtureSaved,
  fixtureStatistics,
  fixtureVariables,
} from '../test/fixtures';

// Every value here is a TEST FIXTURE. These tests cover the contract added with the NASA data.

describe('adaptBackendAnalysis statistics and forecast', () => {
  it('carries statistics and forecast when the backend sends them', () => {
    const result = adaptBackendAnalysis(
      fixtureBackendAnalysis({ statistics: fixtureStatistics, forecast: fixtureForecast }),
    );

    expect(result.statistics).toEqual(fixtureStatistics);
    expect(result.forecast).toEqual(fixtureForecast);
  });

  it('keeps them null when absent, and keeps a null standard deviation null', () => {
    const without = adaptBackendAnalysis(fixtureBackendAnalysis());
    expect(without.statistics).toBeNull();
    expect(without.forecast).toBeNull();

    const single = adaptBackendAnalysis(
      fixtureBackendAnalysis({ statistics: { ...fixtureStatistics, standard_deviation: null } }),
    );
    expect(single.statistics?.standard_deviation).toBeNull();
  });
});

describe('fetchVariables catalog', () => {
  const nasa = [{ ...fixtureVariables[0], id: 'nasa_rain', name: 'Rain (TEST FIXTURE)' }];

  it('joins /variables and /nasa/variables', async () => {
    server.use(
      http.get('*/api/v1/variables', () => HttpResponse.json(fixtureVariables)),
      http.get('*/api/v1/nasa/variables', () => HttpResponse.json(nasa)),
    );
    const ids = (await fetchVariables()).map((item) => item.id);

    expect(ids).toEqual([...fixtureVariables.map((item) => item.id), 'nasa_rain']);
  });

  it('still returns the other route when one fails', async () => {
    server.use(
      http.get('*/api/v1/variables', () => HttpResponse.json({ detail: 'down' }, { status: 503 })),
      http.get('*/api/v1/nasa/variables', () => HttpResponse.json(nasa)),
    );
    expect((await fetchVariables()).map((item) => item.id)).toEqual(['nasa_rain']);

    server.use(
      http.get('*/api/v1/variables', () => HttpResponse.json(fixtureVariables)),
      http.get('*/api/v1/nasa/variables', () => new HttpResponse('boom', { status: 500 })),
    );
    expect((await fetchVariables()).length).toBe(fixtureVariables.length);
  });

  it('fails with the status when both routes fail, and does not repeat an id', async () => {
    server.use(
      http.get('*/api/v1/variables', () => HttpResponse.json({ detail: 'down' }, { status: 503 })),
      http.get('*/api/v1/nasa/variables', () => HttpResponse.json({ detail: 'down' }, { status: 503 })),
    );
    await expect(fetchVariables()).rejects.toMatchObject({ status: 503 });

    server.use(
      http.get('*/api/v1/variables', () => HttpResponse.json(fixtureVariables)),
      http.get('*/api/v1/nasa/variables', () => HttpResponse.json(fixtureVariables)),
    );
    expect((await fetchVariables()).length).toBe(fixtureVariables.length);
  });
});

describe('saved analyses', () => {
  it('lists saved results and opens one by id through the adapter', async () => {
    server.use(
      http.get('*/api/v1/analyses', () => HttpResponse.json(fixtureSaved)),
      http.get('*/api/v1/analyses/:id', ({ params }) =>
        HttpResponse.json(fixtureBackendAnalysis({ analysis_id: String(params.id), statistics: fixtureStatistics })),
      ),
    );

    expect(await fetchSavedAnalyses()).toEqual(fixtureSaved);
    const opened = await fetchSavedAnalysis('saved-1');
    expect(opened.analysis_id).toBe('saved-1');
    expect(opened.statistics).toEqual(fixtureStatistics);
    expect(opened.chart_points).toHaveLength(3);
  });

  it('reports a missing saved result with its status and code', async () => {
    server.use(
      http.get('*/api/v1/analyses/:id', () =>
        HttpResponse.json(
          { detail: 'x', error: { code: 'not_found', message: 'Saved analysis not found' } },
          { status: 404 },
        ),
      ),
    );
    await expect(fetchSavedAnalysis('nope')).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });
});

describe('exportAnalysisCsv', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('downloads GET /analyses/{id}/export (no request body, id encoded)', async () => {
    const seen: Array<{ method: string; path: string }> = [];
    server.use(
      http.all('*/api/v1/analyses/:id/export', ({ request }) => {
        seen.push({ method: request.method, path: new URL(request.url).pathname });
        return new HttpResponse('a,b\n1,2\n', { headers: { 'Content-Type': 'text/csv' } });
      }),
    );
    const create = vi.fn(() => 'blob:fixture');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await exportAnalysisCsv(adaptBackendAnalysis(fixtureBackendAnalysis({ analysis_id: 'id with space' })));

    expect(seen).toEqual([{ method: 'GET', path: '/api/v1/analyses/id%20with%20space/export' }]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('throws the API error when the export fails', async () => {
    server.use(
      http.get('*/api/v1/analyses/:id/export', () =>
        HttpResponse.json(
          { detail: 'gone', error: { code: 'not_found', message: 'Analysis expired' } },
          { status: 404 },
        ),
      ),
    );
    await expect(exportAnalysisCsv(adaptBackendAnalysis(fixtureBackendAnalysis()))).rejects.toMatchObject({
      status: 404,
      detail: 'Analysis expired',
    });
  });
});

describe('structured error format', () => {
  const payload = {
    variable_id: 'air_temperature',
    region_id: 'ceara',
    start_date: '2015-01-01',
    end_date: '2023-12-31',
  };

  it('prefers error.message and keeps error.code', async () => {
    server.use(
      http.post('*/api/v1/analyses', () =>
        HttpResponse.json(
          { detail: 'older text', error: { code: 'service_unavailable', message: 'Busy, try again' } },
          { status: 503, headers: { 'Retry-After': '1' } },
        ),
      ),
    );
    const error = await requestAnalysis(payload).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, code: 'service_unavailable', detail: 'Busy, try again' });
  });

  it('handles 413 and falls back to detail when error is missing or malformed', async () => {
    server.use(
      http.post('*/api/v1/analyses', () =>
        HttpResponse.json(
          {
            detail: 'Request body is too large',
            error: { code: 'request_too_large', message: 'Request body is too large' },
          },
          { status: 413 },
        ),
      ),
    );
    expect(await requestAnalysis(payload).catch((e: unknown) => e)).toMatchObject({
      status: 413,
      code: 'request_too_large',
    });

    server.use(
      http.post('*/api/v1/analyses', () => HttpResponse.json({ detail: 'plain', error: 'oops' }, { status: 409 })),
    );
    const fallback = await requestAnalysis(payload).catch((e: unknown) => e);
    expect(fallback).toMatchObject({ status: 409, detail: 'plain' });
    expect((fallback as ApiError).code).toBeUndefined();
  });
});
