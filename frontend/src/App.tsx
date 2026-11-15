import { useEffect, useMemo, useState } from 'react';
import {
  exportAnalysisCsv,
  fetchAvailability,
  type AvailabilityResponse,
  type GeoJSONPoint,
} from './api/client';
import AppShell from './components/AppShell';
import ControlsBar from './components/ControlsBar';
import LazyMap from './components/LazyMap';
import ResultPanel from './components/ResultPanel';
import ResultSheet from './components/ResultSheet';
import { CatalogLoadingState, ErrorState, LoadingState, ReadyState, UnavailableState } from './components/StateViews';
import { DEFAULT_FILTERS, useAnalysis, type AnalysisStatus } from './hooks/useAnalysis';
import { useCatalog } from './hooks/useCatalog';
import { COMPACT_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import { formatCoordinatePair, formatPeriodShort } from './lib/format';

const SHEET_SUMMARY: Record<AnalysisStatus, string> = {
  idle: 'Ready',
  loading: 'Fetching observations',
  success: 'Result ready',
  stale: 'Out of date',
  'no-data': 'No valid observations',
  error: 'Could not get the data',
};

function App() {
  const catalog = useCatalog();
  const { variables, regions } = catalog;
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [availabilityState, setAvailabilityState] = useState<'loading' | 'ready' | 'error'>('loading');
  const compact = useMediaQuery(COMPACT_QUERY);
  const [sheetExpanded, setSheetExpanded] = useState(true);

  const defaults = useMemo(
    () => ({
      ...DEFAULT_FILTERS,
      variableId: variables.some((item) => item.id === DEFAULT_FILTERS.variableId)
        ? DEFAULT_FILTERS.variableId
        : (variables[0]?.id ?? DEFAULT_FILTERS.variableId),
      regionId: regions.some((item) => item.id === DEFAULT_FILTERS.regionId)
        ? DEFAULT_FILTERS.regionId
        : (regions[0]?.id ?? DEFAULT_FILTERS.regionId),
    }),
    [variables, regions],
  );

  const {
    filters,
    status,
    analysis,
    resultKind,
    message,
    error,
    setVariable,
    setRegion,
    setPoint,
    setStartDate,
    setEndDate,
    updateFilters,
    run,
    loadSaved,
    retry,
    cancel,
    reset,
  } = useAnalysis({ regions, availability, defaults });

  // Once the catalog is known, make sure the selection points at something that exists.
  useEffect(() => {
    if (catalog.status !== 'ready') return;
    updateFilters((current) => ({
      ...current,
      variableId: variables.some((item) => item.id === current.variableId)
        ? current.variableId
        : variables[0].id,
      regionId:
        regions.some((item) => item.id === current.regionId) || !regions[0]
          ? current.regionId
          : regions[0].id,
    }));
  }, [catalog.status, variables, regions, updateFilters]);

  useEffect(() => {
    const controller = new AbortController();
    setAvailability(null);
    setAvailabilityState('loading');

    fetchAvailability(filters.variableId, filters.regionId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setAvailability(result);
        setAvailabilityState('ready');
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAvailabilityState('error');
      });

    return () => controller.abort();
  }, [filters.variableId, filters.regionId]);

  const activeVariable = variables.find((item) => item.id === filters.variableId);
  const activeRegion = regions.find((item) => item.id === filters.regionId);
  const resultVariable = variables.find((item) => item.id === analysis?.variable_id);
  const resultRegion = regions.find((item) => item.id === analysis?.region_id);

  const selectedAvailability =
    availability?.variable_id === filters.variableId && availability.region_id === filters.regionId
      ? availability
      : null;
  const unavailable = selectedAvailability?.available === false;

  const regionCenter: GeoJSONPoint | null = activeRegion
    ? { type: 'Point', coordinates: [activeRegion.center.longitude, activeRegion.center.latitude] }
    : null;
  const point = filters.point ?? regionCenter;
  const pointIsRegionCenter =
    !filters.point ||
    (regionCenter !== null &&
      filters.point.coordinates[0] === regionCenter.coordinates[0] &&
      filters.point.coordinates[1] === regionCenter.coordinates[1]);

  const runDisabled = catalog.status !== 'ready' || availabilityState === 'loading' || unavailable;
  const handleRun = () => {
    setSheetExpanded(true);
    run();
  };
  const handleOpenSaved = (analysisId: string) => {
    setSheetExpanded(true);
    loadSaved(analysisId);
  };
  const handleRetry = () => {
    setSheetExpanded(true);
    retry();
  };

  const pointText = point ? formatCoordinatePair(point.coordinates[1], point.coordinates[0]) : null;
  const selectionText = [
    activeVariable?.name,
    activeRegion?.name,
    formatPeriodShort(filters.startDate, filters.endDate),
    pointText ? `${pointText}${pointIsRegionCenter ? ' (region center)' : ''}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  let resultView;
  if (catalog.status === 'loading') {
    resultView = <CatalogLoadingState />;
  } else if (catalog.status === 'error') {
    resultView = <ErrorState error={catalog.error} onRetry={catalog.reload} />;
  } else if (status === 'loading') {
    resultView = <LoadingState onCancel={cancel} />;
  } else if (status === 'error') {
    resultView = <ErrorState error={error} onRetry={handleRetry} />;
  } else if (analysis && resultKind && (status === 'success' || status === 'no-data' || status === 'stale')) {
    resultView = (
      <ResultPanel
        analysis={analysis}
        kind={resultKind}
        stale={status === 'stale'}
        variableName={resultVariable?.name ?? analysis.variable_id}
        regionName={resultRegion?.name}
        circular={resultVariable?.circular ?? false}
        onExport={() => exportAnalysisCsv(analysis)}
      />
    );
  } else {
    resultView = (
      <ReadyState selection={selectionText}>
        {unavailable ? (
          <UnavailableState message={selectedAvailability?.warning ?? 'The backend reports no data for this selection.'} />
        ) : selectedAvailability?.warning ? (
          <p className="ready-note">{selectedAvailability.warning}</p>
        ) : null}
        {availabilityState === 'error' ? (
          <p className="ready-note" role="status">
            Coverage could not be checked. You can still run the analysis.
          </p>
        ) : null}
        {message ? (
          <p className="ready-note" role="status">
            {message}
          </p>
        ) : null}
        <button type="button" className="button" onClick={() => reset()}>
          Reset
        </button>
      </ReadyState>
    );
  }

  const runButton = {
    onRun: handleRun,
    disabled: runDisabled,
    attention: status === 'stale',
  };

  return (
    <AppShell
      sheetCollapsed={compact && !sheetExpanded}
      map={
        catalog.status === 'ready' ? (
          <LazyMap
            regions={regions}
            selectedRegion={filters.regionId}
            selectedPosition={point}
            isDefaultPoint={pointIsRegionCenter}
            onSelectPosition={setPoint}
          />
        ) : (
          <div className="map-placeholder" role="status">
            Loading map…
          </div>
        )
      }
      controls={
        <ControlsBar
          variables={variables}
          regions={regions}
          variableId={filters.variableId}
          regionId={filters.regionId}
          startDate={filters.startDate}
          endDate={filters.endDate}
          point={point}
          pointIsRegionCenter={pointIsRegionCenter}
          availability={selectedAvailability}
          onVariable={setVariable}
          onRegion={setRegion}
          onStartDate={setStartDate}
          onEndDate={setEndDate}
          onPoint={setPoint}
          onUseRegionCenter={() => setPoint(null)}
          onOpenSaved={handleOpenSaved}
          run={compact ? undefined : runButton}
        />
      }
      mapFooter={
        pointText ? (
          <p className="point-readout" aria-live="polite">
            <strong>
              {pointIsRegionCenter ? 'Region center' : 'Selected point'}: {pointText}
            </strong>
            <span className="point-readout-help">
              One point, not an area average. Click the map or use the Point menu to move it.
            </span>
          </p>
        ) : null
      }
      result={
        <ResultSheet
          compact={compact}
          expanded={sheetExpanded}
          onToggle={() => setSheetExpanded((current) => !current)}
          summary={SHEET_SUMMARY[status]}
          action={
            compact ? (
              <button
                type="button"
                className={`run-button${runButton.attention ? ' run-button--attention' : ''}`}
                onClick={runButton.onRun}
                disabled={runButton.disabled}
              >
                Run analysis
              </button>
            ) : undefined
          }
        >
          {resultView}
        </ResultSheet>
      }
    />
  );
}

export default App;
