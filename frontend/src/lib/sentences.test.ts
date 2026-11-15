import { describe, expect, it } from 'vitest';
import {
  headlineNumber,
  INCONCLUSIVE_SENTENCE,
  NOT_APPLICABLE_SENTENCE,
  trendSentence,
  type TrendFields,
} from './sentences';

// TEST FIXTURE values, not real results.
const DIRECTIONS: TrendFields['direction'][] = ['increasing', 'decreasing', 'stable', 'undetermined'];
const SIGNIFICANCE: Array<boolean | null> = [true, false, null];
const APPLICABLE = [true, false];

function trend(overrides: Partial<TrendFields>): TrendFields {
  return {
    direction: 'increasing',
    applicable: true,
    significant: true,
    rate_per_decade: 0.5,
    alpha: 0.05,
    ...overrides,
  };
}

describe('trendSentence', () => {
  const subject = 'Variable at this point';

  it('returns a non-empty one-liner for every direction x significant x applicable combination', () => {
    for (const direction of DIRECTIONS) {
      for (const significant of SIGNIFICANCE) {
        for (const applicable of APPLICABLE) {
          const text = trendSentence(trend({ direction, significant, applicable }), subject);
          expect(text.length, `${direction}/${significant}/${applicable}`).toBeGreaterThan(20);
          expect(text).not.toMatch(/undefined|null|NaN/);
        }
      }
    }
  });

  it('says a trend is not calculated when it is not applicable, whatever the other fields say', () => {
    for (const direction of DIRECTIONS) {
      expect(trendSentence(trend({ applicable: false, direction }), subject)).toBe(NOT_APPLICABLE_SENTENCE);
    }
  });

  it('uses the inconclusive sentence when the direction is undetermined or the rate is missing', () => {
    expect(trendSentence(trend({ direction: 'undetermined' }), subject)).toBe(INCONCLUSIVE_SENTENCE);
    expect(trendSentence(trend({ rate_per_decade: null }), subject)).toBe(INCONCLUSIVE_SENTENCE);
    expect(INCONCLUSIVE_SENTENCE).toBe(
      'The data and method did not give enough evidence to identify a trend at this level.',
    );
  });

  it('never claims that nothing changed', () => {
    for (const direction of DIRECTIONS) {
      for (const significant of SIGNIFICANCE) {
        for (const applicable of APPLICABLE) {
          const text = trendSentence(trend({ direction, significant, applicable }), subject);
          expect(text).not.toMatch(/no change|did not change|nothing (is )?changing|no trend\b/i);
        }
      }
    }
  });

  it('describes a significant rise and fall with the significance level', () => {
    expect(trendSentence(trend({ direction: 'increasing', significant: true }), subject)).toBe(
      'Variable at this point shows an upward trend that is statistically significant at α = 0.05.',
    );
    expect(trendSentence(trend({ direction: 'decreasing', significant: true }), subject)).toContain('downward trend');
  });

  it('keeps the wording cautious when the result is not significant or significance is missing', () => {
    const weak = trendSentence(trend({ direction: 'decreasing', significant: false }), subject);
    expect(weak).toContain('not statistically significant');
    expect(weak).toContain('natural variation');
    expect(trendSentence(trend({ significant: null }), subject)).toContain('did not report a significance test');
  });

  it('describes a flat fit without claiming absence of change in the world', () => {
    const text = trendSentence(trend({ direction: 'stable', rate_per_decade: 0 }), subject);
    expect(text).toContain('essentially flat');
    expect(text).toContain('this point and period only');
  });
});

describe('headlineNumber', () => {
  it('shows the signed rate with its unit and per decade', () => {
    expect(headlineNumber(trend({ rate_per_decade: 0.4 }), 'unit-a')).toMatchObject({
      value: '+0.40',
      unit: 'unit-a per decade',
      hasNumber: true,
      weak: false,
    });
    expect(headlineNumber(trend({ rate_per_decade: -12.34, direction: 'decreasing' }), 'unit-a').value).toBe(
      '−12.3',
    );
  });

  it('mutes the number when the result is not significant', () => {
    expect(headlineNumber(trend({ significant: false }), 'unit-a').weak).toBe(true);
    expect(headlineNumber(trend({ significant: null }), 'unit-a').weak).toBe(true);
  });

  it('shows a dash, never zero, when there is no estimate', () => {
    for (const t of [
      trend({ rate_per_decade: null }),
      trend({ direction: 'undetermined' }),
      trend({ applicable: false }),
    ]) {
      const headline = headlineNumber(t, 'unit-a');
      expect(headline.value).toBe('—');
      expect(headline.hasNumber).toBe(false);
      expect(headline.unit).toBe('');
    }
  });
});
