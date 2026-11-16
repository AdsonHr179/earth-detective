import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GeoJSONPoint } from './api/client';
import App from './App';
import { deferred, registerCatalogHandlers } from './test/handlers';
import { fixtureBackendAnalysis, fixtureRegions, fixtureVariables } from './test/fixtures';
import { server } from './test/server';

// Leaflet does not run in jsdom; the map module is replaced by a button that selects a fixed point.
vi.mock('./components/MapStage', () => ({
  default: ({ onSelectPosition }: { onSelectPosition: (point: GeoJSONPoint) => void }) => (
    <button type="button" onClick={() => onSelectPosition({ type: 'Point', coordinates: [-38.5, -4.5] })}>
      Pick map point
    </button>
  ),
}));

const TEMPERATURE_TITLE = 'Air temperature (TEST FIXTURE) at the selected point';
const STALE_TEXT = 'Your choices changed after this result. Run the analysis again to update it.';

type AnalysisBody = { variable_id: string; region_id: string; spatial_query?: GeoJSONPoint };

function analysesReturning(build: (body: AnalysisBody) => Response | Promise<Response>) {
  server.use(
    http.post('*/api/v1/analyses', async ({ request }) => build((await request.json()) as AnalysisBody)),
  );
}

async function renderApp() {
  registerCatalogHandlers();
  const user = userEvent.setup();
  render(<App />);
  const runButton = await screen.findByRole('button', { name: 'Run analysis' });
  await waitFor(() => expect(runButton).toBeEnabled());
  return { user, runButton };
}

const chip = (name: RegExp) => screen.getByRole('button', { name });

async function choose(user: ReturnType<typeof userEvent.setup>, chipName: RegExp, optionName: string) {
  await user.click(chip(chipName));
  await user.click(screen.getByRole('radio', { name: optionName }));
  await user.keyboard('{Escape}');
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App first screen', () => {
  it('opens in Ceará on an honest ready state: no number, no analysis request, a clear primary button', async () => {
    const requested = vi.fn();
    analysesReturning(() => {
      requested();
      return HttpResponse.json(fixtureBackendAnalysis());
    });
    const { runButton } = await renderApp();

    expect(screen.getByRole('heading', { level: 1, name: 'Earth Detective' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Run analysis to read the trend at this point' }),
    ).toBeInTheDocument();
    expect(chip(/^Region:/)).toHaveAccessibleName('Region: Ceará (TEST FIXTURE)');
    expect(screen.getByText(/Region center: 5\.00° S, 39\.00° W/)).toBeInTheDocument();
    expect(screen.queryByText(/\d per decade/)).not.toBeInTheDocument(); // no figure, not even an example
    expect(runButton).toBeEnabled();
    expect(await screen.findByRole('button', { name: 'Pick map point' })).toBeInTheDocument();
    expect(requested).not.toHaveBeenCalled();
  });

  it('uses public NASA temperature with a worldwide point selected on the map', async () => {
    registerCatalogHandlers();
    const variableId = 'nasa_power_temperature';
    server.use(
      http.get('*/api/v1/nasa/variables', () => HttpResponse.json([
        { ...fixtureVariables[0], id: variableId, name: 'NASA POWER temperature' },
      ])),
      http.get('*/api/v1/regions', () => HttpResponse.json([
        { ...fixtureRegions[0], id: 'world', name: 'Worldwide', center: null, boundaryStateCodes: [] },
        ...fixtureRegions,
      ])),
    );
    const requested = vi.fn();
    analysesReturning((body) => {
      requested(body);
      return HttpResponse.json(fixtureBackendAnalysis(body));
    });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('heading', { name: 'Choose a point anywhere in the world' });
    expect(chip(/^Variable:/)).toHaveAccessibleName('Variable: NASA POWER temperature');
    expect(chip(/^Region:/)).toHaveAccessibleName('Region: Worldwide');
    const runButton = screen.getByRole('button', { name: 'Run analysis' });
    expect(runButton).toBeDisabled();
    await user.click(await screen.findByRole('button', { name: 'Pick map point' }));
    await waitFor(() => expect(runButton).toBeEnabled());
    await user.click(runButton);

    expect(await screen.findByRole('heading', { name: 'NASA POWER temperature at the selected point' })).toBeInTheDocument();
    expect(requested).toHaveBeenCalledWith(expect.objectContaining({
      variable_id: variableId, region_id: 'world', spatial_query: { type: 'Point', coordinates: [-38.5, -4.5] },
    }));
  });

  it('shows the catalog failure in words and recovers with Try again', async () => {
    let calls = 0;
    registerCatalogHandlers();
    server.use(
      http.get('*/api/v1/variables', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ detail: 'down' }, { status: 503 })
          : HttpResponse.json(fixtureVariables);
      }),
      http.get('*/api/v1/regions', () => HttpResponse.json(fixtureRegions)),
    );
    const user = userEvent.setup();
    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The data service is not available right now');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('heading', { name: 'Run analysis to read the trend at this point' }),
    ).toBeInTheDocument();
  });
});

describe('App analysis flow', () => {
  it('shows loading with Cancel, then the result titled with the result variable', async () => {
    const gate = deferred();
    analysesReturning(async (body) => {
      await gate.promise;
      return HttpResponse.json(fixtureBackendAnalysis({ variable_id: body.variable_id }));
    });
    const { user, runButton } = await renderApp();

    await user.click(runButton);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    gate.release();

    expect(await screen.findByRole('heading', { name: TEMPERATURE_TITLE })).toBeInTheDocument();
    expect(screen.queryByText(STALE_TEXT)).not.toBeInTheDocument();
    expect(screen.getByText('One point, not an area average', { selector: 'li' })).toBeInTheDocument();
  });

  it('Cancel stops the request and returns to ready with the choices intact', async () => {
    const gate = deferred();
    analysesReturning(async () => {
      await gate.promise;
      return HttpResponse.json(fixtureBackendAnalysis());
    });
    const { user, runButton } = await renderApp();
    await choose(user, /^Variable:/, 'Precipitation (TEST FIXTURE)');

    await user.click(runButton);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(
      await screen.findByRole('heading', { name: 'Run analysis to read the trend at this point' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Analysis cancelled. Your choices are unchanged.')).toBeInTheDocument();
    expect(chip(/^Variable:/)).toHaveAccessibleName('Variable: Precipitation (TEST FIXTURE)');
    gate.release();
  });

  it('shows the no-data state when every value is null', async () => {
    analysesReturning(() => HttpResponse.json(fixtureBackendAnalysis({ values: [null, null] })));
    const { user, runButton } = await renderApp();

    await user.click(runButton);
    expect(await screen.findByRole('heading', { name: 'No valid observations' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: TEMPERATURE_TITLE })).not.toBeInTheDocument();
  });

  it('explains a 503 in plain words (with the service message) and retries without losing the selection', async () => {
    let calls = 0;
    analysesReturning((body) => {
      calls += 1;
      return calls === 1
        ? HttpResponse.json({ detail: 'Upstream provider unavailable' }, { status: 503 })
        : HttpResponse.json(fixtureBackendAnalysis({ variable_id: body.variable_id }));
    });
    const { user, runButton } = await renderApp();
    await choose(user, /^Variable:/, 'Precipitation (TEST FIXTURE)');

    await user.click(runButton);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('What happened: The data service is not available right now');
    expect(within(alert).getByText('Upstream provider unavailable')).toBeInTheDocument();
    expect(alert).not.toHaveTextContent('{');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { name: 'Precipitation (TEST FIXTURE) at the selected point' }),
    ).toBeInTheDocument();
    expect(chip(/^Variable:/)).toHaveAccessibleName('Variable: Precipitation (TEST FIXTURE)');
  });

  it('flags the result as stale and keeps its title when a choice changes', async () => {
    analysesReturning((body) => HttpResponse.json(fixtureBackendAnalysis({ variable_id: body.variable_id })));
    const { user, runButton } = await renderApp();
    await user.click(runButton);
    await screen.findByRole('heading', { name: TEMPERATURE_TITLE });

    await choose(user, /^Variable:/, 'Precipitation (TEST FIXTURE)');

    expect(screen.getByText(STALE_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: TEMPERATURE_TITLE })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Precipitation \(TEST FIXTURE\) at the selected point/ }),
    ).not.toBeInTheDocument();

    await choose(user, /^Variable:/, 'Air temperature (TEST FIXTURE)');
    expect(screen.queryByText(STALE_TEXT)).not.toBeInTheDocument();

    await user.click(chip(/^Period:/));
    const end = screen.getByLabelText('End date');
    await user.clear(end);
    await user.type(end, '2022-12-31');
    expect(screen.getByText(STALE_TEXT)).toBeInTheDocument();
  });

  it('sends the typed latitude and longitude as the analysis point', async () => {
    let received: AnalysisBody | null = null;
    analysesReturning((body) => {
      received = body;
      return HttpResponse.json(fixtureBackendAnalysis({ variable_id: body.variable_id }));
    });
    const { user, runButton } = await renderApp();

    await user.click(chip(/^Point:/));
    const latitude = screen.getByLabelText(/Latitude/);
    await user.clear(latitude);
    await user.type(latitude, '-4.5');
    const longitude = screen.getByLabelText(/Longitude/);
    await user.clear(longitude);
    await user.type(longitude, '-38.25{Enter}');
    expect(screen.getByText(/Selected point: 4\.50° S, 38\.25° W/)).toBeInTheDocument();

    await user.click(runButton);
    await screen.findByRole('heading', { name: TEMPERATURE_TITLE });
    expect(received).toMatchObject({ spatial_query: { type: 'Point', coordinates: [-38.25, -4.5] } });
  });

  it('chooses the point by clicking the map', async () => {
    const { user } = await renderApp();

    await user.click(await screen.findByRole('button', { name: 'Pick map point' }));

    expect(screen.getByText(/Selected point: 4\.50° S, 38\.50° W/)).toBeInTheDocument();
    expect(chip(/^Point:/)).toHaveAccessibleName('Point: 4.50° S, 38.50° W');
  });
});

describe('App Reset', () => {
  it('restores variable, region, dates and point, and clears the point choice', async () => {
    const { user } = await renderApp();

    await choose(user, /^Variable:/, 'Precipitation (TEST FIXTURE)');
    await choose(user, /^Region:/, 'Northeast (TEST FIXTURE)');
    await user.click(await screen.findByRole('button', { name: 'Pick map point' }));
    expect(screen.getByText(/Selected point: 4\.50° S, 38\.50° W/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset' }));

    expect(chip(/^Variable:/)).toHaveAccessibleName('Variable: Air temperature (TEST FIXTURE)');
    expect(chip(/^Region:/)).toHaveAccessibleName('Region: Ceará (TEST FIXTURE)');
    expect(chip(/^Period:/)).toHaveAccessibleName('Period: 2015–2023');
    expect(screen.queryByText(/Selected point:/)).not.toBeInTheDocument();
    expect(screen.getByText(/Region center: 5\.00° S, 39\.00° W/)).toBeInTheDocument();
  });
});

describe('App on a narrow screen', () => {
  it('moves Run analysis into a bottom sheet that collapses with aria-expanded', async () => {
    stubMatchMedia(true);
    analysesReturning((body) => HttpResponse.json(fixtureBackendAnalysis({ variable_id: body.variable_id })));
    const { user, runButton } = await renderApp();

    expect(screen.getAllByRole('button', { name: 'Run analysis' })).toHaveLength(1);
    const toggle = screen.getByRole('button', { name: /Collapse result/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(runButton);
    await screen.findByRole('heading', { name: TEMPERATURE_TITLE });

    await user.click(toggle);
    expect(screen.getByRole('button', { name: /Expand result/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('heading', { name: TEMPERATURE_TITLE, hidden: true })).not.toBeVisible();
    // the primary action stays reachable while collapsed
    expect(screen.getByRole('button', { name: 'Run analysis' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Expand result/ }));
    expect(screen.getByRole('heading', { name: TEMPERATURE_TITLE })).toBeVisible();
  });
});
