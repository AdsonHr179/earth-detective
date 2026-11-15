import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TrendChart, { type TrendChartProps } from './TrendChart';

// TEST FIXTURE values, not real observations.
function monthly(values: Array<number | null>, year = 2020) {
  return values.map((value, index) => ({
    date: `${year}-${String(index + 1).padStart(2, '0')}-01`,
    value,
  }));
}

function renderChart(overrides: Partial<TrendChartProps> = {}) {
  const props: TrendChartProps = {
    points: monthly([1, 2, 3, 4, 5, 6]),
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

const legendLabels = () =>
  within(screen.getByRole('list', { name: 'What each line means' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('TrendChart', () => {
  it('draws the series, a dashed trend with a direct label, axes with unit, and a text summary', () => {
    const { container } = renderChart();

    // the summary (title + desc) is the chart's accessible name
    expect(
      screen.getByRole('img', {
        name: /Variable \(TEST FIXTURE\), Region.*Trend \+2\.50 unit-a per decade, statistically significant/,
      }),
    ).toBeInTheDocument();
    expect(container.querySelector('path.chart-selected')?.getAttribute('d')).toMatch(/^M/);
    expect(container.querySelector('line.chart-trend')).not.toBeNull();
    expect(screen.getByText('Trend +2.50 unit-a per decade')).toBeInTheDocument();
    expect(container.querySelectorAll('.chart-tick').length).toBeGreaterThan(3);
    expect(screen.getAllByText('unit-a').length).toBeGreaterThan(0);
    expect(legendLabels()).toEqual(['Monthly values', 'Trend (reported slope)']);
  });

  it('draws no baseline, band or history when the data has none, and lists none in the legend', () => {
    const { container } = renderChart();

    expect(container.querySelector('.chart-baseline')).toBeNull();
    expect(container.querySelector('.chart-band')).toBeNull();
    expect(container.querySelector('.chart-history')).toBeNull();
    expect(container.querySelector('.chart-gap')).toBeNull();
    const labels = legendLabels().join(' | ');
    expect(labels).not.toMatch(/baseline/i);
    expect(labels).not.toMatch(/band/i);
    expect(labels).not.toMatch(/history/i);
    expect(labels).not.toMatch(/no data/i);
  });

  it('draws a baseline and a band only when real values are passed', () => {
    const { container } = renderChart({
      baseline: { value: 3, label: 'Baseline (TEST FIXTURE)' },
      band: [
        { date: '2020-01-01', low: 0.5, high: 1.5 },
        { date: '2020-06-01', low: 5, high: 7 },
      ],
    });

    expect(container.querySelector('.chart-baseline')).not.toBeNull();
    expect(container.querySelector('.chart-band')).not.toBeNull();
    expect(legendLabels()).toEqual(
      expect.arrayContaining(['Baseline (TEST FIXTURE)', 'Uncertainty band']),
    );
  });

  it('hatches gaps, labels them "no data", breaks the line and never plots null as zero', () => {
    const { container } = renderChart({
      points: monthly([1, 2, null, null, 5, 6]),
      trend: { applicable: true, rate_per_decade: null, significant: null },
    });

    expect(container.querySelectorAll('rect.chart-gap')).toHaveLength(1);
    expect(screen.getByText('no data', { selector: 'text' })).toBeInTheDocument();
    const path = container.querySelector('path.chart-selected')?.getAttribute('d') ?? '';
    expect(path.match(/M/g)).toHaveLength(2);
    expect(legendLabels()).toContain('No data');

    const table = screen.getByRole('table', { hidden: true });
    const noData = within(table).getAllByText('no data');
    expect(noData).toHaveLength(2);
    expect(within(table).queryByText('0.00')).not.toBeInTheDocument();
    expect(within(table).getByText('1.00')).toBeInTheDocument();
  });

  it('draws grey history only for observations outside the selected period', () => {
    const { container } = renderChart({
      points: [...monthly([1, 2, 3], 2018), ...monthly([4, 5, 6])],
      periodStart: '2020-01-01',
      periodEnd: '2020-06-30',
    });

    expect(container.querySelector('path.chart-history')).not.toBeNull();
    expect(legendLabels()).toEqual(
      expect.arrayContaining(['Selected period', 'History (outside the period)']),
    );
  });

  it('draws no line, trend or marker for an all-null series', () => {
    const { container } = renderChart({
      points: monthly([null, null, null]),
      trend: { applicable: true, rate_per_decade: null, significant: null },
    });

    expect(screen.getByText('No monthly values to plot.')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('draws no trend line when the variable has no applicable trend', () => {
    const { container } = renderChart({ trend: { applicable: false, rate_per_decade: null, significant: null } });

    expect(container.querySelector('line.chart-trend')).toBeNull();
    expect(legendLabels()).toEqual(['Monthly values']);
  });

  it('offers the values in a collapsible table', () => {
    renderChart();
    const details = screen.getByText('Show the values as a table').closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    expect(within(screen.getByRole('table', { hidden: true })).getAllByRole('row', { hidden: true })).toHaveLength(7);
  });
});
