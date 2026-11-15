// TEST FIXTURE — not real data.
// Everything in this file exists only for automated tests. The app itself never
// generates synthetic values and never falls back to mock data.
import type {
  AvailabilityResponse,
  BackendAnalysisResponse,
  RegionRecord,
  VariableRecord,
} from '../api/client';

export const TEST_FIXTURE_NOTICE = 'TEST FIXTURE — not real data';

export const fixtureVariables: VariableRecord[] = [
  {
    id: 'air_temperature',
    name: 'Air temperature (TEST FIXTURE)',
    unit: 'unit-a',
    description: TEST_FIXTURE_NOTICE,
    source: 'TEST FIXTURE',
    group: 'Fixture group',
    trend_supported: true,
    circular: false,
  },
  {
    id: 'precipitation',
    name: 'Precipitation (TEST FIXTURE)',
    unit: 'unit-b',
    description: TEST_FIXTURE_NOTICE,
    source: 'TEST FIXTURE',
    group: 'Fixture group',
    trend_supported: true,
    circular: false,
  },
];

export const fixtureRegions: RegionRecord[] = [
  {
    id: 'ceara',
    name: 'Ceará (TEST FIXTURE)',
    country: 'Brazil',
    geometryName: 'fixture',
    geometryRef: 'fixture',
    boundaryStateCodes: ['23'],
    center: { latitude: -5, longitude: -39 },
  },
  {
    id: 'northeast_brazil',
    name: 'Northeast (TEST FIXTURE)',
    country: 'Brazil',
    geometryName: 'fixture',
    geometryRef: 'fixture',
    boundaryStateCodes: ['21', '22'],
    center: { latitude: -8, longitude: -40 },
  },
];

export function fixtureAvailability(variableId: string, regionId: string): AvailabilityResponse {
  return {
    variable_id: variableId,
    region_id: regionId,
    active_version: 'fixture-v1',
    available: true,
    start_date: '2000-01-01',
    end_date: '2024-12-31',
    warning: null,
  };
}

/** Builds a backend payload. Pass `null` entries to model missing observations. */
export function fixtureBackendAnalysis(
  overrides: Partial<BackendAnalysisResponse> & { values?: Array<number | null> } = {},
): BackendAnalysisResponse {
  const { values = [1, 2, 3], ...rest } = overrides;
  return {
    analysis_id: 'fixture-analysis',
    dataset_version: 'fixture-v1',
    method_version: 'fixture-method',
    variable_id: 'air_temperature',
    region_id: 'ceara',
    spatial_query: { type: 'Point', coordinates: [-39, -5] },
    requested_period: { start_date: '2015-01-01', end_date: '2023-12-31' },
    effective_period: { start_date: '2015-01-01', end_date: '2015-03-01' },
    source: 'TEST FIXTURE',
    product: 'fixture-product',
    source_url: 'https://example.invalid/fixture',
    series: values.map((value, index) => ({
      timestamp: `2015-0${index + 1}-01`,
      value,
      unit: 'unit-a',
      quality_flags: 'fixture',
    })),
    trend: {
      direction: 'increasing',
      applicable: true,
      slope_per_decade: 0.5,
      alpha: 0.05,
      significant: true,
      estimator: 'fixture-estimator',
      inference_method: 'fixture-inference',
      p_value: 0.01,
      confidence_interval: [0.1, 0.9],
    },
    quality: {
      sample_count: values.filter((value) => value !== null).length,
      expected_count: values.length,
      coverage_fraction: 1,
      warnings: ['fixture warning'],
    },
    explanation: { summary: 'Fixture summary.', limitations: 'Fixture limitations.' },
    ...rest,
  };
}

/** TEST FIXTURE statistics, not real values. */
export const fixtureStatistics = {
  count: 3,
  mean: 2,
  median: 2,
  min: 1,
  max: 3,
  standard_deviation: 1,
};

/** TEST FIXTURE projection, not a real forecast. */
export const fixtureForecast = {
  method: 'fixture-projection',
  points: [
    { timestamp: '2015-04-01', value: 3.5 },
    { timestamp: '2015-05-01', value: 4 },
  ],
  backtest_mae: 0.25,
  backtest_count: 6,
};

/** TEST FIXTURE list of saved results. */
export const fixtureSaved = [
  {
    analysis_id: 'saved-1',
    variable_id: 'air_temperature',
    region_id: 'ceara',
    product: 'fixture-product',
    start_date: '2015-01-01',
    end_date: '2023-12-31',
    retrieved_at: '2000-01-02T03:04:05+00:00',
  },
];
