import { formatMonth, formatNumber, formatSigned, parseDate } from './format';

/**
 * Pure chart geometry. Nothing here invents data: a missing value (null) is never drawn as zero,
 * it breaks the line and is reported as a gap.
 */
export type ChartPoint = { date: string; value: number | null };
export type Margins = { top: number; right: number; bottom: number; left: number };
export type Pt = { x: number; y: number; date: string; value: number };
export type Segment = Pt[];
export type Gap = { x0: number; x1: number; startDate: string; endDate: string; months: number };

export type Scales = {
  x: (ms: number) => number;
  y: (value: number) => number;
  xDomain: [number, number];
  yDomain: [number, number];
  yTicks: number[];
  xTicks: Array<{ ms: number; x: number; label: string }>;
  plot: { left: number; right: number; top: number; bottom: number };
  /** Half the typical spacing between observations, in pixels (used to pad gaps). */
  halfStep: number;
};

export const MS_PER_YEAR = 365.2425 * 24 * 3600 * 1000;
const MS_PER_MONTH = 30 * 24 * 3600 * 1000;

type DatedPoint = { ms: number; value: number | null; date: string };

export function datedPoints(points: ChartPoint[]): DatedPoint[] {
  return points
    .map((point) => ({ ms: parseDate(point.date), value: point.value, date: point.date }))
    .filter((point) => Number.isFinite(point.ms))
    .sort((a, b) => a.ms - b.ms);
}

export function isValid(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

/** 1, 2 or 5 times a power of ten, at least `span / targetTicks`. */
export function niceStep(span: number, targetTicks = 5): number {
  const raw = span / Math.max(targetTicks, 1);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function niceDomain(min: number, max: number, targetTicks = 5) {
  let lo = min;
  let hi = max;
  if (hi - lo < 1e-9) {
    const pad = Math.abs(lo) > 1 ? Math.abs(lo) * 0.05 : 1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep(hi - lo, targetTicks);
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step * 1e-6; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return { min: Number(start.toFixed(10)), max: Number(end.toFixed(10)), step, ticks };
}

/** January 1st of calendar years, spaced so that at most `maxTicks` labels fit. */
export function yearTicks(startMs: number, endMs: number, maxTicks: number): number[] {
  const first = new Date(startMs).getUTCFullYear();
  const last = new Date(endMs).getUTCFullYear();
  const years = Math.max(last - first, 1);
  const step = [1, 2, 5, 10, 20, 25, 50].find((candidate) => years / candidate <= maxTicks) ?? 100;
  const ticks: number[] = [];
  for (let year = Math.ceil(first / step) * step; year <= last; year += step) {
    const ms = Date.UTC(year, 0, 1);
    if (ms >= startMs - 1 && ms <= endMs + 1) ticks.push(ms);
  }
  return ticks;
}

export type ScaleOptions = {
  width: number;
  height: number;
  margins: Margins;
  /** Circular variables (for example wind direction) use a fixed 0-360 axis. */
  circular?: boolean;
  /** Extra x values the axis must cover (selected period bounds). */
  xExtent?: number[];
  /** Extra y values the axis must cover (band edges, baseline). */
  yExtent?: number[];
};

/** Returns null when there is nothing to place (no valid dated value). */
export function buildScales(points: ChartPoint[], options: ScaleOptions): Scales | null {
  const dated = datedPoints(points);
  const valid = dated.filter((point) => isValid(point.value));
  if (valid.length === 0) return null;

  const { width, height, margins, circular = false } = options;
  const xs = [...dated.map((point) => point.ms), ...(options.xExtent ?? []).filter(Number.isFinite)];
  const xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  if (xMax === xMin) xMax = xMin + MS_PER_MONTH;

  const ys = [...valid.map((point) => point.value as number), ...(options.yExtent ?? []).filter(Number.isFinite)];
  const domain = circular
    ? { min: 0, max: 360, ticks: [0, 90, 180, 270, 360] }
    : niceDomain(Math.min(...ys), Math.max(...ys));

  const plot = {
    left: margins.left,
    right: width - margins.right,
    top: margins.top,
    bottom: height - margins.bottom,
  };
  const x = (ms: number) => plot.left + ((ms - xMin) / (xMax - xMin)) * (plot.right - plot.left);
  const y = (value: number) =>
    plot.bottom - ((value - domain.min) / (domain.max - domain.min)) * (plot.bottom - plot.top);

  const maxLabels = Math.max(2, Math.floor((plot.right - plot.left) / 64));
  const xTicks = yearTicks(xMin, xMax, maxLabels).map((ms) => ({
    ms,
    x: x(ms),
    label: String(new Date(ms).getUTCFullYear()),
  }));

  const steps = dated
    .slice(1)
    .map((point, index) => point.ms - dated[index].ms)
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  const typicalStep = steps.length ? steps[Math.floor(steps.length / 2)] : MS_PER_MONTH;
  const halfStep = Math.abs(x(xMin + typicalStep) - x(xMin)) / 2;

  return {
    x,
    y,
    xDomain: [xMin, xMax],
    yDomain: [domain.min, domain.max],
    yTicks: domain.ticks,
    xTicks,
    plot,
    halfStep,
  };
}

/**
 * Splits the points into drawable runs. A null (or non-finite) value ends the run, so the line
 * is never drawn across a gap and a missing value is never treated as zero.
 * For circular variables the run also ends where the angle wraps (more than 180 degrees apart).
 */
export function buildSegments(
  points: ChartPoint[],
  scales: Pick<Scales, 'x' | 'y'>,
  options: { circular?: boolean } = {},
): Segment[] {
  const segments: Segment[] = [];
  let current: Segment = [];
  let previous: number | null = null;
  const flush = () => {
    if (current.length > 0) segments.push(current);
    current = [];
  };

  for (const point of datedPoints(points)) {
    if (!isValid(point.value)) {
      flush();
      previous = null;
      continue;
    }
    if (options.circular && previous !== null && Math.abs(point.value - previous) > 180) {
      flush();
    }
    current.push({ x: scales.x(point.ms), y: scales.y(point.value), date: point.date, value: point.value });
    previous = point.value;
  }
  flush();
  return segments;
}

const coord = (n: number) => String(Math.round(n * 10) / 10);

/** SVG path for runs of two or more points; one 'M' per run. Single points are not part of the path. */
export function segmentsToPath(segments: Segment[]): string {
  return segments
    .filter((segment) => segment.length >= 2)
    .map((segment) => segment.map((p, index) => `${index === 0 ? 'M' : 'L'}${coord(p.x)} ${coord(p.y)}`).join(' '))
    .join(' ');
}

/** Runs with a single point cannot form a line; they are drawn as dots so they are not lost. */
export function isolatedPoints(segments: Segment[]): Pt[] {
  return segments.filter((segment) => segment.length === 1).map((segment) => segment[0]);
}

/** Runs of consecutive null observations, as pixel ranges padded by half an observation step. */
export function findGaps(points: ChartPoint[], scales: Pick<Scales, 'x' | 'halfStep'>): Gap[] {
  const dated = datedPoints(points);
  const gaps: Gap[] = [];
  let start = -1;
  for (let i = 0; i <= dated.length; i += 1) {
    const missing = i < dated.length && !isValid(dated[i].value);
    if (missing && start < 0) start = i;
    if (!missing && start >= 0) {
      const first = dated[start];
      const last = dated[i - 1];
      gaps.push({
        x0: scales.x(first.ms) - scales.halfStep,
        x1: scales.x(last.ms) + scales.halfStep,
        startDate: first.date,
        endDate: last.date,
        months: i - start,
      });
      start = -1;
    }
  }
  return gaps;
}

export function countMissing(points: ChartPoint[]): number {
  return points.filter((point) => !isValid(point.value)).length;
}

export type TrendLine = { x1: number; y1: number; x2: number; y2: number };

/**
 * The reported slope drawn through the mean of the plotted values, across the valid observations.
 * This is where an ordinary least-squares line passes; the slope itself comes from the backend.
 * Returns null when there is no slope or fewer than two valid values.
 */
export function trendLine(
  points: ChartPoint[],
  ratePerDecade: number | null,
  scales: Pick<Scales, 'x' | 'y'>,
): TrendLine | null {
  if (!isValid(ratePerDecade)) return null;
  const valid = datedPoints(points).filter((point) => isValid(point.value));
  if (valid.length < 2) return null;
  const meanMs = valid.reduce((sum, point) => sum + point.ms, 0) / valid.length;
  const meanValue = valid.reduce((sum, point) => sum + (point.value as number), 0) / valid.length;
  const perMs = ratePerDecade / 10 / MS_PER_YEAR;
  const at = (ms: number) => meanValue + perMs * (ms - meanMs);
  const first = valid[0].ms;
  const last = valid[valid.length - 1].ms;
  return { x1: scales.x(first), y1: scales.y(at(first)), x2: scales.x(last), y2: scales.y(at(last)) };
}

/** The most recent valid observation within [startMs, endMs]. */
export function lastValidPoint(points: ChartPoint[], startMs: number, endMs: number) {
  const valid = datedPoints(points).filter(
    (point) => isValid(point.value) && point.ms >= startMs && point.ms <= endMs,
  );
  if (valid.length === 0) return null;
  const last = valid[valid.length - 1];
  return { date: last.date, ms: last.ms, value: last.value as number };
}

export type SeriesDescription = {
  slopeUnit?: string;
  inferenceStatus?: string;
  variableName: string;
  regionName?: string;
  unit: string;
  points: ChartPoint[];
  ratePerDecade: number | null;
  significant: boolean | null;
  applicable: boolean;
};

/** Text alternative for the chart: what is plotted, the range, the trend and the gaps. */
export function describeSeries(input: SeriesDescription): string {
  const dated = datedPoints(input.points);
  const valid = dated.filter((point) => isValid(point.value));
  const where = input.regionName ? ` in ${input.regionName}` : '';
  if (dated.length === 0 || valid.length === 0) {
    return `${input.variableName}${where}: no monthly values are available, so no line is drawn.`;
  }
  const values = valid.map((point) => point.value as number);
  const parts = [
    `${input.variableName}${where}, monthly values from ${formatMonth(dated[0].ms)} to ${formatMonth(dated[dated.length - 1].ms)}.`,
    `Values range from ${formatNumber(Math.min(...values))} to ${formatNumber(Math.max(...values))} ${input.unit}.`,
  ];
  if (input.inferenceStatus === 'insufficient_data') {
    parts.push('No trend could be estimated from the available observations.');
  } else if (!input.applicable) {
    parts.push('No linear trend is calculated for this variable.');
  } else if (isValid(input.ratePerDecade)) {
    const signal =
      input.inferenceStatus && input.inferenceStatus !== 'validated'
        ? 'descriptive only; inference not validated'
        : input.significant === null
        ? 'significance not reported'
        : input.significant
          ? 'statistically significant'
          : 'not statistically significant';
    parts.push(`Trend ${formatSigned(input.ratePerDecade)} ${input.slopeUnit || `${input.unit} per decade`}, ${signal}.`);
  } else {
    parts.push('No trend could be estimated.');
  }
  const missing = countMissing(input.points);
  parts.push(
    missing === 0
      ? 'No months are missing.'
      : `${missing} of ${dated.length} months have no data and are shown as hatched gaps.`,
  );
  return parts.join(' ');
}
