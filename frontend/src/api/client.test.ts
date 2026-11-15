import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { adaptBackendAnalysis, fetchAvailability, requestAnalysis } from './client';
import { ApiError } from './errors';
import { server } from '../test/server';
import { deferred } from '../test/handlers';
import { fixtureBackendAnalysis } from '../test/fixtures';

describe('adaptBackendAnalysis', () => {
  it('preserves null observations: absence never becomes 0', () => {
    const result = adaptBackendAnalysis(fixtureBackendAnalysis({ values: [1, null, 3, null] }));

    expect(result.chart_points.map((point) => point.value)).toEqual([1, null, 3, null]);
    expect(result.chart_points.some((point) => point.value === 0)).toBe(false);
    expect(result.valid_observations).toBe(2);
    expect(result.quality.missing_values).toBe(2);
  });

  it('keeps an all-null series all null', () => {
    const result = adaptBackendAnalysis(fixtureBackendAnalysis({ values: [null, null] }));

    expect(result.chart_points.every((point) => point.value === null)).toBe(true);
    expect(result.valid_observations).toBe(0);
  });
});

describe('requestAnalysis cancellation', () => {
  it('honors an AbortSignal and works without one', async () => {
    const gate = deferred();
    server.use(
      http.post('*/api/v1/analyses', async () => {
        await gate.promise;
        return HttpResponse.json(fixtureBackendAnalysis());
      }),
    );
    const payload = {
      variable_id: 'air_temperature',
      region_id: 'ceara',
      start_date: '2015-01-01',
      end_date: '2023-12-31',
    };

    const controller = new AbortController();
    const pending = requestAnalysis(payload, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    gate.release();
    await expect(requestAnalysis(payload)).resolves.toMatchObject({ variable_id: 'air_temperature' });
  });
});

describe('adaptBackendAnalysis provenance', () => {
  it('exposes source, product, source url, retrieval time, effective dates and the limitations text', () => {
    const result = adaptBackendAnalysis(
      fixtureBackendAnalysis({ retrieved_at: '2000-01-02T03:04:05+00:00' }),
    );

    expect(result.source).toBe('TEST FIXTURE');
    expect(result.product).toBe('fixture-product');
    expect(result.source_url).toBe('https://example.invalid/fixture');
    expect(result.retrieved_at).toBe('2000-01-02T03:04:05+00:00');
    expect(result.effective_start_date).toBe('2015-01-01');
    expect(result.effective_end_date).toBe('2015-03-01');
    expect(result.limitations).toBe('Fixture limitations.');
  });

  it('keeps retrieved_at null when the backend did not send it, instead of inventing one', () => {
    expect(adaptBackendAnalysis(fixtureBackendAnalysis()).retrieved_at).toBeNull();
  });
});

describe('HTTP errors', () => {
  const payload = {
    variable_id: 'air_temperature',
    region_id: 'ceara',
    start_date: '2015-01-01',
    end_date: '2023-12-31',
  };

  it('carries the status and the plain detail', async () => {
    server.use(
      http.post('*/api/v1/analyses', () => HttpResponse.json({ detail: 'not configured' }, { status: 503 })),
    );
    const error = await requestAnalysis(payload).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, detail: 'not configured', message: 'not configured' });
  });

  it('reduces a validation list to text and keeps the status', async () => {
    server.use(
      http.post('*/api/v1/analyses', () =>
        HttpResponse.json({ detail: [{ msg: 'first problem' }, { msg: 'second problem' }] }, { status: 422 }),
      ),
    );
    const error = await requestAnalysis(payload).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 422, detail: 'first problem; second problem' });
  });

  it('survives a non-JSON error body', async () => {
    server.use(http.get('*/api/v1/availability', () => new HttpResponse('Bad gateway', { status: 502 })));
    const error = await fetchAvailability('air_temperature', 'ceara').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, detail: '' });
  });
});
