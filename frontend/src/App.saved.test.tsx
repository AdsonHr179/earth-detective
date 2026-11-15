import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GeoJSONPoint } from './api/client';
import App from './App';
import { registerCatalogHandlers } from './test/handlers';
import { fixtureBackendAnalysis, fixtureForecast, fixtureSaved, fixtureStatistics } from './test/fixtures';
import { server } from './test/server';

// Leaflet does not run in jsdom; the map module is replaced by a button.
vi.mock('./components/MapStage', () => ({
  default: ({ onSelectPosition }: { onSelectPosition: (point: GeoJSONPoint) => void }) => (
    <button type="button" onClick={() => onSelectPosition({ type: 'Point', coordinates: [-38.5, -4.5] })}>
      Pick map point
    </button>
  ),
}));

async function renderApp() {
  registerCatalogHandlers();
  const user = userEvent.setup();
  render(<App />);
  const runButton = await screen.findByRole('button', { name: 'Run analysis' });
  await waitFor(() => expect(runButton).toBeEnabled());
  return { user, runButton };
}

const savedChip = () => screen.getByRole('button', { name: /Saved analyses/ });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Saved analyses list', () => {
  it('shows a loading state, then the saved results with names and period', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('*/api/v1/analyses', async () => {
        await gate;
        return HttpResponse.json(fixtureSaved);
      }),
    );
    const { user } = await renderApp();

    await user.click(savedChip());
    expect(await screen.findByText('Loading saved analyses…')).toBeInTheDocument();
    release();

    const list = await screen.findByRole('list', { name: 'Saved analyses' });
    const item = within(list).getByRole('button');
    expect(item).toHaveTextContent('Air temperature (TEST FIXTURE) · Ceará (TEST FIXTURE) · 2015–2023');
    expect(item).toHaveTextContent('fixture-product · retrieved 2000-01-02 03:04 UTC');
  });

  it('says so when nothing is saved, without showing any example', async () => {
    server.use(http.get('*/api/v1/analyses', () => HttpResponse.json([])));
    const { user } = await renderApp();

    await user.click(savedChip());

    expect(await screen.findByText('No saved analyses yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Saved analyses' })).not.toBeInTheDocument();
  });

  it('explains a failure and recovers with Try again', async () => {
    let calls = 0;
    server.use(
      http.get('*/api/v1/analyses', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ detail: 'x', error: { code: 'service_unavailable', message: 'x' } }, { status: 503 })
          : HttpResponse.json(fixtureSaved);
      }),
    );
    const { user } = await renderApp();

    await user.click(savedChip());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The data service is not available right now.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('list', { name: 'Saved analyses' })).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('opens the chosen result by id, with statistics and projection, as current (not out of date)', async () => {
    const opened = vi.fn();
    server.use(
      http.get('*/api/v1/analyses', () => HttpResponse.json(fixtureSaved)),
      http.get('*/api/v1/analyses/:id', ({ params }) => {
        opened(params.id);
        return HttpResponse.json(
          fixtureBackendAnalysis({
            analysis_id: String(params.id),
            statistics: fixtureStatistics,
            forecast: { ...fixtureForecast, points: [{ timestamp: '2015-04-01', value: 3.5 }] },
          }),
        );
      }),
    );
    const { user } = await renderApp();

    await user.click(savedChip());
    await user.click(await screen.findByRole('button', { name: /Air temperature \(TEST FIXTURE\) · Ceará/ }));

    expect(await screen.findByRole('heading', { name: 'Air temperature (TEST FIXTURE) at the selected point' })).toBeInTheDocument();
    expect(opened).toHaveBeenCalledWith('saved-1');
    expect(screen.getByRole('region', { name: 'Descriptive statistics' })).toBeInTheDocument();
    expect(screen.getByText('Exploratory projection (not an official forecast)')).toBeInTheDocument();
    expect(screen.queryByText('Out of date')).not.toBeInTheDocument();
  });

  it('shows a failure to open a saved result and keeps no result', async () => {
    server.use(
      http.get('*/api/v1/analyses', () => HttpResponse.json(fixtureSaved)),
      http.get('*/api/v1/analyses/:id', () =>
        HttpResponse.json({ detail: 'gone', error: { code: 'not_found', message: 'Saved analysis not found' } }, { status: 404 }),
      ),
    );
    const { user } = await renderApp();

    await user.click(savedChip());
    await user.click(await screen.findByRole('button', { name: /Air temperature \(TEST FIXTURE\) · Ceará/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not get the data');
    expect(alert).toHaveTextContent('Saved analysis not found');
    expect(screen.queryByText(/per decade/)).not.toBeInTheDocument();
  });
});

describe('Download CSV', () => {
  it('uses the export endpoint of the analysis id', async () => {
    const exported = vi.fn();
    server.use(
      http.post('*/api/v1/analyses', () => HttpResponse.json(fixtureBackendAnalysis({ analysis_id: 'abc-123' }))),
      http.get('*/api/v1/analyses/:id/export', ({ params }) => {
        exported(params.id);
        return new HttpResponse('a,b\n', { headers: { 'Content-Type': 'text/csv' } });
      }),
    );
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:fixture', revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { user, runButton } = await renderApp();

    await user.click(runButton);
    await user.click(await screen.findByRole('button', { name: 'Download CSV' }));

    expect(await screen.findByText('CSV downloaded.')).toBeInTheDocument();
    expect(exported).toHaveBeenCalledWith('abc-123');
  });
});
