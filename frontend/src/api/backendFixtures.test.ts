import { describe, expect, it } from 'vitest';
import descriptive from '../../../contracts/fixtures/descriptive.json';
import insufficient from '../../../contracts/fixtures/insufficient_data.json';
import unsupported from '../../../contracts/fixtures/unsupported.json';
import { adaptBackendAnalysis, type BackendAnalysisResponse } from './client';

// Complete SYNTHETIC contract fixtures published by B, never demonstration data.
describe('published B V1 fixtures at the integration boundary', () => {
  it.each([descriptive, insufficient, unsupported])('adapts $analysis_id without inventing evidence', (fixture) => {
    const result = adaptBackendAnalysis(fixture as unknown as BackendAnalysisResponse);
    expect(result.method_version).toBe(fixture.method_version);
    expect(result.trend.inference_status).toBe(fixture.trend.inference_status);
    expect(result.trend.inference_reason).toBe(fixture.trend.inference_reason);
    expect(result.trend.slope_unit).toBe(fixture.trend.slope_unit);
    expect(result.trend.rate_per_decade).toBe(fixture.trend.slope_per_decade);
    expect(result.trend.p_value).toBeNull();
    expect(result.trend.significant).toBeNull();
    expect(result.trend.confidence_interval).toBeNull();
  });
});
