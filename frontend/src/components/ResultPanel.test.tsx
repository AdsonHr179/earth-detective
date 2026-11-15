import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { adaptBackendAnalysis } from '../api/client';
import { fixtureBackendAnalysis } from '../test/fixtures';
import ResultPanel from './ResultPanel';

// Every number below is a TEST FIXTURE, not a real observation.
type Overrides = Parameters<typeof fixtureBackendAnalysis>[0];

function renderPanel(overrides: Overrides = {}, props: Partial<Parameters<typeof ResultPanel>[0]> = {}) {
  const analysis = adaptBackendAnalysis(fixtureBackendAnalysis(overrides));
  const onExport = vi.fn().mockResolvedValue(undefined);
  const hasData = analysis.chart_points.some((point) => point.value !== null);
  render(
    <ResultPanel
      analysis={analysis}
      kind={hasData ? 'success' : 'no-data'}
      stale={false}
      variableName="Variable (TEST FIXTURE)"
      regionName="Region"
      onExport={onExport}
      {...props}
    />,
  );
  return { analysis, onExport };
}

const baseTrend = fixtureBackendAnalysis().trend;

describe('ResultPanel with a result', () => {
  it('shows the big rate with unit, the template sentence, provenance and the one-point seal', () => {
    renderPanel({
      retrieved_at: '2000-01-02T03:04:05+00:00',
      effective_period: { start_date: '2015-01-01', end_date: '2023-12-31' },
    });

    expect(screen.getByRole('heading', { name: 'Variable (TEST FIXTURE) at the selected point' })).toBeInTheDocument();
    expect(screen.getByText('+0.50 unit-a per decade')).toBeInTheDocument(); // screen reader text
    expect(
      screen.getByText(
        'Variable (TEST FIXTURE) at this point shows an upward trend that is statistically significant at α = 0.05.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('TEST FIXTURE · fixture-product · method fixture-method · retrieved 2000-01-02 03:04 UTC'),
    ).toBeInTheDocument();
    const badges = within(screen.getByRole('list', { name: 'Quality of this reading' }));
    expect(badges.getByText('One point, not an area average')).toBeInTheDocument();
    expect(badges.getByText('Significant (p = 0.010)')).toBeInTheDocument();
    expect(badges.getByText('Short period (9 years)')).toBeInTheDocument();
  });

  it('lists what the result does not tell you, and full provenance', () => {
    renderPanel();

    const limits = screen.getByText('What this does not tell you').closest('details') as HTMLElement;
    expect(limits).toHaveAttribute('open');
    expect(within(limits).getByText(/one point, not the whole region/)).toBeInTheDocument();
    expect(within(limits).getByText(/It shows change, not what causes it/)).toBeInTheDocument();
    expect(within(limits).getByText(/From the data service: Fixture limitations\./)).toBeInTheDocument();

    const method = screen.getByText('Method and sources').closest('details') as HTMLElement;
    expect(within(method).getByText('fixture-v1')).toBeInTheDocument();
    expect(within(method).getByText(/fixture-estimator · fixture-inference · version fixture-method/)).toBeInTheDocument();
    expect(within(method).getByText('2015-01-01 to 2015-03-01')).toBeInTheDocument(); // fixture default
  });

  it('shows notes from the data service and the chart with its values table', () => {
    renderPanel();

    expect(screen.getByText('fixture warning')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Variable \(TEST FIXTURE\), Region/ })).toBeInTheDocument();
    expect(screen.getByRole('table', { hidden: true })).toBeInTheDocument();
  });

  it('exports through the existing callback and reports the outcome', async () => {
    const user = userEvent.setup();
    const { onExport } = renderPanel();

    await user.click(screen.getByRole('button', { name: 'Download CSV' }));

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('CSV downloaded.')).toBeInTheDocument();
  });

  it('reports a failed export in words', async () => {
    const user = userEvent.setup();
    renderPanel({}, { onExport: vi.fn().mockRejectedValue(new Error('boom')) });

    await user.click(screen.getByRole('button', { name: 'Download CSV' }));

    expect(await screen.findByText('Export failed: boom')).toBeInTheDocument();
  });

  it('copies the citation', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPanel();

    await user.click(screen.getByText('Cite this result'));
    await user.click(screen.getByRole('button', { name: 'Copy citation' }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('analysis id fixture-analysis'));
    expect(await screen.findByText('Citation copied.')).toBeInTheDocument();
  });

  it('marks a stale result as out of date but keeps the number', () => {
    renderPanel({}, { stale: true });

    expect(
      screen.getByText('Your choices changed after this result. Run the analysis again to update it.'),
    ).toBeInTheDocument();
    expect(screen.getByText('out of date')).toBeInTheDocument();
    expect(screen.getByText('+0.50 unit-a per decade')).toBeInTheDocument();
  });
});

describe('ResultPanel without a usable result', () => {
  it('shows the no-data state with no number, chart or fake values', () => {
    renderPanel({ values: [null, null] });

    expect(screen.getByRole('heading', { name: 'No valid observations' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/per decade/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download CSV' })).not.toBeInTheDocument();
  });

  it('shows an inconclusive result honestly: a dash, the evidence sentence, the data and no trend line', () => {
    const { analysis } = renderPanel({
      trend: {
        ...baseTrend,
        direction: 'undetermined',
        slope_per_decade: null,
        significant: null,
        p_value: null,
        confidence_interval: null,
      },
    });

    expect(
      screen.getByText('The data and method did not give enough evidence to identify a trend at this level.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No trend estimate')).toBeInTheDocument();
    expect(screen.queryByText(/per decade/)).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /No trend could be estimated/ })).toBeInTheDocument();
    expect(analysis.trend.rate_per_decade).toBeNull();
    expect(screen.getByText('Not enough valid months for a trend')).toBeInTheDocument();
    expect(screen.queryByText(/no change/i)).not.toBeInTheDocument();
  });

  it('shows a non-applicable variable without a rate', () => {
    renderPanel({ trend: { ...baseTrend, applicable: false, slope_per_decade: null, significant: null } });

    expect(screen.getByText(/A linear trend is not calculated for this variable/)).toBeInTheDocument();
    expect(screen.getByText('No rate per decade for this variable')).toBeInTheDocument();
  });
});
