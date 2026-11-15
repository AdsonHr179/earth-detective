import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

// Test-only fetch adapter for jsdom, installed on top of MSW's patched fetch:
// - Node's fetch does not resolve relative URLs like a browser ('/api/...').
// - jsdom's AbortSignal is rejected by Node's Request (different realm), so the signal is honored
//   here by racing the request against the abort event instead of passing it through.
function withBrowserLikeFetch(baseFetch: typeof fetch): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' && input.startsWith('/')
        ? new URL(input, window.location.origin).toString()
        : input;
    const { signal, ...rest } = init ?? {};
    if (!signal) return baseFetch(url, rest);
    if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', onAbort, { once: true });
      baseFetch(url, rest)
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', onAbort));
    });
  }) as typeof fetch;
}

let restoreFetch: (() => void) | undefined;

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  const patched = globalThis.fetch;
  globalThis.fetch = withBrowserLikeFetch(patched.bind(globalThis));
  restoreFetch = () => {
    globalThis.fetch = patched;
  };
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => {
  restoreFetch?.();
  server.close();
});
