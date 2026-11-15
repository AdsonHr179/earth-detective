import { describe, expect, it } from 'vitest';
import { adaptBackendAnalysis } from './client';
import { fixtureBackendAnalysis } from '../test/fixtures';

describe('adaptBackendAnalysis', () => {
  it('preserves null observations: absence never becomes 0', () => {
    const result = adaptBackendAnalysis(fixtureBackendAnalysis({ values: [1, null, 3, null] }));

    expect(result.chart_points.map((point) => point.value)).toEqual([1, null, 3, null]);
    expect(result.chart_points.some((point) => point.value === 0)).toBe(false);
    expect(result.valid_observations).toBe(2);
    expect(result.quality.missing_values).toBe(2);
  });

  it('keeps an all-null series all null', () => {
    const result = adaptBackendAnalysis(fixtureBackendAnalysis({ values: [null, null] }));

    expect(result.chart_points.every((point) => point.value === null)).toBe(true);
    expect(result.valid_observations).toBe(0);
  });
});
