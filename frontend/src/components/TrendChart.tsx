import { useId } from 'react';
import { useElementWidth } from '../hooks/useElementWidth';
import {
  buildScales,
  buildSegments,
  describeSeries,
  findGaps,
  isolatedPoints,
  isValid,
  lastValidPoint,
  segmentsToPath,
  trendLine,
  type ChartPoint,
} from '../lib/chart';
import { formatMonth, formatNumber, formatSigned, parseDate } from '../lib/format';

export type BandPoint = { date: string; low: number; high: number };
export type Baseline = { value: number; label: string };

export type TrendChartProps = {
  points: ChartPoint[];
  unit: string;
  variableName: string;
  regionName?: string;
  /** Selected (effective) period as ISO dates. Observations outside it are drawn as grey history. */
  periodStart: string;
  periodEnd: string;
  trend: { applicable: boolean; rate_per_decade: number | null; significant: boolean | null };
  circular?: boolean;
  /** Only drawn when the backend returned real band values. */
  band?: BandPoint[];
  /** Only drawn when the backend returned a real baseline. */
  baseline?: Baseline | null;
};

const MARGINS = { top: 34, right: 12, bottom: 28, left: 46 };

function chartHeight(width: number) {
  return width < 520 ? Math.round(Math.max(220, width * 0.64)) : Math.round(Math.min(width * 0.46, 360));
}

type LegendItem = { key: string; swatch: string; label: string };

export default function TrendChart({
  points,
  unit,
  variableName,
  regionName,
  periodStart,
  periodEnd,
  trend,
  circular = false,
  band = [],
  baseline = null,
}: TrendChartProps) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const { ref, width } = useElementWidth<HTMLDivElement>(520);
  const W = Math.max(280, width);
  const H = chartHeight(W);

  const startMs = parseDate(periodStart);
  const endMs = parseDate(periodEnd);
  const hasBand = band.length > 0;
  const bandValues = band.flatMap((item) => [item.low, item.high]);
  const yExtent = [...bandValues, ...(baseline ? [baseline.value] : [])];
  const scales = buildScales(points, {
    width: W,
    height: H,
    margins: MARGINS,
    circular,
    xExtent: [startMs, endMs],
    yExtent,
  });

  const description = describeSeries({
    variableName,
    regionName,
    unit,
    points,
    ratePerDecade: trend.rate_per_decade,
    significant: trend.significant,
    applicable: trend.applicable,
  });

  if (!scales) {
    return (
      <figure className="chart-figure">
        <div ref={ref} className="chart-box">
          <p className="chart-empty" role="status">
            No monthly values to plot.
          </p>
        </div>
      </figure>
    );
  }

  const inPeriod = (point: ChartPoint) => {
    const ms = parseDate(point.date);
    return ms >= startMs && ms <= endMs;
  };
  const selectedPoints = points.filter(inPeriod);
  const hasHistory = points.some((point) => !inPeriod(point) && isValid(point.value));

  const selectedSegments = buildSegments(selectedPoints, scales, { circular });
  const historySegments = hasHistory ? buildSegments(points, scales, { circular }) : [];
  const gaps = findGaps(points, scales);
  const line = trend.applicable ? trendLine(selectedPoints, trend.rate_per_decade, scales) : null;
  const last = lastValidPoint(points, startMs, endMs);
  const { plot } = scales;

  const hatchId = `${reactId}-hatch`;
  const titleId = `${reactId}-title`;
  const descId = `${reactId}-desc`;

  let lastGapLabelX = -999;
  const gapLabels = gaps.filter((gap) => {
    const cx = (gap.x0 + gap.x1) / 2;
    if (cx - lastGapLabelX > 60 && cx > plot.left + 30 && cx < plot.right - 30) {
      lastGapLabelX = cx;
      return true;
    }
    return false;
  });

  const bandPath = hasBand
    ? (() => {
        const upper = band.map((item, index) => `${index === 0 ? 'M' : 'L'}${scales.x(parseDate(item.date))} ${scales.y(item.high)}`);
        const lower = [...band].reverse().map((item) => `L${scales.x(parseDate(item.date))} ${scales.y(item.low)}`);
        return `${upper.join(' ')} ${lower.join(' ')} Z`;
      })()
    : '';

  const trendLabel = line && isValid(trend.rate_per_decade) ? `Trend ${formatSigned(trend.rate_per_decade)} ${unit} per decade` : '';
  // The trend label and the last-point label sit on opposite sides of each other so they never overlap:
  // when the line ends above the last observation the trend label goes above it and the point label below.
  const lastY = last ? scales.y(last.value) : 0;
  const lineEndsAbove = line ? line.y2 <= lastY : true;
  const trendLabelAbove = line ? (lineEndsAbove ? line.y2 > plot.top + 14 : line.y2 > plot.bottom - 30) : true;
  const lastLabel = last ? `${formatMonth(last.ms)} · ${formatNumber(last.value)} ${unit}` : '';
  const lastBelow = last ? (lineEndsAbove ? lastY <= plot.bottom - 26 : lastY <= plot.top + 14) : false;

  const legend: LegendItem[] = [
    { key: 'sel', swatch: 'legend-swatch--selected', label: hasHistory ? 'Selected period' : 'Monthly values' },
    ...(hasHistory ? [{ key: 'hist', swatch: 'legend-swatch--history', label: 'History (outside the period)' }] : []),
    ...(line ? [{ key: 'trend', swatch: 'legend-swatch--trend', label: 'Trend (reported slope)' }] : []),
    ...(baseline ? [{ key: 'base', swatch: 'legend-swatch--baseline', label: baseline.label }] : []),
    ...(hasBand ? [{ key: 'band', swatch: 'legend-swatch--band', label: 'Uncertainty band' }] : []),
    ...(gaps.length > 0 ? [{ key: 'gap', swatch: 'legend-swatch--gap', label: 'No data' }] : []),
  ];

  return (
    <figure className="chart-figure">
      <div ref={ref} className="chart-box">
        <svg
          className="trend-chart"
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          role="img"
          aria-labelledby={`${titleId} ${descId}`}
        >
          <title id={titleId}>{`${variableName}${regionName ? `, ${regionName}` : ''}`}</title>
          <desc id={descId}>{description}</desc>
          <defs>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" className="chart-hatch-line" strokeWidth="1.6" />
            </pattern>
          </defs>

          {scales.yTicks.map((tick) => (
            <g key={`y${tick}`}>
              <line x1={plot.left} x2={plot.right} y1={scales.y(tick)} y2={scales.y(tick)} className="chart-grid" />
              <text x={plot.left - 6} y={scales.y(tick) + 4} textAnchor="end" className="chart-tick">
                {formatNumber(tick, Number.isInteger(tick) ? 0 : 1)}
              </text>
            </g>
          ))}
          <text x={plot.left - 6} y={plot.top - 16} textAnchor="end" className="chart-tick">
            {unit}
          </text>

          {scales.xTicks.map((tick) => (
            <g key={`x${tick.ms}`}>
              <line x1={tick.x} x2={tick.x} y1={plot.bottom} y2={plot.bottom + 4} className="chart-axis" />
              <text x={tick.x} y={plot.bottom + 18} textAnchor="middle" className="chart-tick">
                {tick.label}
              </text>
            </g>
          ))}
          <line x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} className="chart-axis" />
          <line x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} className="chart-axis" />

          {hasHistory ? (
            <>
              <rect
                x={scales.x(startMs)}
                y={plot.top}
                width={Math.max(scales.x(endMs) - scales.x(startMs), 0)}
                height={plot.bottom - plot.top}
                className="chart-focus"
              />
              <path
                d={`M${scales.x(startMs)} ${plot.top - 6}V${plot.top - 11}H${scales.x(endMs)}V${plot.top - 6}`}
                className="chart-bracket"
                fill="none"
              />
              <text x={(scales.x(startMs) + scales.x(endMs)) / 2} y={plot.top - 15} textAnchor="middle" className="chart-label">
                Selected period {formatMonth(startMs)} to {formatMonth(endMs)}
              </text>
            </>
          ) : null}

          {baseline ? (
            <>
              <line x1={plot.left} x2={plot.right} y1={scales.y(baseline.value)} y2={scales.y(baseline.value)} className="chart-baseline" />
              <text x={plot.left + 4} y={scales.y(baseline.value) - 5} className="chart-label chart-halo">
                {baseline.label}
              </text>
            </>
          ) : null}

          {gaps.map((gap) => (
            <rect
              key={`gap${gap.startDate}`}
              x={gap.x0}
              y={plot.top}
              width={Math.max(gap.x1 - gap.x0, 6)}
              height={plot.bottom - plot.top}
              fill={`url(#${hatchId})`}
              className="chart-gap"
            />
          ))}
          {gapLabels.map((gap) => (
            <text
              key={`gl${gap.startDate}`}
              x={(gap.x0 + gap.x1) / 2}
              y={plot.bottom - 7}
              textAnchor="middle"
              className="chart-label chart-halo"
            >
              no data
            </text>
          ))}

          {hasBand ? <path d={bandPath} className="chart-band" /> : null}
          {hasHistory ? <path d={segmentsToPath(historySegments)} className="chart-history" fill="none" /> : null}
          <path d={segmentsToPath(selectedSegments)} className="chart-selected" fill="none" />
          {isolatedPoints(selectedSegments).map((point) => (
            <circle key={`iso${point.date}`} cx={point.x} cy={point.y} r="3" className="chart-dot" />
          ))}

          {line ? (
            <>
              <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} className="chart-trend" />
              <text
                x={line.x2 - 4}
                y={trendLabelAbove ? line.y2 - 12 : line.y2 + 22}
                textAnchor="end"
                className="chart-label chart-halo chart-label--trend"
              >
                {trendLabel}
              </text>
            </>
          ) : null}

          {last ? (
            <>
              <circle cx={scales.x(last.ms)} cy={scales.y(last.value)} r="6" className="chart-last" />
              <text
                x={Math.min(scales.x(last.ms) - 9, plot.right)}
                y={scales.y(last.value) + (lastBelow ? 20 : -11)}
                textAnchor="end"
                className="chart-label chart-halo"
              >
                {lastLabel}
              </text>
            </>
          ) : null}
        </svg>
      </div>

      <ul className="chart-legend" aria-label="What each line means">
        {legend.map((item) => (
          <li key={item.key}>
            <i className={`legend-swatch ${item.swatch}`} aria-hidden="true" />
            {item.label}
          </li>
        ))}
      </ul>
      {line ? (
        <figcaption className="chart-note">
          The trend line uses the slope reported by the service and is drawn through the mean of the plotted values.
        </figcaption>
      ) : null}

    </figure>
  );
}
