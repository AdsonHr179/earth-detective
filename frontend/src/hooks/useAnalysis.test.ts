import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/server';
import { deferred } from '../test/handlers';
import { fixtureAvailability, fixtureBackendAnalysis, fixtureRegions } from '../test/fixtures';
import { DEFAULT_FILTERS, useAnalysis } from './useAnalysis';

const availability = fixtureAvailability('air_temperature', 'ceara');

function setup() {
  return renderHook(() => useAnalysis({ regions: fixtureRegions, availability }));
}

function analysesHandler(respond: () => Response | Promise<Response>) {
  server.use(http.post('*/api/v1/analyses', () => respond()));
}

describe('useAnalysis', () => {
  it('goes idle -> loading -> success', async () => {
    const gate = deferred();
    analysesHandler(async () => {
      await gate.promise;
      return HttpResponse.json(fixtureBackendAnalysis());
    });
    const { result } = setup();
    expect(result.current.status).toBe('idle');

    act(() => result.current.run());
    expect(result.current.status).toBe('loading');
    expect(result.current.analysis).toBeNull();

    gate.release();
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.analysis?.variable_id).toBe('air_temperature');
  });

  it('reports no-data when every value is null (and keeps them null)', async () => {
    analysesHandler(() => HttpResponse.json(fixtureBackendAnalysis({ values: [null, null, null] })));
    const { result } = setup();

    act(() => result.current.run());
    await waitFor(() => expect(result.current.status).toBe('no-data'));
    expect(result.current.analysis?.chart_points.every((point) => point.value === null)).toBe(true);
  });

  it('shows the 503 detail and retry succeeds without losing the selection', async () => {
    let calls = 0;
    analysesHandler(() => {
      calls += 1;
      return calls === 1
        ? HttpResponse.json({ detail: 'Upstream provider unavailable' }, { status: 503 })
        : HttpResponse.json(fixtureBackendAnalysis({ variable_id: 'precipitation' }));
    });
    const { result } = setup();

    act(() => result.current.setVariable('precipitation'));
    act(() => result.current.setStartDate('2016-01-01'));
    act(() => result.current.run());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.message).toBe('Upstream provider unavailable');
    expect(result.current.canRetry).toBe(true);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(calls).toBe(2);
    expect(result.current.filters.variableId).toBe('precipitation');
    expect(result.current.filters.startDate).toBe('2016-01-01');
  });

  it('marks the result stale when any filter changes, keeping the result', async () => {
    analysesHandler(() => HttpResponse.json(fixtureBackendAnalysis()));
    const { result } = setup();
    act(() => result.current.run());
    await waitFor(() => expect(result.current.status).toBe('success'));
    const analysis = result.current.analysis;

    act(() => result.current.setVariable('precipitation'));
    expect(result.current.status).toBe('stale');
    expect(result.current.analysis).toBe(analysis);

    // Going back to the filters the result was requested with makes it current again.
    act(() => result.current.setVariable('air_temperature'));
    expect(result.current.status).toBe('success');

    act(() => result.current.setEndDate('2022-12-31'));
    expect(result.current.status).toBe('stale');
    act(() => result.current.setEndDate('2023-12-31'));
    expect(result.current.status).toBe('success');

    act(() => result.current.setRegion('northeast_brazil'));
    expect(result.current.status).toBe('stale');
    act(() => result.current.setRegion('ceara'));
    act(() => result.current.setPoint({ type: 'Point', coordinates: [-38.5, -4.5] }));
    expect(result.current.status).toBe('stale');
  });

  it('does not let a slow old response overwrite a newer one (abort + discard)', async () => {
    const slow = deferred();
    server.use(
      http.post('*/api/v1/analyses', async ({ request }) => {
        const body = (await request.json()) as { variable_id: string };
        if (body.variable_id === 'air_temperature') {
          await slow.promise;
        }
        return HttpResponse.json(fixtureBackendAnalysis({ variable_id: body.variable_id }));
      }),
    );
    const { result } = setup();

    act(() => result.current.run()); // slow, air_temperature
    act(() => result.current.run({ variableId: 'precipitation' })); // fast
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.analysis?.variable_id).toBe('precipitation');

    slow.release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.status).toBe('success');
    expect(result.current.analysis?.variable_id).toBe('precipitation');
    expect(result.current.filters.variableId).toBe('precipitation');
  });

  it('cancels the request in flight when a filter changes and goes back to idle', async () => {
    const gate = deferred();
    analysesHandler(async () => {
      await gate.promise;
      return HttpResponse.json(fixtureBackendAnalysis());
    });
    const { result } = setup();

    act(() => result.current.run());
    expect(result.current.status).toBe('loading');
    act(() => result.current.setVariable('precipitation'));
    expect(result.current.status).toBe('idle');

    gate.release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.status).toBe('idle');
    expect(result.current.analysis).toBeNull();
  });

  it('reset restores defaults and clears point and result', async () => {
    analysesHandler(() => HttpResponse.json(fixtureBackendAnalysis()));
    const { result } = setup();
    act(() => result.current.setVariable('precipitation'));
    act(() => result.current.setRegion('northeast_brazil'));
    act(() => result.current.setStartDate('2018-01-01'));
    act(() => result.current.setPoint({ type: 'Point', coordinates: [-38.5, -4.5] }));
    act(() => result.current.run());
    await waitFor(() => expect(['success', 'no-data']).toContain(result.current.status));

    act(() => result.current.reset());
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
    expect(result.current.filters.point).toBeNull();
    expect(result.current.analysis).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('rejects an invalid date range without calling the API', () => {
    const { result } = setup();
    act(() => result.current.setStartDate('2023-12-31'));
    act(() => result.current.setEndDate('2015-01-01'));
    act(() => result.current.run());
    expect(result.current.status).toBe('error');
    expect(result.current.message).toBe('Choose a valid date range before running the analysis.');
  });
});
