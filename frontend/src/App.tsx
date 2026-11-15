import { useEffect, useMemo, useState } from 'react';
import {
  exportAnalysisCsv,
  fetchAvailability,
  fetchRegions,
  fetchVariables,
  type AvailabilityResponse,
  type RegionRecord,
  type VariableRecord,
} from './api/client';
import LazyMap from './components/LazyMap';
import { DEFAULT_FILTERS, STALE_NOTICE, useAnalysis } from './hooks/useAnalysis';

type ExampleConfig = {
  label: string;
  variableId: string;
  regionId: string;
  startDate: string;
  endDate: string;
};

const exampleConfigs: ExampleConfig[] = [
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
): string {
  if (!values.some((point) => point.value !== null && Number.isFinite(point.value))) {
    return '';
  }

  const valid = values.filter((point) => point.value !== null && Number.isFinite(point.value));
  const min = circular ? 0 : Math.min(...valid.map((point) => point.value ?? 0));
  const max = circular ? 360 : Math.max(...valid.map((point) => point.value ?? 0));
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
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [availabilityState, setAvailabilityState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [availabilityError, setAvailabilityError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [catalogMessage, setCatalogMessage] = useState('Loading analysis catalog…');
  const [exportMessage, setExportMessage] = useState('');

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
    isStale,
    message: analysisMessage,
    canRetry,
    setVariable,
    setRegion,
    setPoint,
    setStartDate,
    setEndDate,
    updateFilters,
    run,
    retry,
    reset,
  } = useAnalysis({ regions, availability, defaults });
  const selectedVariable = filters.variableId;
  const selectedRegion = filters.regionId;
  const selectedPosition = filters.point;
  const startDate = filters.startDate;
  const endDate = filters.endDate;
  const statusMessage = analysisMessage || catalogMessage;

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([fetchVariables(controller.signal), fetchRegions(controller.signal)])
      .then(([fetchedVariables, fetchedRegions]) => {
        if (controller.signal.aborted) return;
        setVariables(fetchedVariables);
        setRegions(fetchedRegions);
        updateFilters((current) => ({
          ...current,
          variableId: fetchedVariables.some((variable) => variable.id === current.variableId)
            ? current.variableId
            : fetchedVariables[0].id,
          regionId:
            fetchedRegions.some((region) => region.id === current.regionId) || !fetchedRegions[0]
              ? current.regionId
              : fetchedRegions[0].id,
        }));
        setCatalogMessage('Catalog ready. Choose a filter and run an analysis.');
      })
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        setCatalogError(`Catalog API request failed: ${error.message}`);
        setCatalogMessage(`Catalog API request failed: ${error.message}`);
      });

    return () => {
      controller.abort();
    };
  }, [updateFilters]);

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

  const resultVariable = useMemo(
    () => variables.find((item) => item.id === analysis?.variable_id),
    [analysis, variables],
  );

  useEffect(() => {
    setExportMessage('');
  }, [analysis]);

  const selectedAvailability =
    availability?.variable_id === selectedVariable && availability.region_id === selectedRegion
      ? availability
      : null;

  const applyExample = (example: ExampleConfig) => {
    run({
      variableId: example.variableId,
      regionId: example.regionId,
      point: null,
      startDate: example.startDate,
      endDate: example.endDate,
    });
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
  const chartPadding = 28;
  const monthlySeries = analysis?.chart_points.filter((point) => point.aggregation === 'monthly') ?? [];
  const annualSeries = analysis?.annual_points ?? [];
  const confidenceArea = analysis?.confidence_band ?? [];

  const monthlyPath = createChartPath(
    monthlySeries,
    chartWidth,
    chartHeight,
    chartPadding,
    resultVariable?.circular ?? false,
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
          <div className="field-group">
            <label htmlFor="variable">Variable</label>
            <select
              id="variable"
              value={selectedVariable}
              onChange={(event) => setVariable(event.target.value)}
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
              onClick={() => run()}
              disabled={availabilityState === 'loading' || selectedAvailability?.available === false}
            >
              Run analysis
            </button>
            <button type="button" className="ghost-button" onClick={() => { setExportMessage(''); reset(); }}>
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
          <LazyMap
            regions={regions}
            selectedRegion={selectedRegion}
            selectedPosition={selectedPosition}
            onSelectPosition={setPoint}
          />

          <div className="region-list" role="list" aria-label="Regions">
            {regions.map((region) => (
              <button
                key={region.id}
                type="button"
                className={selectedRegion === region.id ? 'selected-region' : ''}
                onClick={() => setRegion(region.id)}
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

      {status === 'error' || catalogError ? (
        <section className="panel result-empty" role="alert">
          <h2>Unable to complete the request</h2>
          <p>{status === 'error' ? analysisMessage : catalogError}</p>
          {status === 'error' && canRetry ? (
            <button type="button" className="secondary-button small-button" onClick={retry}>
              Try again
            </button>
          ) : null}
        </section>
      ) : null}

      {isStale ? (
        <section className="panel result-empty" role="status">
          <p>{STALE_NOTICE}</p>
        </section>
      ) : null}

      {status === 'loading' ? (
        <section className="panel result-empty" aria-live="polite">
          <h2>Loading results</h2>
          <p>Building the time series and trend estimate…</p>
        </section>
      ) : null}

      {resultKind === 'no-data' && (status === 'no-data' || status === 'stale') ? (
        <section className="panel result-empty" role="status">
          <h2>No valid series</h2>
          <p>The selected filters do not produce a valid observation record.</p>
        </section>
      ) : null}

      {resultKind === 'success' && (status === 'success' || status === 'stale') && analysis ? (
        <section className="panel result-grid" aria-live="polite">
          <div className="chart-card">
            <div className="section-header">
              <h2>{resultVariable?.name ?? analysis.variable_id} at the selected point</h2>
              <button type="button" className="secondary-button small-button" onClick={() => void handleExport()}>
                Export CSV
              </button>
            </div>
            {exportMessage ? <p className="export-message" role="status">{exportMessage}</p> : null}

            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="trend-chart" role="img" aria-label="Environmental variation chart">
              <g>
                <line x1={chartPadding} y1={chartHeight - chartPadding} x2={chartWidth - chartPadding} y2={chartHeight - chartPadding} className="axis-line" />
                <line x1={chartPadding} y1={chartPadding} x2={chartPadding} y2={chartHeight - chartPadding} className="axis-line" />
              </g>

              {confidenceArea.length > 0 ? <path d={confidencePath} className="confidence-band" /> : null}
              {annualSeries.length > 0 ? <path d={annualPath} className="annual-line" /> : null}
              {monthlySeries.length > 0 ? <path d={monthlyPath} className="monthly-line" /> : null}
            </svg>

            <div className="legend" aria-label="Chart legend">
              <span><i className="legend-dot legend-dot--monthly" /> Monthly observations</span>
              <span><i className="legend-dot legend-dot--annual" /> Annual mean</span>
              <span><i className="legend-dot legend-dot--confidence" /> Confidence band</span>
            </div>
          </div>

          <aside className="metric-card">
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

      {resultKind === 'success' && (status === 'success' || status === 'stale') && analysis ? (
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
