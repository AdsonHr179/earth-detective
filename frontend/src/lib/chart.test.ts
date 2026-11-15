import { describe, expect, it } from 'vitest';
import {
  buildScales,
  buildSegments,
  describeSeries,
  findGaps,
  isolatedPoints,
  niceDomain,
  niceStep,
  segmentsToPath,
  trendLine,
  yearTicks,
  type ChartPoint,
} from './chart';
import { parseDate } from './format';

// TEST FIXTURE values, not real observations.
const margins = { top: 10, right: 10, bottom: 10, left: 10 };
const options = { width: 110, height: 110, margins };

function monthly(values: Array<number | null>): ChartPoint[] {
  return values.map((value, index) => ({
    date: `2020-${String(index + 1).padStart(2, '0')}-01`,
    value,
  }));
}

describe('scales', () => {
  it('niceStep picks 1, 2, 5 times a power of ten', () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(7, 5)).toBe(2);
    expect(niceStep(2.2, 5)).toBe(0.5);
    expect(niceStep(0, 5)).toBe(1);
  });

  it('niceDomain covers the data with round ticks', () => {
    const domain = niceDomain(24.1, 29.3);
    expect(domain.min).toBeLessThanOrEqual(24.1);
    expect(domain.max).toBeGreaterThanOrEqual(29.3);
    expect(domain.ticks[0]).toBe(domain.min);
    expect(domain.ticks[domain.ticks.length - 1]).toBe(domain.max);
  });

  it('niceDomain widens a flat series so the axis is not degenerate', () => {
    const domain = niceDomain(5, 5);
    expect(domain.max).toBeGreaterThan(domain.min);
  });

  it('maps values to pixels: larger values are higher (smaller y)', () => {
    const scales = buildScales(monthly([1, 2, 3]), options);
    expect(scales).not.toBeNull();
    if (!scales) return;
    expect(scales.y(3)).toBeLessThan(scales.y(1));
    expect(scales.x(parseDate('2020-03-01'))).toBeGreaterThan(scales.x(parseDate('2020-01-01')));
    expect(scales.x(scales.xDomain[0])).toBeCloseTo(10);
    expect(scales.x(scales.xDomain[1])).toBeCloseTo(100);
  });

  it('returns null when there is no valid value to place', () => {
    expect(buildScales(monthly([null, null]), options)).toBeNull();
    expect(buildScales([], options)).toBeNull();
  });

  it('does not let null pull the axis towards zero', () => {
    const scales = buildScales(monthly([100, null, 102]), options);
    expect(scales?.yDomain[0]).toBeGreaterThan(50);
  });

  it('uses a fixed 0-360 axis for circular variables', () => {
    const scales = buildScales(monthly([10, 350]), { ...options, circular: true });
    expect(scales?.yDomain).toEqual([0, 360]);
    expect(scales?.yTicks).toEqual([0, 90, 180, 270, 360]);
  });

  it('yearTicks stays within the label budget', () => {
    const ticks = yearTicks(parseDate('2005-01-01'), parseDate('2023-12-01'), 6);
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks.length).toBeGreaterThan(1);
  });
});

describe('path generation with gaps', () => {
  const scales = buildScales(monthly([1, 2, null, 4, 5, null, null, 8]), options);
  if (!scales) throw new Error('fixture must produce scales');
  const points = monthly([1, 2, null, 4, 5, null, null, 8]);

  it('a null value breaks the line into separate segments', () => {
    const segments = buildSegments(points, scales);
    expect(segments.map((segment) => segment.length)).toEqual([2, 2, 1]);
  });

  it('never emits a point for a missing value, so null is never zero', () => {
    const segments = buildSegments(points, scales);
    const drawnDates = segments.flat().map((p) => p.date);
    expect(drawnDates).not.toContain('2020-03-01');
    expect(drawnDates).not.toContain('2020-06-01');
    expect(segments.flat().some((p) => p.value === 0)).toBe(false);
    // nothing is drawn at the y position of zero either (zero is below the axis domain)
    const zeroY = scales.y(0);
    expect(segments.flat().some((p) => Math.abs(p.y - zeroY) < 1e-6)).toBe(false);
  });

  it('the path has one M per run and no line across a gap', () => {
    const path = segmentsToPath(buildSegments(points, scales));
    expect(path.match(/M/g)).toHaveLength(2); // the single point is a dot, not a path
    expect(path.match(/L/g)).toHaveLength(2);
  });

  it('single observations are reported as isolated points', () => {
    const isolated = isolatedPoints(buildSegments(points, scales));
    expect(isolated.map((p) => p.date)).toEqual(['2020-08-01']);
  });

  it('an all-null series has no path', () => {
    const allNull = monthly([null, null, null]);
    expect(segmentsToPath(buildSegments(allNull, scales))).toBe('');
  });

  it('circular series break where the angle wraps', () => {
    const wrap = monthly([350, 355, 5, 10]);
    const wrapScales = buildScales(wrap, { ...options, circular: true });
    if (!wrapScales) throw new Error('fixture must produce scales');
    expect(buildSegments(wrap, wrapScales, { circular: true }).map((s) => s.length)).toEqual([2, 2]);
    expect(buildSegments(wrap, wrapScales).map((s) => s.length)).toEqual([4]);
  });

  it('reports each run of missing months as one gap', () => {
    const gaps = findGaps(points, scales);
    expect(gaps).toHaveLength(2);
    expect(gaps.map((gap) => gap.months)).toEqual([1, 2]);
    expect(gaps[1].startDate).toBe('2020-06-01');
    expect(gaps[1].x1).toBeGreaterThan(gaps[1].x0);
  });

  it('reports no gap when every value is present', () => {
    expect(findGaps(monthly([1, 2, 3]), scales)).toEqual([]);
  });
});

describe('trendLine', () => {
  const points = monthly([1, 2, 3, 4, 5, 6]);
  const scales = buildScales(points, options);
  if (!scales) throw new Error('fixture must produce scales');

  it('is null without a slope or with fewer than two values', () => {
    expect(trendLine(points, null, scales)).toBeNull();
    expect(trendLine(monthly([1, null, null]), 1, scales)).toBeNull();
  });

  it('rises for a positive slope and falls for a negative one', () => {
    const up = trendLine(points, 5, scales);
    const down = trendLine(points, -5, scales);
    expect(up && up.y2 < up.y1).toBe(true);
    expect(down && down.y2 > down.y1).toBe(true);
  });

  it('passes through the mean of the values', () => {
    const flat = trendLine(points, 0, scales);
    expect(flat?.y1).toBeCloseTo(scales.y(3.5));
    expect(flat?.y2).toBeCloseTo(scales.y(3.5));
  });
});

describe('describeSeries', () => {
  const base = {
    variableName: 'Variable',
    unit: 'unit-a',
    ratePerDecade: 0.5,
    significant: true,
    applicable: true,
  };

  it('summarises range, trend and gaps in text', () => {
    const text = describeSeries({ ...base, points: monthly([1, null, 3]) });
    expect(text).toContain('Values range from 1.00 to 3.00 unit-a.');
    expect(text).toContain('Trend +0.50 unit-a per decade, statistically significant.');
    expect(text).toContain('1 of 3 months have no data');
  });

  it('says so when there is nothing to draw', () => {
    expect(describeSeries({ ...base, points: monthly([null]) })).toContain('no line is drawn');
  });

  it('does not claim a trend for a non-applicable variable', () => {
    const text = describeSeries({ ...base, applicable: false, points: monthly([1, 2]) });
    expect(text).toContain('No linear trend is calculated');
    expect(text).not.toContain('Trend +');
  });
});
