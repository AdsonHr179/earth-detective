import { http, HttpResponse } from 'msw';
import { server } from './server';
import {
  fixtureAvailability,
  fixtureRegions,
  fixtureVariables,
} from './fixtures';

/** Registers catalog + availability endpoints (TEST FIXTURE data). Analyses are left to each test. */
export function useCatalogHandlers() {
  server.use(
    http.get('*/api/v1/variables', () => HttpResponse.json(fixtureVariables)),
    http.get('*/api/v1/regions', () => HttpResponse.json(fixtureRegions)),
    http.get('*/api/v1/availability', ({ request }) => {
      const url = new URL(request.url);
      return HttpResponse.json(
        fixtureAvailability(
          url.searchParams.get('variable_id') ?? '',
          url.searchParams.get('region_id') ?? '',
        ),
      );
    }),
  );
}

/** A promise that can be resolved from the test, to hold an HTTP response open. */
export function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
