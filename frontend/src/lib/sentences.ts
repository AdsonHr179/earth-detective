import { formatSigned } from './format';

export type TrendFields = {
  inference_status?: 'validated' | 'descriptive' | 'insufficient_data' | 'unsupported' | 'legacy';
  slope_unit?: string;
  direction: 'increasing' | 'decreasing' | 'stable' | 'undetermined';
  applicable: boolean;
  significant: boolean | null;
  rate_per_decade: number | null;
  alpha: number;
};

/** Shown when the data and method cannot identify a trend. It never says that nothing changed. */
export const INCONCLUSIVE_SENTENCE =
  'The data and method did not give enough evidence to identify a trend at this level.';
export const NOT_APPLICABLE_SENTENCE =
  'A linear trend is not calculated for this variable, so no rate per decade is shown.';

/**
 * One-line reading of the result, built from a fixed template and the fields the backend returned
 * (direction, significant, applicable). It adds no causal claim and no number of its own.
 */
export function trendSentence(trend: TrendFields, subject: string): string {
  if (trend.inference_status === 'insufficient_data') return 'A trend cannot be estimated from the available observations for this period.';
  if (!trend.applicable) return NOT_APPLICABLE_SENTENCE;
  if (trend.rate_per_decade === null) return INCONCLUSIVE_SENTENCE;
  if (trend.inference_status !== 'validated') {
    const way = trend.rate_per_decade > 0 ? 'upward' : trend.rate_per_decade < 0 ? 'downward' : 'flat';
    return `The descriptive slope for ${subject} is ${way}. Statistical inference has not been validated for this analysis.`;
  }
  if (trend.direction === 'stable' && trend.rate_per_decade === 0) {
    return `The fitted slope for ${subject} is essentially flat over this period. This describes this point and period only.`;
  }

  const way = trend.rate_per_decade >= 0 ? 'upward' : 'downward';
  if (trend.significant === null) {
    return `The estimated slope for ${subject} is ${way}, but the service did not report a significance test, so treat it as unconfirmed.`;
  }
  if (trend.significant) {
    const article = way === 'upward' ? 'an' : 'a';
    return `${subject} shows ${article} ${way} trend that is statistically significant at α = ${trend.alpha}.`;
  }
  return `${subject} leans ${way}, but this is not statistically significant at α = ${trend.alpha}. This does not establish stability or a cause.`;
}

export type Headline = {
  /** '+0.40', or an em dash when there is no estimate. */
  value: string;
  unit: string;
  hasNumber: boolean;
  /** Shown in a muted colour when the estimate is not a confirmed signal. */
  weak: boolean;
  /** Text for screen readers (the em dash alone says nothing). */
  spoken: string;
};

/** The big number: the reported rate per decade with its unit, or an honest dash. */
export function headlineNumber(trend: TrendFields, unit: string): Headline {
  if (trend.inference_status === 'insufficient_data') {
    return { value: '—', unit: '', hasNumber: false, weak: true, spoken: 'No trend estimate' };
  }
  if (!trend.applicable) {
    return { value: '—', unit: '', hasNumber: false, weak: true, spoken: 'No rate per decade for this variable' };
  }
  if (trend.rate_per_decade === null) {
    return { value: '—', unit: '', hasNumber: false, weak: true, spoken: 'No trend estimate' };
  }
  const value = formatSigned(trend.rate_per_decade);
  const slopeUnit = trend.slope_unit || `${unit} per decade`;
  return {
    value,
    unit: slopeUnit,
    hasNumber: true,
    weak: trend.inference_status !== 'validated' || trend.significant !== true,
    spoken: `${value} ${slopeUnit}`,
  };
}

/** The confidence interval of the slope, as text, or null when the backend gave none. */
export function formatInterval(interval: [number, number] | null, unit: string, completeUnit = false): string | null {
  if (!interval) return null;
  return `${formatSigned(interval[0])} to ${formatSigned(interval[1])} ${completeUnit ? unit : `${unit} per decade`}`;
}
