import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TrendChart, { backtestSentence, FORECAST_LEGEND, type TrendChartProps } from './TrendChart';
import { fixtureForecast } from '../test/fixtures';

// TEST FIXTURE values, not real observations or a real forecast.
const points = [1, 2, 3, 4, 5, 6].map((value, index) => ({
  date: `2020-0${index + 1}-01`,
  value,
}));

function renderChart(overrides: Partial<TrendChartProps> = {}) {
  const props: TrendChartProps = {
    points,
    unit: 'unit-a',
    variableName: 'Variable (TEST FIXTURE)',
    regionName: 'Region',
    periodStart: '2020-01-01',
    periodEnd: '2020-06-30',
    trend: { applicable: true, rate_per_decade: 2.5, significant: true },
    ...overrides,
  };
  return render(<TrendChart {...props} />);
}

const forecast = {
  ...fixtureForecast,
  points: [
    { timestamp: '2020-07-01', value: 7 },
    { timestamp: '2020-08-01', value: 7.5 },
    { timestamp: '2020-09-01', value: 8 },
  ],
};

const legendLabels = () =>
  within(screen.getByRole('list', { name: 'What each line means' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('TrendChart exploratory projection', () => {
  it('draws nothing and lists nothing when there is no forecast', () => {
    const { container } = renderChart();

    expect(container.querySelector('.chart-forecast')).toBeNull();
    expect(screen.queryByText('Projection')).not.toBeInTheDocument();
    expect(legendLabels().join(' | ')).not.toMatch(/projection/i);
  });

  it('draws nothing when the forecast has no points', () => {
    const { container } = renderChart({ forecast: { ...forecast, points: [] } });

    expect(container.querySelector('.chart-forecast')).toBeNull();
    expect(legendLabels().join(' | ')).not.toMatch(/projection/i);
  });

  it('draws a distinct dash-dot line, a direct label, the legend and the backtest error', () => {
    const { container } = renderChart({ forecast });

    const line = container.querySelector('path.chart-forecast');
    expect(line?.getAttribute('d')).toMatch(/^M/);
    // one vertex per returned point, no extra points
    expect(line?.getAttribute('d')?.match(/[ML]/g)).toHaveLength(3);
    // not the dashed trend line
    expect(container.querySelector('line.chart-trend')).not.toBeNull();
    expect(line?.tagName).toBe('path');
    expect(screen.getByText('Projection')).toBeInTheDocument();
    expect(legendLabels()).toContain(FORECAST_LEGEND);
    expect(FORECAST_LEGEND).toBe('Exploratory projection (not an official forecast)');
    const note = container.querySelector('figcaption') as HTMLElement;
    expect(note).toHaveTextContent(/Backtest error: mean absolute error 0\.25 unit-a over 6 checks on past months\./);
    expect(note).toHaveTextContent('fixture-projection');
    expect(screen.getByRole('img', { name: /exploratory projection of 3 months.*not an official forecast/i })).toBeInTheDocument();
  });

  it('says plainly when no backtest error was reported', () => {
    const { container } = renderChart({ forecast: { ...forecast, backtest_mae: null, backtest_count: 0 } });

    const note = container.querySelector('figcaption') as HTMLElement;
    expect(note).toHaveTextContent('No backtest error was reported for this projection.');
    expect(note).not.toHaveTextContent('mean absolute error');
  });

  it('never turns a bad projection value into a number', () => {
    const { container } = renderChart({
      forecast: {
        ...forecast,
        points: [
          { timestamp: '2020-07-01', value: 7 },
          { timestamp: '2020-08-01', value: Number.NaN },
          { timestamp: '2020-09-01', value: 8 },
        ],
      },
    });

    // the invalid month breaks the line into two single points, drawn as dots, not as zero
    expect(container.querySelector('path.chart-forecast')?.getAttribute('d') ?? '').toBe('');
    expect(container.querySelectorAll('circle.chart-forecast-dot')).toHaveLength(2);
  });

  it('formats the backtest sentence with singular and plural checks', () => {
    expect(backtestSentence({ ...forecast, backtest_count: 1 }, 'u')).toMatch(/over 1 check on past months/);
    expect(backtestSentence({ ...forecast, backtest_count: 6 }, '')).toMatch(/error 0\.25 over 6 checks/);
  });
});
