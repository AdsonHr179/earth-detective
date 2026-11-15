import { describe, expect, it } from 'vitest';
import { adaptBackendAnalysis } from '../api/client';
import { fixtureBackendAnalysis } from '../test/fixtures';
import { buildCitation } from './citation';
import { buildBadges } from './quality';

// Values below are TEST FIXTURES, not real observations.
function analysis(overrides: Parameters<typeof fixtureBackendAnalysis>[0] = {}) {
  return adaptBackendAnalysis(fixtureBackendAnalysis(overrides));
}

const texts = (a: ReturnType<typeof analysis>) => buildBadges(a).map((badge) => badge.text);

describe('buildBadges', () => {
  it('always states that the reading is one point, with an icon and text', () => {
    const badges = buildBadges(analysis());
    expect(badges.map((b) => b.text)).toContain('One point, not an area average');
    expect(badges.every((b) => b.icon && b.text)).toBe(true);
  });

  it('flags a short period (under 10 years) with its length, and not a long one', () => {
    expect(texts(analysis({ effective_period: { start_date: '2015-01-01', end_date: '2023-12-31' } }))).toContain(
      'Short period (9 years)',
    );
    expect(
      texts(analysis({ effective_period: { start_date: '2010-01-01', end_date: '2023-12-31' } })).join('|'),
    ).not.toContain('Short period');
  });

  it('counts missing months and reports coverage', () => {
    const result = analysis({ values: [1, null, 3, null] });
    const text = texts(result);
    expect(text).toContain('2 months missing');
    expect(text).toContain('100% of months have data'); // coverage comes from the backend fraction
  });

  it('warns when coverage is below 90%', () => {
    const result = analysis({
      quality: {
        sample_count: 5,
        expected_count: 10,
        coverage_fraction: 0.5,
        warnings: [],
      },
    });
    const coverage = buildBadges(result).find((b) => b.id === 'coverage');
    expect(coverage).toMatchObject({ kind: 'warn', icon: 'triangle', text: '50% of months have data' });
  });

  it('describes significance for each case', () => {
    const base = fixtureBackendAnalysis().trend;
    const find = (trend: Partial<typeof base>) =>
      buildBadges(analysis({ trend: { ...base, ...trend } })).find((b) => b.id === 'significance');

    expect(find({ significant: true, p_value: 0.0004 })?.text).toBe('Significant (p < 0.001)');
    expect(find({ significant: false, p_value: 0.2 })?.text).toBe('Not significant (p = 0.20)');
    expect(find({ significant: null, p_value: null })?.text).toBe('Significance not reported');
    expect(find({ applicable: false, significant: null })?.text).toBe('No trend test for this variable');
  });

  it('warns when there are not enough valid months for a trend', () => {
    const base = fixtureBackendAnalysis().trend;
    const result = analysis({ trend: { ...base, slope_per_decade: null, direction: 'undetermined', significant: null } });
    expect(texts(result)).toContain('Not enough valid months for a trend');
  });
});

describe('buildCitation', () => {
  it('is made only of fields the backend returned', () => {
    const result = analysis({ retrieved_at: '2000-01-02T03:04:05+00:00' });
    const text = buildCitation(result, { variableName: 'Variable', regionName: 'Region' });

    expect(text).toContain('Earth Detective. Variable, Region, point 5.00° S, 39.00° W.');
    expect(text).toContain('Source: TEST FIXTURE (fixture-product).');
    expect(text).toContain('Dataset fixture-v1; method fixture-method; analysis id fixture-analysis.');
    expect(text).toContain('Data retrieved 2000-01-02 03:04 UTC.');
  });

  it('leaves out the retrieval time when the backend did not send one', () => {
    expect(buildCitation(analysis(), { variableName: 'Variable' })).not.toContain('retrieved');
  });
});
