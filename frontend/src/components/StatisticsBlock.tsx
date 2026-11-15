import type { DescriptiveStatistics } from '../api/client';
import { formatNumber } from '../lib/format';

/** Descriptive statistics of the monthly values, exactly as the backend reported them. */
export default function StatisticsBlock({
  statistics,
  unit,
}: {
  statistics: DescriptiveStatistics;
  unit: string;
}) {
  const withUnit = (value: number) => (unit ? `${formatNumber(value)} ${unit}` : formatNumber(value));
  const deviation =
    statistics.standard_deviation === null ? 'Not available' : withUnit(statistics.standard_deviation);

  return (
    <section className="stats" aria-labelledby="stats-title">
      <h3 id="stats-title">Descriptive statistics</h3>
      <dl className="stats-grid">
        <div>
          <dt>Months with data</dt>
          <dd>{statistics.count}</dd>
        </div>
        <div>
          <dt>Mean</dt>
          <dd>{withUnit(statistics.mean)}</dd>
        </div>
        <div>
          <dt>Median</dt>
          <dd>{withUnit(statistics.median)}</dd>
        </div>
        <div>
          <dt>Minimum</dt>
          <dd>{withUnit(statistics.min)}</dd>
        </div>
        <div>
          <dt>Maximum</dt>
          <dd>{withUnit(statistics.max)}</dd>
        </div>
        <div>
          <dt>Standard deviation</dt>
          <dd>{deviation}</dd>
        </div>
      </dl>
      <p className="stats-note">Calculated by the data service from the monthly values of this result.</p>
    </section>
  );
}
