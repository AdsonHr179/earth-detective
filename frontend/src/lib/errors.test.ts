import { describe, expect, it } from 'vitest';
import { ApiError, InputError } from '../api/errors';
import { describeFailure, plainDetail } from './errors';

describe('describeFailure', () => {
  const cases: Array<[number, RegExp]> = [
    [404, /does not know the variable or region/],
    [409, /data changed while the analysis was running/],
    [422, /could not use these choices/],
    [502, /data provider did not answer correctly/],
    [503, /data service is not available right now/],
  ];

  it.each(cases)('maps HTTP %i to a human sentence with a way forward and Try again', (status, what) => {
    const failure = describeFailure(new ApiError(status, ''));
    expect(failure.what).toMatch(what);
    expect(failure.action.length).toBeGreaterThan(10);
    expect(failure.retryable).toBe(true);
    expect(failure.title).toBe('We could not get the data');
  });

  it('keeps the service message only when it is short plain text', () => {
    expect(describeFailure(new ApiError(503, 'Upstream provider unavailable')).detail).toBe(
      'Upstream provider unavailable',
    );
  });

  it('never dumps JSON, markup or very long messages', () => {
    expect(plainDetail('{"detail":"boom"}')).toBeNull();
    expect(plainDetail('[{"msg":"x"}]')).toBeNull();
    expect(plainDetail('<html>Bad gateway</html>')).toBeNull();
    expect(plainDetail('x'.repeat(201))).toBeNull();
    expect(plainDetail('   ')).toBeNull();
    const failure = describeFailure(new ApiError(502, '{"error":"upstream"}'));
    expect(failure.detail).toBeNull();
    expect(JSON.stringify(failure)).not.toContain('upstream');
  });

  it('explains other status codes without leaking internals', () => {
    const failure = describeFailure(new ApiError(500, ''));
    expect(failure.what).toContain('code 500');
    expect(failure.retryable).toBe(true);
  });

  it('explains a network failure', () => {
    const failure = describeFailure(new TypeError('Failed to fetch'));
    expect(failure.what).toBe('We could not reach the data service.');
    expect(failure.detail).toBeNull();
    expect(failure.retryable).toBe(true);
  });

  it('reports a problem with the choices as such, not retryable', () => {
    const failure = describeFailure(new InputError('Choose a valid date range before running the analysis.'));
    expect(failure.title).toBe('Check your choices');
    expect(failure.what).toBe('Choose a valid date range before running the analysis.');
    expect(failure.retryable).toBe(false);
  });

  it('has a safe fallback for unknown values', () => {
    expect(describeFailure('oops').what).toContain('Something went wrong');
    expect(describeFailure(undefined).retryable).toBe(true);
  });
});
