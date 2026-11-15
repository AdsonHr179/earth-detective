import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { adaptBackendAnalysis, requestAnalysis } from './client';
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
