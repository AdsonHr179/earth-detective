import { useEffect, useRef, useState } from 'react';
import { Map, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import globeWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GeoJSONPoint } from '../api/client';

type Props = {
  point?: GeoJSONPoint | null;
  resetVersion: number;
  onSelectPosition: (position: GeoJSONPoint) => void;
};

// Let Vite serve the worker next to the other build assets.
setWorkerUrl(globeWorkerUrl);

const OVERVIEW_CENTER: [number, number] = [-20, 20];
function overviewZoom(height: number) {
  return Math.min(1.5, 0.85 + Math.log2(Math.max(120, height) / 250));
}

export default function WorldGlobe({ point, resetVersion, onSelectPosition }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Map>();
  const marker = useRef<Marker>();
  const initialPoint = useRef(point);
  const initialResetVersion = useRef(resetVersion);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const longitude = point?.coordinates[0];
  const latitude = point?.coordinates[1];

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    let globe: Map;
    let fittedZoom = overviewZoom(host.clientHeight);
    try {
      globe = new Map({
        container: host,
        center: initialPoint.current?.coordinates ?? OVERVIEW_CENTER,
        zoom: fittedZoom,
        maxZoom: 19,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
        canvasContextAttributes: { failIfMajorPerformanceCaveat: true },
        renderWorldCopies: false,
        style: {
          version: 8,
          projection: { type: 'globe' },
          sources: {
            streets: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              maxzoom: 19,
              attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            },
          },
          layers: [{ id: 'streets', type: 'raster', source: 'streets' }],
        },
      });
    } catch {
      setFailed(true);
      return;
    }

    map.current = globe;
    globe.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');
    const startupTimer = window.setTimeout(() => setFailed(true), 15_000);
    globe.once('load', () => {
      window.clearTimeout(startupTimer);
      setLoading(false);
      setFailed(false);
    });
    globe.on('webglcontextlost', () => setFailed(true));
    globe.on('webglcontextrestored', () => setFailed(false));
    globe.on('click', ({ lngLat, point: pixel }) => {
      if (!Number.isFinite(lngLat.lng) || !Number.isFinite(lngLat.lat)) return;
      // A click beyond the horizon can unproject to the edge of the globe.
      if (globe.project(lngLat).dist(pixel) > 2) return;
      const position = lngLat.wrap();
      onSelectPosition({ type: 'Point', coordinates: [position.lng, position.lat] });
    });
    const canvas = globe.getCanvas();
    function selectCenter(event: KeyboardEvent) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const position = globe.getCenter().wrap();
      onSelectPosition({ type: 'Point', coordinates: [position.lng, position.lat] });
    }
    canvas.addEventListener('keydown', selectCenter);
    const observer = new ResizeObserver(() => {
      const wasFitted = Math.abs(globe.getZoom() - fittedZoom) < 0.001;
      globe.resize();
      fittedZoom = overviewZoom(host.clientHeight);
      if (wasFitted) globe.jumpTo({ zoom: fittedZoom });
    });
    observer.observe(host);

    return () => {
      window.clearTimeout(startupTimer);
      observer.disconnect();
      canvas.removeEventListener('keydown', selectCenter);
      marker.current?.remove();
      marker.current = undefined;
      globe.remove();
      map.current = undefined;
    };
  }, [onSelectPosition]);

  useEffect(() => {
    const globe = map.current;
    if (!globe) return;
    if (longitude === undefined || latitude === undefined) {
      marker.current?.remove();
      marker.current = undefined;
      return;
    }
    if (!marker.current) marker.current = new Marker({ color: '#f0e442' });
    marker.current.setLngLat([longitude, latitude]).addTo(globe);
  }, [longitude, latitude]);

  useEffect(() => {
    if (resetVersion === initialResetVersion.current) return;
    map.current?.jumpTo({
      center: OVERVIEW_CENTER, zoom: overviewZoom(container.current?.clientHeight ?? 0), bearing: 0, pitch: 0,
    });
  }, [resetVersion]);

  return (
    <>
      <div className="map-surface map-surface--globe" role="group" aria-label="Interactive 3D globe" ref={container} />
      {failed || loading ? (
        <div className="map-view-notice" role="status">
          {failed ? 'The 3D globe could not load on this device. Select Street map to continue.' : 'Loading 3D globe…'}
        </div>
      ) : null}
    </>
  );
}
