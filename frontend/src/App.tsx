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
import {
  DEFAULT_FILTERS, PUBLIC_TEMPERATURE_ID, WORLD_REGION_ID, useAnalysis, type AnalysisStatus,
} from './hooks/useAnalysis';
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
  const [availabilityError, setAvailabilityError] = useState('');
  const compact = useMediaQuery(COMPACT_QUERY);
  const [sheetExpanded, setSheetExpanded] = useState(true);

  const defaults = useMemo(
    () => ({
      ...DEFAULT_FILTERS,
      variableId: !variables.length || variables.some((item) => item.id === PUBLIC_TEMPERATURE_ID)
        ? PUBLIC_TEMPERATURE_ID
        : (variables.find((item) => item.id === DEFAULT_FILTERS.variableId)?.id ?? variables[0].id),
      regionId: !regions.length || regions.some((item) => item.id === WORLD_REGION_ID)
        ? WORLD_REGION_ID
        : (regions.find((item) => item.id === DEFAULT_FILTERS.regionId)?.id ?? regions[0].id),
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
        : defaults.variableId,
      regionId:
        regions.some((item) => item.id === current.regionId) || !regions[0]
          ? current.regionId
          : defaults.regionId,
    }));
  }, [catalog.status, variables, regions, defaults, updateFilters]);

  const activeVariable = variables.find((item) => item.id === filters.variableId);
  const activeRegion = regions.find((item) => item.id === filters.regionId);
  const availabilityVariableId = activeVariable?.id;
  const availabilityRegionId = activeRegion?.id;

  useEffect(() => {
    if (!availabilityVariableId || !availabilityRegionId) return;
    const controller = new AbortController();
    setAvailability(null);
    setAvailabilityState('loading');
    setAvailabilityError('');

    fetchAvailability(availabilityVariableId, availabilityRegionId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setAvailability(result);
        setAvailabilityState('ready');
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setAvailabilityError(failure instanceof Error ? failure.message : 'The availability request failed.');
        setAvailabilityState('error');
      });

    return () => controller.abort();
  }, [availabilityVariableId, availabilityRegionId]);

  const resultVariable = variables.find((item) => item.id === analysis?.variable_id);
  const resultRegion = regions.find((item) => item.id === analysis?.region_id);

  const selectedAvailability =
    availability?.variable_id === filters.variableId && availability.region_id === filters.regionId
      ? availability
      : null;
  const unavailable = selectedAvailability?.available === false;

  const regionCenter: GeoJSONPoint | null = activeRegion?.center
    ? { type: 'Point', coordinates: [activeRegion.center.longitude, activeRegion.center.latitude] }
    : null;
  const point = filters.point ?? regionCenter;
  const pointIsRegionCenter = regionCenter !== null &&
    (!filters.point || (filters.point.coordinates[0] === regionCenter.coordinates[0] &&
      filters.point.coordinates[1] === regionCenter.coordinates[1]));

  const needsPoint = activeRegion?.center === null && !point;
  const runDisabled =
    catalog.status !== 'ready' || availabilityState === 'loading' || status === 'loading' || unavailable || !point;
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
        regionName={resultRegion?.center ? resultRegion.name : undefined}
        circular={resultVariable?.circular ?? false}
        onExport={() => exportAnalysisCsv(analysis)}
      />
    );
  } else {
    resultView = (
      <ReadyState selection={selectionText} needsPoint={needsPoint}>
        {message ? (
          <p className="ready-note" role="status">
            {message}
          </p>
        ) : null}
        {variables.some((item) => item.id === 'nasa_power_temperature') && regions.some((item) => item.id === 'ceara') ? (
          <div className="ready-note">
            <p>Start with temperature at one NASA POWER grid cell near 5.20° S, 39.50° W, January 2020–December 2023. This is a short record at one location.</p>
            <button type="button" className="button" onClick={() => updateFilters(() => ({
              variableId: 'nasa_power_temperature', regionId: 'ceara',
              point: { type: 'Point', coordinates: [-39.5, -5.2] },
              startDate: '2020-01-01', endDate: '2023-12-31',
            }), 'NASA POWER case selected. Run analysis to request observations; no result has been assumed.')}>
              Use NASA POWER case · 2020–2023
            </button>
          </div>
        ) : null}
        <button type="button" className="button" onClick={() => reset()}>
          Reset
        </button>
        <p className="ready-note"><a href="/credits.html" target="_blank" rel="noreferrer">Credits and AI use</a></p>
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
          {catalog.status === 'ready' && unavailable ? (
            <UnavailableState message={selectedAvailability?.warning ?? 'The backend reports no data for this selection.'} />
          ) : catalog.status === 'ready' && selectedAvailability?.warning ? (
            <p className="ready-note">{selectedAvailability.warning}</p>
          ) : null}
          {catalog.status === 'ready' && availabilityState === 'error' && !needsPoint ? (
            <p className="ready-note" role="status">
              Coverage could not be checked: {availabilityError} You can still attempt the analysis.
            </p>
          ) : null}
          {resultView}
        </ResultSheet>
      }
    />
  );
}

export default App;
