import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { adaptBackendAnalysis } from '../api/client';
import { fixtureBackendAnalysis, fixtureForecast, fixtureStatistics } from '../test/fixtures';
import ResultPanel from './ResultPanel';

// Every number below is a TEST FIXTURE, not a real observation.
function renderPanel(overrides: Parameters<typeof fixtureBackendAnalysis>[0] = {}) {
  const analysis = adaptBackendAnalysis(fixtureBackendAnalysis(overrides));
  render(
    <ResultPanel
      analysis={analysis}
      kind="success"
      stale={false}
      variableName="Variable (TEST FIXTURE)"
      regionName="Region"
      onExport={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

describe('ResultPanel descriptive statistics', () => {
  it('shows every statistic with its unit when the backend sent them', () => {
    renderPanel({ statistics: { count: 36, mean: 24.5, median: 24.25, min: 20, max: 29.75, standard_deviation: 2.5 } });

    const block = screen.getByRole('region', { name: 'Descriptive statistics' });
    const text = (term: string) =>
      (within(block).getByText(term).nextElementSibling as HTMLElement).textContent;
    expect(text('Months with data')).toBe('36');
    expect(text('Mean')).toBe('24.5 unit-a');
    expect(text('Median')).toBe('24.3 unit-a');
    expect(text('Minimum')).toBe('20.0 unit-a');
    expect(text('Maximum')).toBe('29.8 unit-a');
    expect(text('Standard deviation')).toBe('2.50 unit-a');
  });

  it('says not available for a missing standard deviation, never zero', () => {
    renderPanel({ statistics: { ...fixtureStatistics, standard_deviation: null } });

    const block = screen.getByRole('region', { name: 'Descriptive statistics' });
    expect(within(block).getByText('Standard deviation').nextElementSibling).toHaveTextContent('Not available');
  });

  it('is absent when the backend sent no statistics', () => {
    renderPanel();

    expect(screen.queryByText('Descriptive statistics')).not.toBeInTheDocument();
  });

  it('keeps projection out of the main journey even when saved in the response', () => {
    renderPanel({ forecast: fixtureForecast });
    expect(screen.queryByText('Exploratory projection (not an official forecast)')).not.toBeInTheDocument();
  });
});

describe('ResultPanel without a projection', () => {
  it('has no projection legend or backtest text', () => {
    renderPanel();

    expect(screen.queryByText(/Exploratory projection/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Backtest/)).not.toBeInTheDocument();
  });
});
