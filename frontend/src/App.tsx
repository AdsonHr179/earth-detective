import { useEffect, useMemo, useRef, useState } from 'react';
import {
  exportAnalysisCsv,
  fetchAvailability,
  fetchRegions,
  fetchSavedAnalyses,
  fetchSavedAnalysis,
  fetchVariables,
  requestAnalysis,
  type AvailabilityResponse,
  type AnalysisResponse,
  type GeoJSONPoint,
  type RegionRecord,
  type SavedAnalysisSummary,
  type VariableRecord,
} from './api/client';
import RegionMap from './components/RegionMap';

type LoadState = 'loading' | 'ready' | 'error' | 'success' | 'no-data';

type ExampleConfig = {
  label: string;
  variableId: string;
  regionId: string;
  startDate: string;
  endDate: string;
};

const exampleConfigs: ExampleConfig[] = [
  {
    label: 'NASA • Ceará temperature',
    variableId: 'nasa_power_temperature',
    regionId: 'ceara',
    startDate: '2020-01-01',
    endDate: '2024-12-31',
  },
  {
    label: 'Example 1 • Ceará warming',
    variableId: 'air_temperature',
    regionId: 'ceara',
    startDate: '2015-01-01',
    endDate: '2023-12-31',
  },
  {
    label: 'Example 2 • Northeast rainfall',
    variableId: 'precipitation',
    regionId: 'northeast_brazil',
    startDate: '2015-01-01',
    endDate: '2023-12-31',
  },
];

function createChartPath(
  values: Array<{ date: string; value: number | null }>,
  width: number,
  height: number,
  padding: number,
  circular = false,
  scale?: { min: number; max: number },
): string {
  if (!values.some((point) => point.value !== null && Number.isFinite(point.value))) {
    return '';
  }

  const valid = values.filter((point) => point.value !== null && Number.isFinite(point.value));
  const min = circular ? 0 : scale?.min ?? Math.min(...valid.map((point) => point.value ?? 0));
  const max = circular ? 360 : scale?.max ?? Math.max(...valid.map((point) => point.value ?? 0));
  const range = max - min || 1;
  let previousValue: number | null = null;

  return values
    .map((point, index) => {
      if (point.value === null || !Number.isFinite(point.value)) {
        previousValue = null;
        return '';
      }

      const wrapped = circular && previousValue !== null && Math.abs(point.value - previousValue) > 180;
      const startsSegment = previousValue === null || wrapped;
      const x = padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
      previousValue = point.value;
      return `${startsSegment ? 'M' : 'L'} ${x} ${y}`;
    })
    .filter(Boolean)
    .join(' ');
}

function createAreaPath(values: Array<{ date: string; low: number; high: number }>, width: number, height: number, padding: number): string {
  if (values.length === 0) {
    return '';
  }

  const allValues = values.flatMap((point) => [point.low, point.high]);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const points = values.map((point, index) => {
    const x = padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
    const lowY = height - padding - ((point.low - min) / range) * (height - padding * 2);
    const highY = height - padding - ((point.high - min) / range) * (height - padding * 2);
    return { x, lowY, highY };
  });

  const top = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.highY}`)
    .join(' ');
  const bottom = points
    .slice()
    .reverse()
    .map((point) => `L ${point.x} ${point.lowY}`)
    .join(' ');

  return `${top} ${bottom} Z`;
}

function App() {
  const [variables, setVariables] = useState<VariableRecord[]>([]);
  const [regions, setRegions] = useState<RegionRecord[]>([]);
  const [selectedVariable, setSelectedVariable] = useState('air_temperature');
  const [selectedRegion, setSelectedRegion] = useState('ceara');
  const [selectedPosition, setSelectedPosition] = useState<GeoJSONPoint | null>(null);
  const [startDate, setStartDate] = useState('2015-01-01');
  const [endDate, setEndDate] = useState('2023-12-31');
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [availabilityState, setAvailabilityState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [availabilityError, setAvailabilityError] = useState('');
  const [status, setStatus] = useState<LoadState>('loading');
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [statusMessage, setStatusMessage] = useState('Loading analysis catalog…');
  const [exportMessage, setExportMessage] = useState('');
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysisSummary[]>([]);
  const [historyError, setHistoryError] = useState('');
  const requestIdRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchSavedAnalyses(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setSavedAnalyses(items);
        setHistoryError('');
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setHistoryError(error.message);
      });
    return () => controller.abort();
  }, [analysis?.analysis_id]);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([fetchVariables(controller.signal), fetchRegions(controller.signal)])
      .then(([fetchedVariables, fetchedRegions]) => {
        if (controller.signal.aborted) return;
        setVariables(fetchedVariables);
        setRegions(fetchedRegions);
        if (!fetchedVariables.some((variable) => variable.id === selectedVariable)) {
          setSelectedVariable(fetchedVariables[0].id);
        }
        if (!fetchedRegions.some((region) => region.id === selectedRegion) && fetchedRegions[0]) {
          setSelectedRegion(fetchedRegions[0].id);
        }
        setStatus('ready');
        setStatusMessage('Catalog ready. Choose a filter and run an analysis.');
      })
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setStatusMessage(`Catalog API request failed: ${error.message}`);
      });

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setAvailability(null);
    setAvailabilityError('');
    setAvailabilityState('loading');

    fetchAvailability(selectedVariable, selectedRegion, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setAvailability(result);
        setAvailabilityState('ready');
      })
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        setAvailabilityError(error.message);
        setAvailabilityState('error');
      });

    return () => {
      controller.abort();
    };
  }, [selectedVariable, selectedRegion]);

  const activeVariable = useMemo(
    () => variables.find((item) => item.id === selectedVariable) ?? variables[0],
    [selectedVariable, variables],
  );

  const activeRegion = useMemo(
    () => regions.find((item) => item.id === selectedRegion) ?? regions[0],
    [selectedRegion, regions],
  );

  const selectedAvailability =
    availability?.variable_id === selectedVariable && availability.region_id === selectedRegion
      ? availability
      : null;

  const runAnalysis = (
    nextVariable = selectedVariable,
    nextRegion = selectedRegion,
    nextStartDate = startDate,
    nextEndDate = endDate,
    nextPosition: GeoJSONPoint | null = selectedPosition,
  ) => {
    if (!nextStartDate || !nextEndDate || nextStartDate > nextEndDate) {
      setStatus('error');
      setStatusMessage('Choose a valid date range before running the analysis.');
      setAnalysis(null);
      return;
    }

    const requestAvailability =
      availability?.variable_id === nextVariable && availability.region_id === nextRegion
        ? availability
        : null;
    if (requestAvailability?.available === false) {
      setStatus('error');
      setStatusMessage(requestAvailability.warning ?? 'The backend reports no data for this selection.');
      setAnalysis(null);
      return;
    }
    if (
      (requestAvailability?.start_date && nextStartDate < requestAvailability.start_date) ||
      (requestAvailability?.end_date && nextEndDate > requestAvailability.end_date)
    ) {
      setStatus('error');
      setStatusMessage(
        `Selected dates are outside backend availability (${requestAvailability.start_date ?? 'open'} to ${requestAvailability.end_date ?? 'open'}).`,
      );
      setAnalysis(null);
      return;
    }

    const requestNumber = requestIdRef.current + 1;
    requestIdRef.current = requestNumber;
    const requestRegion = regions.find((region) => region.id === nextRegion);
    if (!requestRegion) {
      setStatus('error');
      setStatusMessage('Select a region from the backend catalog before running an analysis.');
      setAnalysis(null);
      return;
    }
    const queryPoint = nextPosition ?? {
      type: 'Point' as const,
      coordinates: [requestRegion.center.longitude, requestRegion.center.latitude] as [number, number],
    };
    setStatus('loading');
    setStatusMessage('Running the selected analysis…');
    setExportMessage('');
    setAnalysis(null);

    requestAnalysis({
      variable_id: nextVariable,
      region_id: nextRegion,
      start_date: nextStartDate,
      end_date: nextEndDate,
      dataset_version: requestAvailability?.active_version ?? null,
      spatial_query: queryPoint,
    })
      .then((result) => {
        if (requestNumber !== requestIdRef.current) {
          return;
        }

        if (!(result.chart_points ?? []).some((point) => point.value !== null)) {
          setStatus('no-data');
          setStatusMessage('No valid observations are available for the selected filters.');
          setAnalysis(result);
          setSelectedPosition(result.spatial_query ?? queryPoint);
          return;
        }

        setAnalysis(result);
        setSelectedPosition(result.spatial_query ?? queryPoint);
        setStatus('success');
        setStatusMessage('Analysis complete. Review the trend, confidence band, and limitations.');
      })
      .catch((error: Error) => {
        if (requestNumber !== requestIdRef.current) {
          return;
        }

        setStatus('error');
        setStatusMessage(error instanceof Error ? error.message : 'The analysis could not be completed.');
      });
  };

  const openSavedAnalysis = async (id: string) => {
    const requestNumber = ++requestIdRef.current;
    setStatus('loading');
    setStatusMessage('Opening saved analysis…');
    setExportMessage('');
    try {
      const result = await fetchSavedAnalysis(id);
      if (requestNumber !== requestIdRef.current) return;
      setSelectedVariable(result.variable_id);
      setSelectedRegion(result.region_id);
      setSelectedPosition(result.spatial_query ?? null);
      setStartDate(result.start_date);
      setEndDate(result.end_date);
      setAnalysis(result);
      const hasData = result.chart_points.some((point) => point.value !== null);
      setStatus(hasData ? 'success' : 'no-data');
      setStatusMessage(hasData ? 'Saved analysis loaded.' : 'This saved analysis has no valid observations.');
    } catch (error) {
      if (requestNumber !== requestIdRef.current) return;
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : 'Could not open the saved analysis.');
    }
  };

  const applyExample = (example: ExampleConfig) => {
    setSelectedVariable(example.variableId);
    setSelectedRegion(example.regionId);
    setSelectedPosition(null);
    setStartDate(example.startDate);
    setEndDate(example.endDate);
    runAnalysis(example.variableId, example.regionId, example.startDate, example.endDate, null);
  };

  const selectRegion = (regionId: string) => {
    requestIdRef.current += 1;
    setSelectedRegion(regionId);
    setSelectedPosition(null);
    setAnalysis(null);
    setStatus('ready');
    setStatusMessage('Region selected. Click the map to choose an analysis position.');
  };

  const selectPosition = (position: GeoJSONPoint) => {
    requestIdRef.current += 1;
    setSelectedPosition(position);
    setAnalysis(null);
    setStatus('ready');
    setStatusMessage(
      `Position selected: ${position.coordinates[1].toFixed(4)}°, ${position.coordinates[0].toFixed(4)}°. Run an analysis to query this point.`,
    );
  };

  const handleExport = async () => {
    if (!analysis) return;
    setExportMessage('Preparing CSV from the backend…');
    try {
      await exportAnalysisCsv(analysis);
      setExportMessage('CSV downloaded.');
    } catch (error) {
      setExportMessage(error instanceof Error ? `Export failed: ${error.message}` : 'Export failed.');
    }
  };

  const chartWidth = 720;
  const chartHeight = 280;
  const chartPadding = 44;
  const monthlySeries = analysis?.chart_points.filter((point) => point.aggregation === 'monthly') ?? [];
  const annualSeries = analysis?.annual_points ?? [];
  const confidenceArea = analysis?.confidence_band ?? [];

  const forecast = analysis?.forecast ?? null;
  const chartDates = [...new Set([
    ...monthlySeries.map((point) => point.date),
    ...(forecast?.points.map((point) => point.timestamp) ?? []),
  ])].sort();
  const historicalByDate = new Map(monthlySeries.map((point) => [point.date, point.value]));
  const projectionByDate = new Map(forecast?.points.map((point) => [point.timestamp, point.value]));
  const lastObserved = [...monthlySeries].reverse().find((point) => point.value !== null);
  if (forecast && lastObserved?.value != null) {
    projectionByDate.set(lastObserved.date, lastObserved.value);
  }
  const chartValues = [
    ...monthlySeries.flatMap((point) => point.value === null ? [] : [point.value]),
    ...projectionByDate.values(),
  ];
  const scale = chartValues.length > 0
    ? { min: Math.min(...chartValues), max: Math.max(...chartValues) }
    : undefined;
  const forecastPath = createChartPath(
    chartDates.map((date) => ({ date, value: projectionByDate.get(date) ?? null })),
    chartWidth, chartHeight, chartPadding, false, scale,
  );
  const axisScale = activeVariable?.circular ? { min: 0, max: 360 } : scale;
  const chartTicks = axisScale
    ? (axisScale.max === axisScale.min
        ? [axisScale.min]
        : Array.from({ length: 5 }, (_, index) => axisScale.min + (axisScale.max - axisScale.min) * index / 4))
    : [];
  const monthlyPath = createChartPath(
    chartDates.map((date) => ({ date, value: historicalByDate.get(date) ?? null })),
    chartWidth,
    chartHeight,
    chartPadding,
    activeVariable?.circular ?? false,
    scale,
  );
  const annualPath = createChartPath(annualSeries, chartWidth, chartHeight, chartPadding);
  const confidencePath = createAreaPath(confidenceArea, chartWidth, chartHeight, chartPadding);

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Earth observation</p>
          <h1>Earth Detective</h1>
        </div>
        <div className="example-actions" aria-label="Guided analysis examples">
          {exampleConfigs.map((example) => (
            <button
              key={example.label}
              type="button"
              className="secondary-button"
              onClick={() => applyExample(example)}
            >
              {example.label}
            </button>
          ))}
        </div>
      </header>

      <div className="dev-banner" aria-live="polite">
        Catalog, availability, analysis and CSV export are served by the backend API.
      </div>

      <section className="panel grid-layout" aria-label="Analysis controls">
        <div className="controls-column">
          {savedAnalyses.length ? (
            <div className="field-group">
              <label htmlFor="saved-analysis">Saved analyses</label>
              <select
                id="saved-analysis"
                value={savedAnalyses.some((item) => item.analysis_id === analysis?.analysis_id) ? analysis?.analysis_id : ''}
                onChange={(event) => {
                  if (event.target.value) void openSavedAnalysis(event.target.value);
                }}
              >
                <option value="">Open a saved analysis</option>
                {savedAnalyses.map((item) => (
                  <option key={item.analysis_id} value={item.analysis_id}>
                    {item.product} · {regions.find((region) => region.id === item.region_id)?.name ?? item.region_id} · {item.start_date} to {item.end_date}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {historyError ? <p role="status">Saved analyses: {historyError}</p> : null}
          <div className="field-group">
            <label htmlFor="variable">Variable</label>
            <select
              id="variable"
              value={selectedVariable}
              onChange={(event) => {
                requestIdRef.current += 1;
                setSelectedVariable(event.target.value);
                setAnalysis(null);
                setStatus('ready');
                setStatusMessage('Variable selected. Run an analysis to load this series.');
              }}
            >
              {[...new Set(variables.map((variable) => variable.group))].map((group) => (
                <optgroup key={group} label={group}>
                  {variables
                    .filter((variable) => variable.group === group)
                    .map((variable) => (
                      <option key={variable.id} value={variable.id}>
                        {variable.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="field-row">
            <div className="field-group">
              <label htmlFor="start-date">Start date</label>
              <input
                id="start-date"
                type="date"
                min={selectedAvailability?.start_date ?? undefined}
                max={selectedAvailability?.end_date ?? undefined}
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="field-group">
              <label htmlFor="end-date">End date</label>
              <input
                id="end-date"
                type="date"
                min={selectedAvailability?.start_date ?? undefined}
                max={selectedAvailability?.end_date ?? undefined}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>

          <div className="availability-message" aria-live="polite">
            {availabilityState === 'loading' ? <span>Checking backend coverage…</span> : null}
            {availabilityState === 'error' ? (
              <span role="alert">Availability API failed: {availabilityError}</span>
            ) : null}
            {selectedAvailability ? (
              <>
                <strong>
                  {selectedAvailability.available ? 'Coverage available' : 'No coverage'}
                  {selectedAvailability.start_date || selectedAvailability.end_date
                    ? ` · ${selectedAvailability.start_date ?? 'open'} to ${selectedAvailability.end_date ?? 'open'}`
                    : ''}
                </strong>
                {selectedAvailability.warning ? <span>{selectedAvailability.warning}</span> : null}
              </>
            ) : null}
          </div>

          <div className="actions-row">
            <button
              type="button"
              className="primary-button"
              onClick={() => runAnalysis()}
              disabled={availabilityState === 'loading' || selectedAvailability?.available === false}
            >
              Run analysis
            </button>
            <button type="button" className="ghost-button" onClick={() => setStatusMessage('Filters reset to the default analysis window.') }>
              Reset
            </button>
          </div>

          {activeVariable ? (
            <article className="summary-card">
              <h2>{activeVariable.name}</h2>
              <p>{activeVariable.description}</p>
              <dl>
                <div>
                  <dt>Unit</dt>
                  <dd>{activeVariable.unit}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{activeVariable.source}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{activeVariable.group}</dd>
                </div>
                <div>
                  <dt>Trend analysis</dt>
                  <dd>
                    {activeVariable.trend_supported
                      ? 'Supported'
                      : activeVariable.circular
                        ? 'Not applicable to circular data'
                        : 'Not supported'}
                  </dd>
                </div>
              </dl>
            </article>
          ) : null}
        </div>

        <div className="map-card">
          <RegionMap
            regions={regions}
            selectedRegion={selectedRegion}
            selectedPosition={selectedPosition}
            onSelectPosition={selectPosition}
          />

          <div className="region-list" role="list" aria-label="Regions">
            {regions.map((region) => (
              <button
                key={region.id}
                type="button"
                className={selectedRegion === region.id ? 'selected-region' : ''}
                onClick={() => selectRegion(region.id)}
                aria-pressed={selectedRegion === region.id}
              >
                {region.name}
              </button>
            ))}
          </div>

          {activeRegion ? (
            <div className="region-metadata" aria-live="polite">
              <strong>{activeRegion.name} · {activeRegion.country}</strong>
              <span>
                {selectedPosition
                  ? `Selected point: ${selectedPosition.coordinates[1].toFixed(4)}°, ${selectedPosition.coordinates[0].toFixed(4)}°`
                  : `Default point: approx. ${Math.abs(activeRegion.center.latitude).toFixed(1)}° S, ${Math.abs(activeRegion.center.longitude).toFixed(1)}° W`}
              </span>
            </div>
          ) : null}
          <p className="map-note">
            Click the map to choose the analysis point and highlight its official IBGE state
            boundary. Without a selected point, the region center is used. Each analysis queries
            one point, not an area-weighted regional average.
          </p>
        </div>
      </section>

      <section className="panel status-panel" aria-live="polite">
        <strong>Status:</strong> <span>{statusMessage}</span>
      </section>

      {status === 'error' ? (
        <section className="panel result-empty" role="alert">
          <h2>Unable to complete the request</h2>
          <p>{statusMessage}</p>
        </section>
      ) : null}

      {status === 'loading' ? (
        <section className="panel result-empty" aria-live="polite">
          <h2>Loading results</h2>
          <p>Building the time series and trend estimate…</p>
        </section>
      ) : null}

      {status === 'no-data' ? (
        <section className="panel result-empty" role="status">
          <h2>No valid series</h2>
          <p>The selected filters do not produce a valid observation record.</p>
        </section>
      ) : null}

      {status === 'success' && analysis ? (
        <section className="panel result-grid" aria-live="polite">
          <div className="chart-card">
            <div className="section-header">
              <h2>{activeVariable?.id === analysis.variable_id ? activeVariable.name : variables.find((item) => item.id === analysis.variable_id)?.name ?? 'Saved series'} at the selected point</h2>
              <button type="button" className="secondary-button small-button" onClick={() => void handleExport()}>
                Export CSV
              </button>
            </div>
            {exportMessage ? <p className="export-message" role="status">{exportMessage}</p> : null}

            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="trend-chart" role="img" aria-label="Environmental variation chart">
              <g>
                {chartTicks.map((value, index) => {
                  const y = chartHeight - chartPadding
                    - index / Math.max(chartTicks.length - 1, 1) * (chartHeight - 2 * chartPadding);
                  return (
                    <g key={index} className="chart-axis-label">
                      <line x1={chartPadding} y1={y} x2={chartWidth - chartPadding} y2={y} stroke="currentColor" opacity="0.12" />
                      <text x={chartPadding - 6} y={y} textAnchor="end" dominantBaseline="middle">
                        {value.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 })}
                      </text>
                    </g>
                  );
                })}
                {analysis.unit ? <text className="chart-axis-label" x={chartPadding} y={chartPadding - 14}>{analysis.unit}</text> : null}
                <line x1={chartPadding} y1={chartHeight - chartPadding} x2={chartWidth - chartPadding} y2={chartHeight - chartPadding} className="axis-line" />
                <line x1={chartPadding} y1={chartPadding} x2={chartPadding} y2={chartHeight - chartPadding} className="axis-line" />
              </g>

              {confidenceArea.length > 0 ? <path d={confidencePath} className="confidence-band" /> : null}
              {annualSeries.length > 0 ? <path d={annualPath} className="annual-line" /> : null}
              {monthlySeries.length > 0 ? <path d={monthlyPath} className="monthly-line" /> : null}
              {forecastPath ? <path d={forecastPath} className="forecast-line" /> : null}
              {chartDates.length > 0 ? (
                <g className="chart-axis-label">
                  <text x={chartPadding} y={chartHeight - 7}>{chartDates[0].slice(0, 7)}</text>
                  {chartDates.length > 1 ? (
                    <text x={chartWidth - chartPadding} y={chartHeight - 7} textAnchor="end">
                      {chartDates[chartDates.length - 1].slice(0, 7)}
                    </text>
                  ) : null}
                </g>
              ) : null}
            </svg>

            <div className="legend" aria-label="Chart legend">
              <span><i className="legend-dot legend-dot--monthly" /> Historical monthly values</span>
              {annualSeries.length ? <span><i className="legend-dot legend-dot--annual" /> Annual mean</span> : null}
              {confidenceArea.length ? <span><i className="legend-dot legend-dot--confidence" /> Confidence band</span> : null}
              {forecast ? <span><i className="legend-dot legend-dot--forecast" /> Statistical projection</span> : null}
            </div>
            {forecast ? (
              <section className="forecast-summary" aria-label="Monthly projection">
                <h3>Six-month statistical projection</h3>
                <p>{forecast.method}. The projection starts after the last available month.</p>
                {forecast.backtest_mae !== null ? (
                  <p>Historical mean absolute error: {forecast.backtest_mae.toFixed(2)} {analysis.unit} across {forecast.backtest_count} predictions.</p>
                ) : null}
                <dl className="forecast-values">
                  {forecast.points.map((point) => (
                    <div key={point.timestamp}>
                      <dt>{point.timestamp.slice(0, 7)}</dt>
                      <dd>{point.value.toFixed(2)} {analysis.unit}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : analysis.statistics ? (
              <p className="forecast-summary">A projection requires at least three historical values for each projected calendar month.</p>
            ) : null}
          </div>

          <aside className="metric-card">
            {analysis.statistics ? (
              <>
                <h2>Historical statistics</h2>
                <dl className="metric-list">
                  <div><dt>Mean</dt><dd>{analysis.statistics.mean.toFixed(2)} {analysis.unit}</dd></div>
                  <div><dt>Median</dt><dd>{analysis.statistics.median.toFixed(2)} {analysis.unit}</dd></div>
                  <div>
                    <dt>Minimum / maximum</dt>
                    <dd>{analysis.statistics.min.toFixed(2)} / {analysis.statistics.max.toFixed(2)} {analysis.unit}</dd>
                  </div>
                  {analysis.statistics.standard_deviation !== null ? (
                    <div><dt>Standard deviation</dt><dd>{analysis.statistics.standard_deviation.toFixed(2)} {analysis.unit}</dd></div>
                  ) : null}
                </dl>
              </>
            ) : null}
            <h2>Trend summary</h2>
            <dl className="metric-list">
              <div>
                <dt>Direction</dt>
                <dd>{analysis.trend.applicable ? analysis.trend.direction : 'Not applicable'}</dd>
              </div>
              <div>
                <dt>Rate per decade</dt>
                <dd>
                  {!analysis.trend.applicable
                    ? 'Not applicable'
                    : analysis.trend.rate_per_decade === null
                    ? 'Not available'
                    : `${analysis.trend.rate_per_decade > 0 ? '+' : ''}${analysis.trend.rate_per_decade.toFixed(2)} ${analysis.unit}`}
                </dd>
              </div>
              <div>
                <dt>Statistical signal at α = {analysis.trend.alpha}</dt>
                <dd>
                  {!analysis.trend.applicable
                    ? 'Not applicable'
                    : analysis.trend.significant === null
                    ? 'Not available'
                    : analysis.trend.significant
                      ? 'Statistically significant'
                      : 'Not statistically significant'}
                </dd>
              </div>
              <div>
                <dt>p-value</dt>
                <dd>{!analysis.trend.applicable
                  ? 'Not applicable'
                  : analysis.trend.p_value !== null
                    ? `p = ${analysis.trend.p_value.toFixed(3)}`
                    : 'Not available'}</dd>
              </div>
              <div>
                <dt>Estimator / inference</dt>
                <dd>{analysis.trend.estimator} · {analysis.trend.inference_method}</dd>
              </div>
              <div>
                <dt>Confidence interval</dt>
                <dd>
                  {!analysis.trend.applicable
                    ? 'Not applicable'
                    : analysis.trend.confidence_interval
                    ? `[${analysis.trend.confidence_interval[0].toFixed(2)}, ${analysis.trend.confidence_interval[1].toFixed(2)}] ${analysis.unit}`
                    : 'Not available'}
                </dd>
              </div>
            </dl>

            <div className="insight-box">
              <h3>Plain-language interpretation</h3>
              <p>{analysis.trend.explanation}</p>
            </div>
          </aside>
        </section>
      ) : null}

      {status === 'success' && analysis ? (
        <section className="panel metadata-grid" aria-label="Analysis metadata">
          <div>
            <h3>Provenance</h3>
            <p>{analysis.provenance}</p>
          </div>
          <div>
            <h3>Effective period</h3>
            <p>{analysis.effective_period}</p>
          </div>
          <div>
            <h3>Valid observations</h3>
            <p>{analysis.valid_observations} monthly values</p>
          </div>
          {analysis.spatial_query?.type === 'Point' ? (
            <div>
              <h3>API query point (GeoJSON)</h3>
              <p>
                Latitude {analysis.spatial_query.coordinates[1].toFixed(4)}°, longitude{' '}
                {analysis.spatial_query.coordinates[0].toFixed(4)}°
              </p>
              <p>One configured grid point; not an area-weighted regional average.</p>
            </div>
          ) : null}
          <div>
            <h3>Coverage</h3>
            <p>{analysis.coverage}% complete</p>
          </div>
          {analysis.quality.hourly_coverage !== null ? (
            <div>
              <h3>Hourly input coverage</h3>
              <p>{analysis.quality.hourly_coverage.toFixed(1)}%</p>
            </div>
          ) : null}
          <div>
            <h3>Warnings</h3>
            <ul>
              {analysis.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Analysis version</h3>
            <p>Dataset {analysis.dataset_version}; method {analysis.method_version}</p>
          </div>
        </section>
      ) : null}
    </main>
  );
}

export default App;
