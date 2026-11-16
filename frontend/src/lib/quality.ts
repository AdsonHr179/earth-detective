import type { AnalysisResponse } from '../api/client';
import { formatPValue, formatYears, periodYears } from './format';

export type BadgeKind = 'ok' | 'warn' | 'neutral';
export type BadgeIcon = 'check' | 'triangle' | 'circle' | 'diamond';
export type Badge = { id: string; kind: BadgeKind; icon: BadgeIcon; text: string };

export const SHORT_PERIOD_YEARS = 10;
export const GOOD_COVERAGE_PERCENT = 90;

type BadgeSource = Pick<
  AnalysisResponse,
  'coverage' | 'quality' | 'trend' | 'effective_start_date' | 'effective_end_date'
>;

/** Seals about how far the reading can be trusted. Every seal pairs an icon with text. */
export function buildBadges(analysis: BadgeSource): Badge[] {
  const badges: Badge[] = [];
  const { trend, quality } = analysis;

  const coverage = Math.round(analysis.coverage);
  badges.push({
    id: 'coverage',
    kind: coverage >= GOOD_COVERAGE_PERCENT ? 'ok' : 'warn',
    icon: coverage >= GOOD_COVERAGE_PERCENT ? 'check' : 'triangle',
    text: `${coverage}% of months have data`,
  });

  if (trend.inference_status === 'legacy') {
    badges.push({ id: 'significance', kind: 'warn', icon: 'triangle', text: 'Legacy inference not validated' });
  } else if (trend.inference_status === 'descriptive') {
    badges.push({ id: 'significance', kind: 'neutral', icon: 'circle', text: 'Descriptive estimate only' });
  } else if (trend.inference_status === 'insufficient_data' || trend.inference_status === 'unsupported') {
    badges.push({ id: 'significance', kind: 'warn', icon: 'triangle', text: trend.inference_status === 'unsupported' ? 'Inference unsupported' : 'Insufficient data for inference' });
  } else if (!trend.applicable) {
    badges.push({ id: 'significance', kind: 'neutral', icon: 'circle', text: 'No trend test for this variable' });
  } else if (trend.significant === null) {
    badges.push({ id: 'significance', kind: 'neutral', icon: 'circle', text: 'Significance not reported' });
  } else if (trend.significant) {
    badges.push({
      id: 'significance',
      kind: 'ok',
      icon: 'check',
      text: trend.p_value === null ? `Significant at α = ${trend.alpha}` : `Significant (${formatPValue(trend.p_value)})`,
    });
  } else {
    badges.push({
      id: 'significance',
      kind: 'warn',
      icon: 'circle',
      text: trend.p_value === null ? `Not significant at α = ${trend.alpha}` : `Not significant (${formatPValue(trend.p_value)})`,
    });
  }

  if (quality.missing_values > 0) {
    badges.push({
      id: 'missing',
      kind: 'warn',
      icon: 'triangle',
      text: `${quality.missing_values} month${quality.missing_values === 1 ? '' : 's'} missing`,
    });
  }

  if (trend.applicable && trend.rate_per_decade === null) {
    badges.push({ id: 'insufficient', kind: 'warn', icon: 'triangle', text: 'Not enough valid months for a trend' });
  }

  const years = periodYears(analysis.effective_start_date, analysis.effective_end_date);
  if (years > 0 && years < SHORT_PERIOD_YEARS) {
    badges.push({ id: 'short', kind: 'warn', icon: 'triangle', text: `Short period (${formatYears(years)})` });
  }

  badges.push({ id: 'point', kind: 'neutral', icon: 'diamond', text: 'One point, not an area average' });
  return badges;
}
