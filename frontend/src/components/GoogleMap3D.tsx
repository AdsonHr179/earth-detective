import { useEffect, useRef, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import type { GeoJSONPoint } from '../api/client';

type Props = {
  apiKey: string;
  point?: GeoJSONPoint | null;
  resetVersion: number;
  onSelectPosition: (position: GeoJSONPoint) => void;
};

const OVERVIEW = { center: { lat: 15, lng: -20, altitude: 0 }, range: 18_000_000, tilt: 0, heading: 0 };
let configured = false;

export default function GoogleMap3D({ apiKey, point, resetVersion, onSelectPosition }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.maps3d.Map3DElement>();
  const marker = useRef<google.maps.maps3d.Marker3DElement>();
  const initialResetVersion = useRef(resetVersion);
  const overviewRequested = useRef(false);
  const selectedPoint = useRef(point);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    selectedPoint.current = point;
    updateMarker(point);
  }, [point]);

  function updateMarker(position?: GeoJSONPoint | null) {
    if (!map.current || !marker.current) return;
    if (!position) {
      marker.current.remove();
      return;
    }
    const [lng, lat] = position.coordinates;
    marker.current.position = { lat, lng, altitude: 0 };
    if (marker.current.parentElement !== map.current) map.current.append(marker.current);
  }

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    const lifecycle = new AbortController();
    const { signal } = lifecycle;
    let failed = false;
    const notifyFailure = () => {
      failed = true;
      if (!signal.aborted) setState('error');
    };
    const googleWindow = window as Window & { gm_authFailure?: () => void };
    const priorFailure = googleWindow.gm_authFailure;
    const onAuthFailure = () => {
      notifyFailure();
      priorFailure?.();
    };
    googleWindow.gm_authFailure = onAuthFailure;
    const timeout = window.setTimeout(notifyFailure, 20_000);

    async function load() {
      try {
        if (!configured) {
          setOptions({ key: apiKey, v: 'weekly' });
          configured = true;
        }
        const { Map3DElement, Marker3DElement } = await importLibrary('maps3d');
        if (signal.aborted || failed || !host) return;
        const coordinates = overviewRequested.current ? null : selectedPoint.current?.coordinates;
        const camera = coordinates ? {
          center: { lng: coordinates[0], lat: coordinates[1], altitude: 0 },
          range: 12_000, tilt: 45, heading: 0,
        } : OVERVIEW;
        const globe = new Map3DElement({ ...camera, mode: 'HYBRID', gestureHandling: 'GREEDY' });
        globe.setAttribute('aria-label', 'Google satellite map in 3D');
        globe.addEventListener('gmp-click', (event) => {
          const { position } = event as google.maps.maps3d.LocationClickEvent;
          if (!position || !Number.isFinite(position.lng) || !Number.isFinite(position.lat)) return;
          event.preventDefault();
          onSelectPosition({ type: 'Point', coordinates: [position.lng, position.lat] });
        }, { signal });
        globe.addEventListener('gmp-error', notifyFailure, { signal });

        map.current = globe;
        marker.current = new Marker3DElement({ label: 'Analysis point' });
        updateMarker(selectedPoint.current);
        setState('ready');
        host.append(globe);
      } catch {
        notifyFailure();
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void load();
    return () => {
      lifecycle.abort();
      window.clearTimeout(timeout);
      if (googleWindow.gm_authFailure === onAuthFailure) googleWindow.gm_authFailure = priorFailure;
      map.current?.remove();
      map.current = undefined;
      marker.current = undefined;
    };
  }, [apiKey, onSelectPosition]);

  useEffect(() => {
    if (resetVersion === initialResetVersion.current) return;
    overviewRequested.current = true;
    if (map.current) Object.assign(map.current, OVERVIEW);
  }, [resetVersion]);

  return (
    <>
      <div className="map-surface map-surface--google" ref={container} />
      {state !== 'ready' ? (
        <div className="map-view-notice" role="status">
          {state === 'error'
            ? 'Google 3D is unavailable. Check your Maps API key and project access, or select another map.'
            : 'Loading Google 3D…'}
        </div>
      ) : null}
    </>
  );
}
