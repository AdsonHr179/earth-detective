import { useCallback, useEffect, useRef, useState } from 'react';
import {
  requestAnalysis,
  type AnalysisResponse,
  type AvailabilityResponse,
  type GeoJSONPoint,
  type RegionRecord,
} from '../api/client';
import { InputError } from '../api/errors';
import { formatCoordinatePair } from '../lib/format';

export type AnalysisStatus = 'idle' | 'loading' | 'success' | 'no-data' | 'error' | 'stale';

export type AnalysisFilters = {
  variableId: string;
  regionId: string;
  /** null means "use the region center". */
  point: GeoJSONPoint | null;
  startDate: string;
  endDate: string;
};

export const DEFAULT_FILTERS: AnalysisFilters = {
  variableId: 'air_temperature',
  regionId: 'ceara',
  point: null,
  startDate: '2015-01-01',
  endDate: '2023-12-31',
};

export const STALE_NOTICE =
  'Your choices changed after this result. Run the analysis again to update it.';

type Phase = 'idle' | 'loading' | 'error';
type ResultKind = 'success' | 'no-data';
type StoredResult = { analysis: AnalysisResponse; kind: ResultKind; key: string };

function effectivePoint(filters: AnalysisFilters, regions: RegionRecord[]): GeoJSONPoint | null {
  if (filters.point) return filters.point;
  const region = regions.find((item) => item.id === filters.regionId);
  if (!region) return null;
  return {
    type: 'Point',
    coordinates: [region.center.longitude, region.center.latitude],
  };
}

/** Request key = variable + region + point + start + end (point defaults to the region center). */
export function requestKey(filters: AnalysisFilters, regions: RegionRecord[]): string {
  return JSON.stringify([
    filters.variableId,
    filters.regionId,
    effectivePoint(filters, regions)?.coordinates ?? null,
    filters.startDate,
    filters.endDate,
  ]);
}

type Options = {
  regions: RegionRecord[];
  availability: AvailabilityResponse | null;
  /** Filters restored by reset(). Defaults to DEFAULT_FILTERS. */
  defaults?: AnalysisFilters;
};

export function useAnalysis({ regions, availability, defaults = DEFAULT_FILTERS }: Options) {
  const [filters, setFiltersState] = useState<AnalysisFilters>(defaults);
  const [phase, setPhaseState] = useState<Phase>('idle');
  const [result, setResult] = useState<StoredResult | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<unknown>(null);

  const filtersRef = useRef(filters);
  const phaseRef = useRef<Phase>('idle');
  const regionsRef = useRef(regions);
  const availabilityRef = useRef(availability);
  const defaultsRef = useRef(defaults);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const lastRequestRef = useRef<AnalysisFilters | null>(null);

  useEffect(() => {
    regionsRef.current = regions;
    availabilityRef.current = availability;
    defaultsRef.current = defaults;
  });

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const commitFilters = useCallback((next: AnalysisFilters) => {
    filtersRef.current = next;
    setFiltersState(next);
  }, []);

  const cancelInFlight = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    requestIdRef.current += 1;
  }, []);

  const updateFilters = useCallback(
    (updater: (current: AnalysisFilters) => AnalysisFilters, nextMessage?: string) => {
      const next = updater(filtersRef.current);
      const current = filtersRef.current;
      if (
        next.variableId === current.variableId &&
        next.regionId === current.regionId &&
        next.point === current.point &&
        next.startDate === current.startDate &&
        next.endDate === current.endDate
      ) {
        return;
      }
      commitFilters(next);
      // A request in flight no longer matches the filters; drop it. An error also no longer applies.
      const previousPhase = phaseRef.current;
      cancelInFlight();
      setPhase('idle');
      setError(null);
      if (nextMessage !== undefined) {
        setMessage(nextMessage);
      } else if (previousPhase === 'loading') {
        setMessage('Filters changed. Run the analysis again.');
      } else if (previousPhase === 'error') {
        setMessage('');
      }
    },
    [cancelInFlight, commitFilters, setPhase],
  );

  const setVariable = useCallback(
    (variableId: string) => updateFilters((f) => ({ ...f, variableId })),
    [updateFilters],
  );
  const setStartDate = useCallback(
    (startDate: string) => updateFilters((f) => ({ ...f, startDate })),
    [updateFilters],
  );
  const setEndDate = useCallback(
    (endDate: string) => updateFilters((f) => ({ ...f, endDate })),
    [updateFilters],
  );
  const setRegion = useCallback(
    (regionId: string) =>
      updateFilters(
        (f) => ({ ...f, regionId, point: null }),
        'Region selected. Click the map to choose an analysis position.',
      ),
    [updateFilters],
  );
  const setPoint = useCallback(
    (point: GeoJSONPoint | null) =>
      updateFilters(
        (f) => ({ ...f, point }),
        point
          ? `Position selected: ${formatCoordinatePair(point.coordinates[1], point.coordinates[0])}. Run an analysis to query this point.`
          : '',
      ),
    [updateFilters],
  );

  const run = useCallback(
    (overrides?: Partial<AnalysisFilters>) => {
      const next: AnalysisFilters = { ...filtersRef.current, ...overrides };
      commitFilters(next);
      cancelInFlight();
      lastRequestRef.current = next;

      setError(null);
      const fail = (text: string) => {
        setResult(null);
        setError(new InputError(text));
        setPhase('error');
        setMessage(text);
      };

      if (!next.startDate || !next.endDate || next.startDate > next.endDate) {
        fail('Choose a valid date range before running the analysis.');
        return;
      }

      const currentAvailability = availabilityRef.current;
      const requestAvailability =
        currentAvailability?.variable_id === next.variableId &&
        currentAvailability.region_id === next.regionId
          ? currentAvailability
          : null;
      if (requestAvailability?.available === false) {
        fail(requestAvailability.warning ?? 'The backend reports no data for this selection.');
        return;
      }
      if (
        (requestAvailability?.start_date && next.startDate < requestAvailability.start_date) ||
        (requestAvailability?.end_date && next.endDate > requestAvailability.end_date)
      ) {
        fail(
          `Selected dates are outside backend availability (${requestAvailability.start_date ?? 'open'} to ${requestAvailability.end_date ?? 'open'}).`,
        );
        return;
      }

      const knownRegions = regionsRef.current;
      if (!knownRegions.some((region) => region.id === next.regionId)) {
        fail('Select a region from the backend catalog before running an analysis.');
        return;
      }
      const queryPoint = effectivePoint(next, knownRegions) as GeoJSONPoint;
      const key = requestKey(next, knownRegions);

      const controller = new AbortController();
      controllerRef.current = controller;
      const requestNumber = requestIdRef.current;
      const isCurrent = () => !controller.signal.aborted && requestNumber === requestIdRef.current;

      setResult(null);
      setPhase('loading');
      setMessage('Running the selected analysis…');

      requestAnalysis(
        {
          variable_id: next.variableId,
          region_id: next.regionId,
          start_date: next.startDate,
          end_date: next.endDate,
          dataset_version: requestAvailability?.active_version ?? null,
          spatial_query: queryPoint,
        },
        controller.signal,
      )
        .then((analysis) => {
          if (!isCurrent()) return;
          controllerRef.current = null;
          const hasData = (analysis.chart_points ?? []).some((point) => point.value !== null);
          setResult({ analysis, kind: hasData ? 'success' : 'no-data', key });
          setPhase('idle');
          setMessage(
            hasData
              ? 'Analysis complete. Review the trend, confidence band, and limitations.'
              : 'No valid observations are available for the selected filters.',
          );
          if (next.point === null) {
            // Show the point that was actually queried; the request key is unchanged (center == effective point).
            commitFilters({ ...filtersRef.current, point: analysis.spatial_query ?? queryPoint });
          }
        })
        .catch((failure: unknown) => {
          if (!isCurrent()) return;
          controllerRef.current = null;
          setResult(null);
          setError(failure);
          setPhase('error');
          setMessage(failure instanceof Error ? failure.message : 'The analysis could not be completed.');
        });
    },
    [cancelInFlight, commitFilters, setPhase],
  );

  const retry = useCallback(() => {
    const last = lastRequestRef.current;
    if (last) run(last);
  }, [run]);

  /** Stops a request in flight. The choices stay as they are and nothing is shown as a result. */
  const cancel = useCallback(() => {
    if (phaseRef.current !== 'loading') return;
    cancelInFlight();
    setError(null);
    setPhase('idle');
    setMessage('Analysis cancelled. Your choices are unchanged.');
  }, [cancelInFlight, setPhase]);

  const reset = useCallback(() => {
    cancelInFlight();
    lastRequestRef.current = null;
    setError(null);
    commitFilters(defaultsRef.current);
    setResult(null);
    setPhase('idle');
    setMessage('Filters reset to the default analysis window.');
  }, [cancelInFlight, commitFilters, setPhase]);

  let status: AnalysisStatus = 'idle';
  if (phase === 'loading') {
    status = 'loading';
  } else if (phase === 'error') {
    status = 'error';
  } else if (result) {
    status = result.key === requestKey(filters, regions) ? result.kind : 'stale';
  }

  return {
    filters,
    status,
    /** The latest result, kept while stale. Always reflects the filters it was requested with. */
    analysis: result?.analysis ?? null,
    /** Whether the stored result has data or not (independent of staleness). */
    resultKind: result?.kind ?? null,
    isStale: status === 'stale',
    message,
    /** The failure behind the 'error' status (an ApiError, an InputError or a network error). */
    error: status === 'error' ? error : null,
    canRetry: status === 'error',
    setVariable,
    setRegion,
    setPoint,
    setStartDate,
    setEndDate,
    updateFilters,
    run,
    retry,
    cancel,
    reset,
  };
}
