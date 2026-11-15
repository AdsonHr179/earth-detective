import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { GeoJSONPoint } from './api/client';
import App from './App';
import { registerCatalogHandlers } from './test/handlers';
import { fixtureBackendAnalysis } from './test/fixtures';
import { server } from './test/server';

// Leaflet does not run in jsdom; the map is replaced by a button that selects a fixed point.
vi.mock('./components/RegionMap', () => ({
  default: ({ onSelectPosition }: { onSelectPosition: (point: GeoJSONPoint) => void }) => (
    <button
      type="button"
      onClick={() => onSelectPosition({ type: 'Point', coordinates: [-38.5, -4.5] })}
    >
      Pick map point
    </button>
  ),
}));

const TEMPERATURE_TITLE = 'Air temperature (TEST FIXTURE) at the selected point';
const STALE_TEXT = 'Your choices changed after this result. Run the analysis again to update it.';

function analysesReturning(
  build: (body: { variable_id: string; region_id: string }) => Response,
) {
  server.use(
    http.post('*/api/v1/analyses', async ({ request }) =>
      build((await request.json()) as { variable_id: string; region_id: string }),
    ),
  );
}

async function renderApp() {
  registerCatalogHandlers();
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText(/Catalog ready/);
  const runButton = screen.getByRole('button', { name: 'Run analysis' });
  await waitFor(() => expect(runButton).toBeEnabled());
  return { user, runButton };
}

describe('App analysis flow', () => {
  it('shows loading, then the result titled with the result variable', async () => {
    analysesReturning((body) =>
      HttpResponse.json(fixtureBackendAnalysis({ variable_id: body.variable_id })),
    );
    const { user, runButton } = await renderApp();

    await user.click(runButton);
    expect(await screen.findByRole('heading', { name: TEMPERATURE_TITLE })).toBeInTheDocument();
    expect(screen.queryByText(STALE_TEXT)).not.toBeInTheDocument();
  });

  it('shows the no-data state when every value is null', async () => {
    analysesReturning(() => HttpResponse.json(fixtureBackendAnalysis({ values: [null, null] })));
    const { user, runButton } = await renderApp();

    await user.click(runButton);
    expect(await screen.findByRole('heading', { name: 'No valid series' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: TEMPERATURE_TITLE })).not.toBeInTheDocument();
  });

  it('shows the backend detail on 503 and retries without losing the selection', async () => {
    let calls = 0;
    analysesReturning((body) => {
      calls += 1;
      return calls === 1
        ? HttpResponse.json({ detail: 'Upstream provider unavailable' }, { status: 503 })
        : HttpResponse.json(fixtureBackendAnalysis({ variable_id: body.variable_id }));
    });
    const { user, runButton } = await renderApp();
    await user.selectOptions(screen.getByLabelText('Variable'), 'precipitation');

    await user.click(runButton);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Upstream provider unavailable')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { name: 'Precipitation (TEST FIXTURE) at the selected point' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Variable')).toHaveValue('precipitation');
  });

  it('flags the result as stale and keeps its title when the variable changes', async () => {
    analysesReturning((body) =>
      HttpResponse.json(fixtureBackendAnalysis({ variable_id: body.variable_id })),
    );
    const { user, runButton } = await renderApp();
    await user.click(runButton);
    await screen.findByRole('heading', { name: TEMPERATURE_TITLE });

    await user.selectOptions(screen.getByLabelText('Variable'), 'precipitation');

    expect(screen.getByText(STALE_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: TEMPERATURE_TITLE })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Precipitation \(TEST FIXTURE\) at the selected point/ }),
    ).not.toBeInTheDocument();

    // Changing dates after a result is flagged too.
    await user.selectOptions(screen.getByLabelText('Variable'), 'air_temperature');
    expect(screen.queryByText(STALE_TEXT)).not.toBeInTheDocument();
    const end = screen.getByLabelText('End date');
    await user.clear(end);
    await user.type(end, '2022-12-31');
    expect(screen.getByText(STALE_TEXT)).toBeInTheDocument();
  });

  it('Reset restores the defaults and clears point and result', async () => {
    analysesReturning((body) =>
      HttpResponse.json(fixtureBackendAnalysis({ variable_id: body.variable_id })),
    );
    const { user, runButton } = await renderApp();

    await user.selectOptions(screen.getByLabelText('Variable'), 'precipitation');
    await user.click(screen.getByRole('button', { name: 'Northeast (TEST FIXTURE)' }));
    const start = screen.getByLabelText('Start date');
    await user.clear(start);
    await user.type(start, '2018-01-01');
    await user.click(screen.getByRole('button', { name: 'Pick map point' }));
    expect(screen.getByText(/Selected point: -4\.5000°, -38\.5000°/)).toBeInTheDocument();
    await user.click(runButton);
    await screen.findByRole('heading', { name: /at the selected point/ });

    await user.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.getByLabelText('Variable')).toHaveValue('air_temperature');
    expect(screen.getByLabelText('Start date')).toHaveValue('2015-01-01');
    expect(screen.getByLabelText('End date')).toHaveValue('2023-12-31');
    expect(screen.getByRole('button', { name: 'Ceará (TEST FIXTURE)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByText(/Selected point:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /at the selected point/ })).not.toBeInTheDocument();
    expect(screen.queryByText(STALE_TEXT)).not.toBeInTheDocument();
  });
});
