import { ApiError } from './errors';

export type VariableRecord = {
  id: string;
  name: string;
  unit: string;
  description: string;
  source: string;
  group: string;
  trend_supported: boolean;
  circular: boolean;
};

export type RegionRecord = {
  id: string;
  name: string;
  country: string;
  geometryName: string;
  geometryRef: string;
  boundaryStateCodes: string[];
  center: {
    latitude: number;
    longitude: number;
  };
};

export type SavedAnalysisSummary = {
  analysis_id: string;
  variable_id: string;
  region_id: string;
  product: string;
  start_date: string;
  end_date: string;
  retrieved_at: string;
};

export type AnalysisRequest = {
  variable_id: string;
  region_id: string;
  start_date: string;
  end_date: string;
  dataset_version?: string | null;
  spatial_query?: GeoJSONPoint | null;
};

export type AvailabilityResponse = {
  variable_id: string;
  region_id: string;
  active_version: string;
  available: boolean;
  start_date: string | null;
  end_date: string | null;
  warning: string | null;
};

export type AnalysisPoint = {
  date: string;
  value: number | null;
  aggregation: 'monthly' | 'annual_mean';
};

export type ConfidenceBandPoint = {
  date: string;
  low: number;
  high: number;
};

export type GeoJSONPoint = {
  type: 'Point';
  coordinates: [number, number];
};

export type DescriptiveStatistics = {
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  standard_deviation: number | null;
};

export type MonthlyForecast = {
  method: string;
  points: Array<{ timestamp: string; value: number }>;
  backtest_mae: number | null;
  backtest_count: number;
};

export type InferenceStatus = 'validated' | 'descriptive' | 'insufficient_data' | 'unsupported';

export type AnalysisResponse = {
  analysis_id: string;
  variable_id: string;
  region_id: string;
  spatial_query?: GeoJSONPoint | null;
  unit: string;
  aggregation: string;
  dataset_version: string;
  method_version: string;
  start_date: string;
  end_date: string;
  effective_period: string;
  /** Effective period as separate ISO dates (same period as `effective_period`). */
  effective_start_date: string | null;
  effective_end_date: string | null;
  provenance: string;
  source: string;
  product: string;
  source_url: string;
  /** When the backend retrieved the data from the provider; null if the backend did not say. */
  retrieved_at: string | null;
  /** The backend's own statement of what the result does not cover; empty if absent. */
  limitations: string;
  warnings: string[];
  coverage: number;
  valid_observations: number;
  trend: {
    inference_status: InferenceStatus | 'legacy';
    inference_reason: string | null;
    slope_unit: string;
    direction: 'increasing' | 'decreasing' | 'stable' | 'undetermined';
    applicable: boolean;
    rate_per_decade: number | null;
    alpha: number;
    significant: boolean | null;
    estimator: string;
    inference_method: string;
    p_value: number | null;
    confidence_interval: [number, number] | null;
    explanation: string;
  };
  quality: {
    provider_metadata: Record<string, unknown> | null;
    missing_values: number;
    coverage: number;
    hourly_coverage: number | null;
    insufficient_series: boolean;
  };
  chart_points: AnalysisPoint[];
  annual_points: AnalysisPoint[];
  confidence_band: ConfidenceBandPoint[];
  statistics: DescriptiveStatistics | null;
  forecast: MonthlyForecast | null;
};

export type BackendAnalysisResponse = {
  analysis_id: string;
  dataset_version: string;
  method_version: string;
  variable_id: string;
  region_id: string;
  spatial_query?: GeoJSONPoint | null;
  requested_period: { start_date: string; end_date: string };
  effective_period: { start_date: string | null; end_date: string | null };
  source: string;
  product: string;
  source_url: string;
  retrieved_at?: string | null;
  series: Array<{
    timestamp: string;
    value: number | null;
    unit: string;
    quality_flags: string;
    coverage_fraction?: number | null;
  }>;
  trend: {
    inference_status?: InferenceStatus;
    inference_reason?: string | null;
    slope_unit?: string | null;
    direction: AnalysisResponse['trend']['direction'];
    applicable?: boolean;
    slope_per_decade: number | null;
    alpha: number;
    significant: boolean | null;
    estimator: string;
    inference_method: string;
    p_value: number | null;
    confidence_interval: [number, number] | null;
  };
  quality: {
    provider_metadata?: Record<string, unknown> | null;
    sample_count: number;
    expected_count: number;
    coverage_fraction: number;
    hourly_coverage_fraction?: number;
    warnings: string[];
  };
  explanation: { summary: string; limitations: string };
  statistics?: DescriptiveStatistics | null;
  forecast?: MonthlyForecast | null;
};

/** Plain text from the backend's `detail` field (a string, or a list of validation items). */
function detailText(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (typeof item === 'object' && item !== null && 'msg' in item ? String(item.msg) : ''))
      .filter(Boolean)
      .join('; ');
  }
  return '';
}

/**
 * Reads an error response. The newer `error: { code, message }` shape wins when present;
 * the older `detail` field stays as a fallback.
 */
export async function getApiError(response: Response): Promise<ApiError> {
  let detail = '';
  let code: string | undefined;
  try {
    const body = (await response.json()) as { detail?: unknown; error?: unknown };
    const structured = body.error;
    if (typeof structured === 'object' && structured !== null) {
      const fields = structured as { code?: unknown; message?: unknown };
      if (typeof fields.code === 'string' && fields.code) code = fields.code;
      if (typeof fields.message === 'string') detail = fields.message;
    }
    if (!detail) detail = detailText(body.detail);
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
  }

  return new ApiError(
    response.status,
    detail,
    detail || `Request failed (${response.status} ${response.statusText})`,
    code,
  );
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw await getApiError(response);
  }

  return (await response.json()) as T;
}

function isVariableRecord(value: unknown): value is VariableRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.unit === 'string' &&
    typeof record.description === 'string' &&
    typeof record.source === 'string' &&
    typeof record.group === 'string' &&
    typeof record.trend_supported === 'boolean' &&
    typeof record.circular === 'boolean'
  );
}

export function adaptBackendAnalysis(result: BackendAnalysisResponse): AnalysisResponse {
  const chartPoints = result.series.map((point) => ({
    date: point.timestamp,
    value: point.value,
    aggregation: 'monthly' as const,
  }));
  const validObservations = chartPoints.filter((point) => point.value !== null).length;
  const coverage = result.quality.coverage_fraction * 100;
  const statuses: readonly string[] = ['validated', 'descriptive', 'insufficient_data', 'unsupported'];
  const inferenceStatus = result.trend.inference_status && statuses.includes(result.trend.inference_status)
    && (result.trend.inference_reason === null || typeof result.trend.inference_reason === 'string')
    ? result.trend.inference_status : 'legacy';
  const validated = inferenceStatus === 'validated';
  const applicable = result.trend.applicable ?? true;
  const magnitudeAllowed = applicable && validObservations > 0 && inferenceStatus !== 'insufficient_data' && inferenceStatus !== 'unsupported';
  const slope = magnitudeAllowed && Number.isFinite(result.trend.slope_per_decade)
    ? result.trend.slope_per_decade : null;
  const inferenceAllowed = validated && slope !== null;

  return {
    analysis_id: result.analysis_id,
    variable_id: result.variable_id,
    region_id: result.region_id,
    spatial_query: result.spatial_query ?? null,
    unit: result.series[0]?.unit ?? '',
    aggregation: 'monthly',
    dataset_version: result.dataset_version,
    method_version: result.method_version,
    start_date: result.requested_period.start_date,
    end_date: result.requested_period.end_date,
    effective_period: result.effective_period.start_date && result.effective_period.end_date
      ? `${result.effective_period.start_date} to ${result.effective_period.end_date}` : 'No valid observed period',
    effective_start_date: result.effective_period.start_date,
    effective_end_date: result.effective_period.end_date,
    provenance: `${result.source} · ${result.product} · ${result.source_url}`,
    source: result.source,
    product: result.product,
    source_url: result.source_url,
    retrieved_at: result.retrieved_at ?? null,
    limitations: result.explanation.limitations,
    warnings: result.quality.warnings,
    coverage,
    valid_observations: validObservations,
    trend: {
      inference_status: inferenceStatus,
      inference_reason: inferenceStatus === 'legacy'
        ? 'Legacy analysis: inference was not validated under contract V1. The saved method version is preserved.'
        : result.trend.inference_reason ?? (validated ? null : 'The service did not provide a restriction reason.'),
      slope_unit: result.trend.slope_unit?.trim() || `${result.series[0]?.unit ?? ''} per decade`.trim(),
      direction: result.trend.direction,
      applicable,
      rate_per_decade: slope,
      alpha: result.trend.alpha,
      significant: inferenceAllowed ? result.trend.significant : null,
      estimator: result.trend.estimator,
      inference_method: result.trend.inference_method,
      p_value: inferenceAllowed ? result.trend.p_value : null,
      confidence_interval: inferenceAllowed ? result.trend.confidence_interval : null,
      explanation: `${result.explanation.summary} ${result.explanation.limitations}`,
    },
    quality: {
      provider_metadata: result.quality.provider_metadata ?? null,
      missing_values: result.quality.expected_count - validObservations,
      coverage,
      hourly_coverage:
        result.quality.hourly_coverage_fraction === undefined
          ? null
          : result.quality.hourly_coverage_fraction * 100,
      insufficient_series: slope === null,
    },
    chart_points: chartPoints,
    annual_points: [],
    confidence_band: [],
    statistics: result.statistics ?? null,
    forecast: result.forecast ?? null,
  };
}

/**
 * The catalog is the union of `/variables` and `/nasa/variables`. If one of the two fails, the other
 * still fills the catalog; only when both fail (or both are empty) is it an error. Ids are unique.
 */
export async function fetchVariables(signal?: AbortSignal): Promise<VariableRecord[]> {
  const requests = await Promise.allSettled([
    requestJson<unknown>('/api/v1/variables', { signal }),
    requestJson<unknown>('/api/v1/nasa/variables', { signal }),
  ]);
  const variables: VariableRecord[] = [];
  const seen = new Set<string>();
  for (const result of requests) {
    if (result.status === 'fulfilled' && Array.isArray(result.value) && result.value.every(isVariableRecord)) {
      for (const record of result.value) {
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        variables.push(record);
      }
    }
  }
  if (variables.length === 0) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const failure = requests.find((result) => result.status === 'rejected');
    throw failure?.reason ?? new Error('The backend returned no supported variables.');
  }
  return variables;
}

export async function fetchRegions(signal?: AbortSignal): Promise<RegionRecord[]> {
  const regions = await requestJson<RegionRecord[]>('/api/v1/regions', { signal });
  if (
    !Array.isArray(regions) ||
    regions.some(
      (region) =>
        !region ||
        !Number.isFinite(region.center?.latitude) ||
        !Number.isFinite(region.center?.longitude) ||
        !Array.isArray(region.boundaryStateCodes) ||
        region.boundaryStateCodes.some((code) => !/^\d{2}$/.test(code)),
    )
  ) {
    throw new Error('The region API response is missing map coordinates or IBGE boundary codes. Restart the backend to load the updated catalog.');
  }
  return regions;
}

export async function fetchAvailability(
  variableId: string,
  regionId: string,
  signal?: AbortSignal,
): Promise<AvailabilityResponse> {
  const query = new URLSearchParams({ variable_id: variableId, region_id: regionId });
  return requestJson<AvailabilityResponse>(`/api/v1/availability?${query}`, { signal });
}

export async function fetchSavedAnalyses(signal?: AbortSignal): Promise<SavedAnalysisSummary[]> {
  return requestJson<SavedAnalysisSummary[]>('/api/v1/analyses', { signal });
}

export async function fetchSavedAnalysis(id: string, signal?: AbortSignal): Promise<AnalysisResponse> {
  const result = await requestJson<BackendAnalysisResponse>(`/api/v1/analyses/${encodeURIComponent(id)}`, {
    signal,
  });
  return adaptBackendAnalysis(result);
}

export async function requestAnalysis(
  payload: AnalysisRequest,
  signal?: AbortSignal,
): Promise<AnalysisResponse> {
  const result = await requestJson<BackendAnalysisResponse>('/api/v1/analyses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  return adaptBackendAnalysis(result);
}

export async function exportAnalysisCsv(analysis: AnalysisResponse): Promise<void> {
  const response = await fetch(`/api/v1/analyses/${encodeURIComponent(analysis.analysis_id)}/export`);
  if (!response.ok) {
    throw await getApiError(response);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${analysis.variable_id}-${analysis.region_id}-analysis.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
