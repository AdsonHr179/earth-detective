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
  provenance: string;
  warnings: string[];
  coverage: number;
  valid_observations: number;
  trend: {
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

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

type BackendAnalysisResponse = {
  analysis_id: string;
  dataset_version: string;
  method_version: string;
  variable_id: string;
  region_id: string;
  spatial_query?: GeoJSONPoint | null;
  requested_period: { start_date: string; end_date: string };
  effective_period: { start_date: string; end_date: string };
  source: string;
  product: string;
  source_url: string;
  series: Array<{
    timestamp: string;
    value: number | null;
    unit: string;
    quality_flags: string;
    coverage_fraction?: number | null;
  }>;
  trend: {
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

async function getApiError(response: Response): Promise<Error> {
  let detail = '';
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === 'string') {
      detail = body.detail;
    } else if (Array.isArray(body.detail)) {
      detail = body.detail
        .map((item) => (typeof item === 'object' && item !== null && 'msg' in item ? String(item.msg) : ''))
        .filter(Boolean)
        .join('; ');
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
  }

  return new Error(detail || `Request failed (${response.status} ${response.statusText})`);
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(input), init);
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

function adaptBackendAnalysis(result: BackendAnalysisResponse): AnalysisResponse {
  const chartPoints = result.series.map((point) => ({
    date: point.timestamp,
    value: point.value,
    aggregation: 'monthly' as const,
  }));
  const validObservations = chartPoints.filter((point) => point.value !== null).length;
  const coverage = result.quality.coverage_fraction * 100;

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
    effective_period: `${result.effective_period.start_date} to ${result.effective_period.end_date}`,
    provenance: `${result.source} · ${result.product} · ${result.source_url}`,
    warnings: result.quality.warnings,
    coverage,
    valid_observations: validObservations,
    trend: {
      direction: result.trend.direction,
      applicable: result.trend.applicable ?? true,
      rate_per_decade: result.trend.slope_per_decade,
      alpha: result.trend.alpha,
      significant: result.trend.significant,
      estimator: result.trend.estimator,
      inference_method: result.trend.inference_method,
      p_value: result.trend.p_value,
      confidence_interval: result.trend.confidence_interval,
      explanation: `${result.explanation.summary} ${result.explanation.limitations}`,
    },
    quality: {
      missing_values: result.quality.expected_count - validObservations,
      coverage,
      hourly_coverage:
        result.quality.hourly_coverage_fraction === undefined
          ? null
          : result.quality.hourly_coverage_fraction * 100,
      insufficient_series: result.trend.slope_per_decade === null,
    },
    chart_points: chartPoints,
    annual_points: [],
    confidence_band: [],
    statistics: result.statistics ?? null,
    forecast: result.forecast ?? null,
  };
}

export async function fetchVariables(signal?: AbortSignal): Promise<VariableRecord[]> {
  const requests = await Promise.allSettled([
    requestJson<unknown>('/api/v1/variables', { signal }),
    requestJson<unknown>('/api/v1/nasa/variables', { signal }),
  ]);
  const variables: VariableRecord[] = [];
  for (const result of requests) {
    if (result.status === 'fulfilled' && Array.isArray(result.value) && result.value.every(isVariableRecord)) {
      variables.push(...result.value);
    }
  }
  if (variables.length === 0) {
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

export async function fetchSavedAnalysis(id: string): Promise<AnalysisResponse> {
  const result = await requestJson<BackendAnalysisResponse>(`/api/v1/analyses/${encodeURIComponent(id)}`);
  return adaptBackendAnalysis(result);
}

export async function requestAnalysis(payload: AnalysisRequest): Promise<AnalysisResponse> {
  const result = await requestJson<BackendAnalysisResponse>('/api/v1/analyses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return adaptBackendAnalysis(result);
}

export async function exportAnalysisCsv(analysis: AnalysisResponse): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/analyses/${encodeURIComponent(analysis.analysis_id)}/export`));
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
