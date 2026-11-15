import { useCallback, useEffect, useState } from 'react';
import { fetchRegions, fetchVariables, type RegionRecord, type VariableRecord } from '../api/client';

export type CatalogState = {
  status: 'loading' | 'ready' | 'error';
  variables: VariableRecord[];
  regions: RegionRecord[];
  error: unknown;
};

const INITIAL: CatalogState = { status: 'loading', variables: [], regions: [], error: null };

/** Loads the variable and region catalog from the backend. Nothing is invented if it fails. */
export function useCatalog() {
  const [state, setState] = useState<CatalogState>(INITIAL);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState(INITIAL);

    Promise.all([fetchVariables(controller.signal), fetchRegions(controller.signal)])
      .then(([variables, regions]) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', variables, regions, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', variables: [], regions: [], error });
      });

    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => setAttempt((current) => current + 1), []);
  return { ...state, reload };
}
