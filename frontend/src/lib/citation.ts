import type { AnalysisResponse } from '../api/client';
import { formatCoordinatePair, formatRetrievedAt } from './format';

/** Plain-text citation made only of fields the backend returned. */
export function buildCitation(
  analysis: AnalysisResponse,
  names: { variableName: string; regionName?: string },
): string {
  const parts = [`Earth Detective. ${names.variableName}`];
  if (names.regionName) parts.push(names.regionName);
  if (analysis.spatial_query) {
    const [longitude, latitude] = analysis.spatial_query.coordinates;
    parts.push(`point ${formatCoordinatePair(latitude, longitude)}`);
  }
  const lines = [
    `${parts.join(', ')}.`,
    analysis.effective_start_date && analysis.effective_end_date
      ? `Period ${analysis.effective_start_date} to ${analysis.effective_end_date}.`
      : `Observed period unavailable. Requested ${analysis.start_date} to ${analysis.end_date}.`,
    `Source: ${analysis.source} (${analysis.product}).`,
    `Dataset ${analysis.dataset_version}; method ${analysis.method_version}; analysis id ${analysis.analysis_id}.`,
  ];
  if (analysis.retrieved_at) lines.push(`Data retrieved ${formatRetrievedAt(analysis.retrieved_at)}.`);
  return lines.join(' ');
}
