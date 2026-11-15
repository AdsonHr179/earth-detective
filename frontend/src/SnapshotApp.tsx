import { useEffect, useState } from 'react';
import { adaptBackendAnalysis, type AnalysisResponse, type BackendAnalysisResponse, type RegionRecord, type VariableRecord } from './api/client';
import AppShell from './components/AppShell';
import LazyMap from './components/LazyMap';
import ResultPanel from './components/ResultPanel';
import ResultSheet from './components/ResultSheet';
import StateNotice from './components/StateNotice';
import { ErrorState } from './components/StateViews';
import { COMPACT_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import { formatCoordinatePair, formatRetrievedAt } from './lib/format';

export type SnapshotManifest = {
  kind: 'archived-nasa-observations';
  backend_integration_sha: string;
  analysis_id: string;
  analysis_path: string;
  csv_path: string;
  artifact_sha256: string;
  csv_sha256: string;
  region: RegionRecord;
  variable: VariableRecord;
};

type Loaded = { manifest: SnapshotManifest; analysis: AnalysisResponse };

function archivePath(path: string): string {
  if (!/^\/snapshots\/[a-zA-Z0-9._-]+\.(json|csv)$/.test(path)) {
    throw new Error('The archived record has an invalid local asset path.');
  }
  return path;
}

async function readJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`The archived record could not be loaded (${response.status}).`);
  return response.json() as Promise<T>;
}

async function loadArchive(signal: AbortSignal): Promise<Loaded> {
  const manifest = await readJson<SnapshotManifest>('/snapshots/manifest.json', signal);
  if (manifest.kind !== 'archived-nasa-observations') throw new Error('Unknown archived record format.');
  archivePath(manifest.csv_path);
  const raw = await readJson<BackendAnalysisResponse>(archivePath(manifest.analysis_path), signal);
  if (raw.analysis_id !== manifest.analysis_id || typeof raw.source !== 'string' || !raw.source.includes('NASA') || !raw.retrieved_at) {
    throw new Error('The archived record is missing matching source and acquisition metadata.');
  }
  return { manifest, analysis: adaptBackendAnalysis(raw) };
}

async function downloadArchive(manifest: SnapshotManifest) {
  const response = await fetch(archivePath(manifest.csv_path));
  if (!response.ok) throw new Error(`The archived export could not be loaded (${response.status}).`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `nasa-power-${manifest.analysis_id}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Explicit static edition: only archived real observations; no API or synthetic fallback. */
export default function SnapshotApp() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const compact = useMediaQuery(COMPACT_QUERY);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setLoaded(null);
    loadArchive(controller.signal).then((value) => {
      if (!controller.signal.aborted) setLoaded(value);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure);
    });
    return () => controller.abort();
  }, [attempt]);
  const analysis = loaded?.analysis;
  const point = analysis?.spatial_query;
  const coordinates = point ? formatCoordinatePair(point.coordinates[1], point.coordinates[0]) : '';
  return (
    <AppShell sheetCollapsed={compact && !expanded}
      controls={<div className="controls-bar">
        <h1 className="brand">Earth Detective</h1>
        <span className="chip"><span className="chip-value">Archived NASA snapshot</span></span>
        <span className="chip"><span className="chip-value">No live NASA queries</span></span>
      </div>}
      map={loaded ? <LazyMap regions={[loaded.manifest.region]} selectedRegion={analysis!.region_id}
        selectedPosition={point} readOnly onSelectPosition={() => undefined} />
        : <div className="map-placeholder" role="status">Loading archived location…</div>}
      mapFooter={point ? <p className="point-readout"><strong>Archived point: {coordinates}</strong>
        <span className="point-readout-help">One grid cell. Panning does not change the archived record.</span></p> : null}
      result={<ResultSheet compact={compact} expanded={expanded} onToggle={() => setExpanded((value) => !value)}
        summary="Archived NASA record">
        <StateNotice tone="warn" title="Archived NASA snapshot">
          <p>This edition shows a saved record from a real NASA query. Its point and period are fixed; it offers no live environmental queries.</p>
          {analysis?.retrieved_at ? <p>NASA data acquired {formatRetrievedAt(analysis.retrieved_at)}.</p> : null}
          {loaded ? <p><a href={loaded.manifest.analysis_path} download>Download saved JSON</a> · <a href="/credits.html">Credits and AI use</a></p> : null}
        </StateNotice>
        {error ? <ErrorState error={error} onRetry={() => setAttempt((value) => value + 1)} />
          : loaded ? <>
            <ResultPanel analysis={loaded.analysis} kind={loaded.analysis.valid_observations ? 'success' : 'no-data'}
              stale={false} variableName={loaded.manifest.variable.name} regionName={loaded.manifest.region.name}
              onExport={() => downloadArchive(loaded.manifest)} />
            <details className="more"><summary>Measurements and interpretation</summary>
              <p>The challenge's <a href="https://ntrs.nasa.gov/citations/20090042747" target="_blank" rel="noreferrer">NASA SeaWiFS time-series resource</a> explains how sediment and dissolved material can affect the interpretation of coastal chlorophyll observations.</p>
              <p>We use that example to distinguish a measured variable from a broader explanation. This temperature record describes one cell; it does not establish a cause or a statewide climate trend. The SeaWiFS study does not validate this temperature estimate.</p>
            </details>
            <details className="more"><summary>Archive identity</summary><dl className="facts">
              <dt>Backend integration revision</dt><dd>{loaded.manifest.backend_integration_sha}</dd>
              <dt>Saved JSON SHA-256</dt><dd>{loaded.manifest.artifact_sha256}</dd>
              <dt>Saved CSV SHA-256</dt><dd>{loaded.manifest.csv_sha256}</dd>
            </dl></details>
          </> : <p role="status">Loading saved NASA observations…</p>}
      </ResultSheet>}
    />
  );
}
