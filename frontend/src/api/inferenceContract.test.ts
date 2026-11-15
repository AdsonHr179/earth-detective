import { describe, expect, it } from 'vitest';
import { adaptBackendAnalysis } from './client';
import { fixtureBackendAnalysis } from '../test/fixtures';

// TEST FIXTURES ONLY: these numbers do not represent NASA observations.
describe('V1 inference presentation boundary', () => {
  const base = fixtureBackendAnalysis();
  it('keeps a descriptive magnitude but removes inferential evidence even in an inconsistent payload', () => {
    const result = adaptBackendAnalysis({ ...base, trend: { ...base.trend,
      inference_status: 'descriptive', inference_reason: 'Serial dependence not validated.',
      slope_unit: 'deg C per decade',
    } });
    expect(result.trend).toMatchObject({ inference_status: 'descriptive', rate_per_decade: 0.5,
      slope_unit: 'deg C per decade', significant: null, p_value: null, confidence_interval: null });
  });
  it.each(['insufficient_data', 'unsupported'] as const)('does not fabricate a magnitude for %s', (status) => {
    const result = adaptBackendAnalysis({ ...base, trend: { ...base.trend,
      inference_status: status, inference_reason: 'Fixture restriction.',
    } });
    expect(result.trend.rate_per_decade).toBeNull();
    expect(result.trend.significant).toBeNull();
    expect(result.trend.p_value).toBeNull();
    expect(result.trend.confidence_interval).toBeNull();
  });
  it('identifies legacy saved analyses without promoting their significance or changing the method version', () => {
    const legacy = structuredClone(base);
    delete legacy.trend.inference_status;
    delete legacy.trend.inference_reason;
    const result = adaptBackendAnalysis(legacy);
    expect(result.method_version).toBe('fixture-method');
    expect(result.trend.inference_status).toBe('legacy');
    expect(result.trend.inference_reason).toMatch(/not validated/i);
    expect(result.trend.significant).toBeNull();
    expect(result.trend.p_value).toBeNull();
    expect(result.trend.confidence_interval).toBeNull();
  });
  it('requires both new fields before trusting a validated status', () => {
    const incomplete = structuredClone(base);
    delete incomplete.trend.inference_reason;
    const result = adaptBackendAnalysis(incomplete);
    expect(result.trend.inference_status).toBe('legacy');
    expect(result.trend.significant).toBeNull();
  });
  it('keeps a missing effective period missing and never labels it null to null', () => {
    const result = adaptBackendAnalysis({ ...base, series: [],
      effective_period: { start_date: null, end_date: null } } as typeof base);
    expect(result.effective_start_date).toBeNull();
    expect(result.effective_period).toBe('No valid observed period');
    expect(result.trend.p_value).toBeNull();
  });
  it('preserves explicit validated evidence and null magnitude', () => {
    const result = adaptBackendAnalysis({ ...base, trend: { ...base.trend,
      inference_status: 'validated', inference_reason: null, slope_per_decade: null,
    } });
    expect(result.trend.inference_status).toBe('validated');
    expect(result.trend.rate_per_decade).toBeNull();
    expect(result.trend.p_value).toBeNull();
  });
});
