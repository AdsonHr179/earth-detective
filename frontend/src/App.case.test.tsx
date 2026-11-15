import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { server } from './test/server';
import { registerCatalogHandlers } from './test/handlers';
import { fixtureAvailability, fixtureBackendAnalysis, fixtureVariables } from './test/fixtures';

vi.mock('./components/MapStage', () => ({ default: () => <div>TEST FIXTURE map</div> }));

describe('Main case entry and availability (TEST FIXTURES ONLY)', () => {
  it('selects catalog-backed POWER case without querying until Run analysis is clicked', async () => {
    registerCatalogHandlers();
    let payload: Record<string, unknown> | null = null;
    server.use(
      http.get('*/api/v1/nasa/variables', () => HttpResponse.json([
        { ...fixtureVariables[0], id: 'nasa_power_temperature', name: 'NASA POWER (TEST FIXTURE)' },
      ])),
      http.post('*/api/v1/analyses', async ({ request }) => {
        payload = await request.json() as Record<string, unknown>;
        return HttpResponse.json(fixtureBackendAnalysis({ variable_id: 'nasa_power_temperature' }));
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Use NASA POWER case · 2020–2023' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run analysis' })).toBeEnabled());
    expect(payload).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Run analysis' }));
    await waitFor(() => expect(payload).toMatchObject({ variable_id: 'nasa_power_temperature', region_id: 'ceara',
      start_date: '2020-01-01', end_date: '2023-12-31', spatial_query: { type: 'Point', coordinates: [-39.5, -5.2] } }));
  });
  it('disables running an unavailable source and shows its actual reason', async () => {
    registerCatalogHandlers();
    server.use(http.get('*/api/v1/availability', () => HttpResponse.json({
      ...fixtureAvailability('air_temperature', 'ceara'), available: false,
      warning: 'TEST FIXTURE: provider access not granted.',
    })));
    render(<App />);
    expect(await screen.findByText('TEST FIXTURE: provider access not granted.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Run analysis' })).toBeDisabled();
  });
  it('keeps the source failure reason visible when availability fails', async () => {
    registerCatalogHandlers();
    server.use(http.get('*/api/v1/availability', () => HttpResponse.json({
      detail: 'TEST FIXTURE: availability upstream offline.',
    }, { status: 503 })));
    render(<App />);
    expect(await screen.findByText(/Coverage could not be checked: TEST FIXTURE: availability upstream offline/)).toBeVisible();
  });
  it('keeps the unavailability reason visible beside a stale result', async () => {
    registerCatalogHandlers();
    server.use(
      http.post('*/api/v1/analyses', () => HttpResponse.json(fixtureBackendAnalysis())),
      http.get('*/api/v1/availability', ({ request }) => {
        const variable = new URL(request.url).searchParams.get('variable_id')!;
        return HttpResponse.json({ ...fixtureAvailability(variable, 'ceara'),
          available: variable !== 'precipitation', warning: variable === 'precipitation' ? 'TEST FIXTURE: no source entitlement.' : null });
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    const run = await screen.findByRole('button', { name: 'Run analysis' });
    await waitFor(() => expect(run).toBeEnabled());
    await user.click(run);
    await screen.findByRole('heading', { name: 'Air temperature (TEST FIXTURE) at the selected point' });
    await user.click(screen.getByRole('button', { name: /^Variable:/ }));
    await user.click(screen.getByRole('radio', { name: 'Precipitation (TEST FIXTURE)' }));
    await user.keyboard('{Escape}');
    expect(await screen.findByText('TEST FIXTURE: no source entitlement.')).toBeVisible();
    expect(screen.getByText('out of date')).toBeVisible();
    expect(run).toBeDisabled();
  });
});
