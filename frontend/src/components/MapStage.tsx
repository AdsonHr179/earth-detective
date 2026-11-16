import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
  ZoomControl,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoJSONPoint, RegionRecord } from '../api/client';
import { readMapTheme } from '../lib/mapTheme';
import CurrentWeather from './CurrentWeather';

const WorldGlobe = lazy(() => import('./WorldGlobe'));
const GoogleMap3D = lazy(() => import('./GoogleMap3D'));
const googleMapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
type MapView = 'street' | 'globe' | 'google';
type StreetCamera = { center: L.LatLngExpression; zoom: number; regionId: string };

export type MapStageProps = {
  regions: RegionRecord[];
  selectedRegion: string;
  /** The point that will be analysed (the region center when none was chosen). */
  selectedPosition?: GeoJSONPoint | null;
  /** True when `selectedPosition` is the default region center rather than a choice. */
  isDefaultPoint?: boolean;
  onSelectPosition: (position: GeoJSONPoint) => void;
  /** Archived records allow panning, but their query point cannot be changed. */
  readOnly?: boolean;
};

type VisibleBoundary = {
  stateCode: string;
  data: GeoJSON.GeoJsonObject;
  bounds: L.LatLngBounds;
};

const boundaryCache = new Map<string, GeoJSON.GeoJsonObject>();
const brazilStateCodes = [
  '11', '12', '13', '14', '15', '16', '17',
  '21', '22', '23', '24', '25', '26', '27', '28', '29',
  '31', '32', '33', '35',
  '41', '42', '43',
  '50', '51', '52', '53',
];

function isFeatureCollection(value: unknown): value is GeoJSON.FeatureCollection {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const collection = value as { type?: unknown; features?: unknown };
  return collection.type === 'FeatureCollection' && Array.isArray(collection.features);
}

async function fetchStateBoundary(stateCode: string, signal: AbortSignal): Promise<GeoJSON.GeoJsonObject> {
  const cached = boundaryCache.get(stateCode);
  if (cached) {
    return cached;
  }

  const url = new URL(
    `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${stateCode}`,
  );
  url.search = new URLSearchParams({
    formato: 'application/vnd.geo+json',
    qualidade: 'minima',
  }).toString();

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`IBGE boundary request failed (${response.status})`);
  }

  const data: unknown = await response.json();
  if (!isFeatureCollection(data)) {
    throw new Error(`IBGE returned invalid GeoJSON for state ${stateCode}`);
  }

  boundaryCache.set(stateCode, data);
  return data;
}

function createVisibleBoundary(stateCode: string, data: GeoJSON.GeoJsonObject): VisibleBoundary {
  const bounds = L.geoJSON(data).getBounds();
  if (!bounds.isValid()) {
    throw new Error(`IBGE returned no usable geometry for state ${stateCode}`);
  }
  return { stateCode, data, bounds };
}

async function fetchBoundaries(
  stateCodes: string[],
  signal: AbortSignal,
): Promise<VisibleBoundary[]> {
  const boundaries: VisibleBoundary[] = [];
  for (let index = 0; index < stateCodes.length; index += 6) {
    const batch = await Promise.all(
      stateCodes.slice(index, index + 6).map(async (stateCode) => {
        const data = await fetchStateBoundary(stateCode, signal);
        return createVisibleBoundary(stateCode, data);
      }),
    );
    boundaries.push(...batch);
  }
  return boundaries;
}

function pointInRing(point: [number, number], ring: GeoJSON.Position[]): boolean {
  const [longitude, latitude] = point;
  let inside = false;

  for (let currentIndex = 0, previousIndex = ring.length - 1; currentIndex < ring.length; previousIndex = currentIndex++) {
    const [currentLongitude, currentLatitude] = ring[currentIndex];
    const [previousLongitude, previousLatitude] = ring[previousIndex];
    const cross =
      (longitude - currentLongitude) * (previousLatitude - currentLatitude) -
      (latitude - currentLatitude) * (previousLongitude - currentLongitude);
    if (
      Math.abs(cross) < 1e-10 &&
      longitude >= Math.min(currentLongitude, previousLongitude) &&
      longitude <= Math.max(currentLongitude, previousLongitude) &&
      latitude >= Math.min(currentLatitude, previousLatitude) &&
      latitude <= Math.max(currentLatitude, previousLatitude)
    ) {
      return true;
    }

    const crossesLatitude = (currentLatitude > latitude) !== (previousLatitude > latitude);
    if (
      crossesLatitude &&
      longitude <
        ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) /
          (previousLatitude - currentLatitude) +
          currentLongitude
    ) {
      inside = !inside;
    }
  }

  return inside;
}

function polygonContainsPoint(point: [number, number], rings: GeoJSON.Position[][]): boolean {
  return (
    rings.length > 0 &&
    pointInRing(point, rings[0]) &&
    !rings.slice(1).some((ring) => pointInRing(point, ring))
  );
}

function geometryContainsPoint(point: [number, number], geometry: GeoJSON.Geometry): boolean {
  if (geometry.type === 'Polygon') {
    return polygonContainsPoint(point, geometry.coordinates);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => polygonContainsPoint(point, polygon));
  }
  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.some((item) => geometryContainsPoint(point, item));
  }
  return false;
}

function boundaryContainsPoint(boundary: VisibleBoundary, point: [number, number]): boolean {
  if (!isFeatureCollection(boundary.data)) {
    return false;
  }
  return boundary.data.features.some(
    (feature) => feature.geometry !== null && geometryContainsPoint(point, feature.geometry),
  );
}

/** A wider view on small screens, where the map only gets about 40% of the height. */
function defaultZoom(): number {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 899px)').matches
    ? 5
    : 6;
}

const WORLD_BOUNDS: L.LatLngBoundsExpression = [[-60, -180], [80, 180]];
const PAN_BOUNDS: L.LatLngBoundsExpression = [[-85.05, -180], [85.05, 180]];

function showWorld(map: L.Map) {
  map.fitBounds(WORLD_BOUNDS, { maxZoom: 2, animate: false });
}

function SelectedRegionViewport({ region, point, readOnly }: {
  region?: RegionRecord;
  point?: GeoJSONPoint | null;
  readOnly: boolean;
}) {
  const map = useMap();
  const previousRegion = useRef<string>();
  const longitude = point?.coordinates[0];
  const latitude = point?.coordinates[1];

  useEffect(() => {
    if (!region) return;
    const previous = previousRegion.current;
    previousRegion.current = region.id;
    const changedRegion = previous !== undefined && previous !== region.id;
    if (region.center && (changedRegion || (readOnly && previous === undefined))) {
      map.setView([region.center.latitude, region.center.longitude], defaultZoom());
    } else if (!region.center) {
      if (latitude === undefined || longitude === undefined) {
        if (changedRegion) showWorld(map);
      } else if (!map.getBounds().contains([latitude, longitude])) {
        map.panTo([latitude, longitude]);
      }
    }
  }, [map, region, latitude, longitude, readOnly]);

  return null;
}

function ViewportBoundsReporter({
  onChange,
}: {
  onChange: (bounds: L.LatLngBounds) => void;
}) {
  const map = useMap();
  const reportBounds = useCallback(() => onChange(map.getBounds()), [map, onChange]);

  useMapEvents({ moveend: reportBounds, zoomend: reportBounds });
  useEffect(() => reportBounds(), [reportBounds]);

  return null;
}

function MapPositionSelector({
  onSelectPosition,
}: {
  onSelectPosition: (position: GeoJSONPoint) => void;
}) {
  const map = useMap();

  useMapEvents({
    click: ({ latlng }) => {
      if (latlng.lng < -180 || latlng.lng > 180) return;
      onSelectPosition({ type: 'Point', coordinates: [latlng.lng, latlng.lat] });
    },
    // Keyboard: arrow keys pan the map; Enter chooses the point at the center of the view.
    keydown: ({ originalEvent }) => {
      if (originalEvent.key !== 'Enter') return;
      originalEvent.preventDefault();
      const center = map.wrapLatLng(map.getCenter());
      onSelectPosition({ type: 'Point', coordinates: [center.lng, center.lat] });
    },
  });

  return null;
}

/** Names the map for assistive technology and keeps Leaflet in step with its container size. */
function MapAccessibility({ describedBy }: { describedBy: string }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'World map');
    container.setAttribute('aria-describedby', describedBy);
  }, [map, describedBy]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  return null;
}

export default function MapStage({
  regions,
  selectedRegion,
  selectedPosition,
  isDefaultPoint = false,
  onSelectPosition,
  readOnly = false,
}: MapStageProps) {
  const theme = useMemo(() => readMapTheme(), []);
  const mapRef = useRef<L.Map | null>(null);
  const [mapView, setMapView] = useState<MapView>('street');
  const mapViewControl = useRef<HTMLSelectElement>(null);
  const [streetCamera, setStreetCamera] = useState<StreetCamera>();
  const [worldReset, setWorldReset] = useState(0);
  const streetMode = readOnly || mapView === 'street';
  const activeRegion = regions.find((region) => region.id === selectedRegion);
  const [viewportBounds, setViewportBounds] = useState<L.LatLngBounds | null>(null);
  const [regionBoundaries, setRegionBoundaries] = useState<VisibleBoundary[]>([]);
  const [boundaryLoading, setBoundaryLoading] = useState(false);
  const [boundaryError, setBoundaryError] = useState('');
  const [nationalBoundaries, setNationalBoundaries] = useState<VisibleBoundary[]>([]);
  const [nationalBoundaryLoading, setNationalBoundaryLoading] = useState(false);
  const [nationalBoundaryError, setNationalBoundaryError] = useState('');
  const nationalBoundaryRequest = useRef<Promise<void> | null>(null);
  const nationalBoundaryController = useRef<AbortController | null>(null);
  const reportViewportBounds = useCallback((bounds: L.LatLngBounds) => {
    setViewportBounds(bounds);
  }, []);

  useEffect(() => {
    if (!activeRegion?.center) {
      setRegionBoundaries([]);
      setBoundaryLoading(false);
      setBoundaryError('');
      return;
    }

    const stateCodes = activeRegion.boundaryStateCodes;
    if (!Array.isArray(stateCodes) || stateCodes.length === 0) {
      setRegionBoundaries([]);
      setBoundaryLoading(false);
      setBoundaryError('The selected region has no IBGE boundary codes in the backend catalog.');
      return;
    }

    if (stateCodes.some((code) => !/^\d{2}$/.test(code))) {
      setRegionBoundaries([]);
      setBoundaryLoading(false);
      setBoundaryError('The backend returned an invalid IBGE state code for the selected region.');
      return;
    }

    const controller = new AbortController();
    setRegionBoundaries([]);
    setBoundaryLoading(true);
    setBoundaryError('');

    fetchBoundaries(stateCodes, controller.signal)
      .then((boundaries) => {
        if (!controller.signal.aborted) {
          setRegionBoundaries(boundaries);
          setBoundaryLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setRegionBoundaries([]);
          setBoundaryLoading(false);
          setBoundaryError(
            error instanceof Error ? error.message : 'Could not load IBGE boundaries.',
          );
        }
      });

    return () => controller.abort();
  }, [activeRegion]);

  useEffect(
    () => () => {
      nationalBoundaryController.current?.abort();
    },
    [],
  );

  const handleMapPositionSelect = useCallback(
    (position: GeoJSONPoint) => {
      onSelectPosition(position);
      const [longitude, latitude] = position.coordinates;
      if (
        !activeRegion?.center ||
        longitude < -74 || longitude > -28 || latitude < -34 || latitude > 6 ||
        regionBoundaries.some((boundary) =>
          boundaryContainsPoint(boundary, position.coordinates),
        ) ||
        nationalBoundaryRequest.current
      ) {
        return;
      }

      const controller = new AbortController();
      nationalBoundaryController.current = controller;
      setNationalBoundaryLoading(true);
      setNationalBoundaryError('');
      nationalBoundaryRequest.current = fetchBoundaries(brazilStateCodes, controller.signal)
        .then((boundaries) => {
          if (!controller.signal.aborted) {
            setNationalBoundaries(boundaries);
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setNationalBoundaryError(
              error instanceof Error ? error.message : 'Could not load IBGE state boundaries.',
            );
            nationalBoundaryRequest.current = null;
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setNationalBoundaryLoading(false);
          }
        });
    },
    [activeRegion, onSelectPosition, regionBoundaries],
  );

  const selectedStateBoundary = useMemo(() => {
    if (!selectedPosition) {
      return undefined;
    }
    return [...regionBoundaries, ...nationalBoundaries].find((boundary) =>
      boundaryContainsPoint(boundary, selectedPosition.coordinates),
    );
  }, [nationalBoundaries, regionBoundaries, selectedPosition]);

  const visibleBoundaries = useMemo(
    () =>
      viewportBounds
        ? regionBoundaries.filter((boundary) => viewportBounds.intersects(boundary.bounds))
        : [],
    [regionBoundaries, viewportBounds],
  );
  const displayedBoundaries = useMemo(() => {
    if (
      !selectedStateBoundary ||
      !viewportBounds?.intersects(selectedStateBoundary.bounds) ||
      visibleBoundaries.some((boundary) => boundary.stateCode === selectedStateBoundary.stateCode)
    ) {
      return visibleBoundaries;
    }
    return [...visibleBoundaries, selectedStateBoundary];
  }, [selectedStateBoundary, viewportBounds, visibleBoundaries]);
  const boundaryMessage = !activeRegion?.center ? '' : nationalBoundaryLoading
    ? 'Finding the official IBGE boundary for the selected point...'
    : nationalBoundaryError
      ? `Could not find the selected state's IBGE boundary: ${nationalBoundaryError}`
      : boundaryLoading
        ? `Loading official IBGE boundaries for ${activeRegion?.boundaryStateCodes.length ?? 0} state(s)...`
        : boundaryError
          ? `Could not show the selected region mask: ${boundaryError}`
          : selectedPosition
            ? selectedStateBoundary
              ? `Highlighted the official IBGE boundary for state ${selectedStateBoundary.stateCode}.`
              : 'No IBGE state boundary contains the selected point.'
            : visibleBoundaries.length > 0
              ? `Showing ${visibleBoundaries.length} IBGE boundary mask(s) visible in the map.`
              : 'No selected-region boundaries are visible in the current map view.';

  const nextStreetCamera = streetCamera && streetCamera.regionId !== selectedRegion && activeRegion?.center
    ? {
        center: L.latLng(activeRegion.center.latitude, activeRegion.center.longitude),
        zoom: defaultZoom(),
      }
    : streetCamera;

  function changeMapView(next: MapView) {
    const streetMap = mapRef.current;
    if (streetMap && mapView === 'street' && next !== 'street') {
      setStreetCamera({ center: streetMap.getCenter(), zoom: streetMap.getZoom(), regionId: selectedRegion });
    }
    setMapView(next);
  }

  return (
    <div className={readOnly ? 'map-root map-root--archive' : 'map-root'}>
      {streetMode ? (
        <MapContainer
          className="interactive-map"
          ref={mapRef}
          center={nextStreetCamera?.center}
          zoom={nextStreetCamera?.zoom}
          bounds={WORLD_BOUNDS}
          boundsOptions={{ maxZoom: 2 }}
          minZoom={0}
          maxBounds={PAN_BOUNDS}
          maxBoundsViscosity={1}
          maxZoom={19}
          scrollWheelZoom
          keyboard
          zoomControl={false}
          attributionControl={false}
        >
          {!readOnly ? <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" noWrap /> : null}
          <ZoomControl position="bottomright" />
          <MapAccessibility describedBy="map-keyboard-help" />
          <ViewportBoundsReporter onChange={reportViewportBounds} />
          {!readOnly ? <MapPositionSelector onSelectPosition={handleMapPositionSelect} /> : null}
          <SelectedRegionViewport region={activeRegion} point={selectedPosition} readOnly={readOnly} />
          {displayedBoundaries.map((boundary) => (
            <GeoJSON
              key={boundary.stateCode}
              data={boundary.data}
              style={
                boundary.stateCode === selectedStateBoundary?.stateCode
                  ? theme.selectedBoundary
                  : theme.boundary
              }
              interactive={false}
            />
          ))}
          {selectedPosition?.type === 'Point' ? (
            <>
              <CircleMarker
                center={[selectedPosition.coordinates[1], selectedPosition.coordinates[0]]}
                radius={11}
                pathOptions={theme.pointRing}
              >
                <Tooltip>{isDefaultPoint ? 'Region center (default point)' : 'Selected analysis point'}</Tooltip>
              </CircleMarker>
              <CircleMarker
                center={[selectedPosition.coordinates[1], selectedPosition.coordinates[0]]}
                radius={3.5}
                interactive={false}
                pathOptions={theme.pointDot}
              />
            </>
          ) : null}
        </MapContainer>
      ) : (
        <Suspense fallback={<div className="map-placeholder" role="status">Loading map…</div>}>
          {mapView === 'google' && googleMapsKey ? (
            <GoogleMap3D
              apiKey={googleMapsKey} point={selectedPosition}
              resetVersion={worldReset} onSelectPosition={onSelectPosition}
            />
          ) : (
            <WorldGlobe point={selectedPosition} resetVersion={worldReset} onSelectPosition={onSelectPosition} />
          )}
        </Suspense>
      )}
      {!readOnly ? (
        <>
          <div className="map-view-controls">
            <select
              aria-label="Map view"
              ref={mapViewControl}
              value={mapView}
              onChange={(event) => changeMapView(event.target.value as MapView)}
            >
              <option value="street">Street map</option>
              <option value="globe">3D globe</option>
              <option value="google" disabled={!googleMapsKey}>
                {googleMapsKey ? 'Google 3D' : 'Google 3D (key required)'}
              </option>
            </select>
            <button
              type="button"
              onClick={() => {
                if (mapRef.current) showWorld(mapRef.current);
                else setWorldReset((value) => value + 1);
              }}
            >
              World view
            </button>
            {!streetMode ? (
              <button
                className="map-return-button"
                type="button"
                onClick={() => {
                  changeMapView('street');
                  mapViewControl.current?.focus({ preventScroll: true });
                }}
              >
                Back to street map
              </button>
            ) : null}
          </div>
          <CurrentWeather point={selectedPosition} />
        </>
      ) : null}
      <p className="visually-hidden" id="map-keyboard-help">
        {readOnly
          ? 'Archived observation point. Use arrow keys to pan the map. Panning does not query environmental data or change this record.'
          : 'Click the map to choose the point. With the keyboard, use the arrow keys to move the map and press Enter to choose the point at the center of the view, or type latitude and longitude in the Point menu.'}
      </p>
      {streetMode && boundaryMessage ? (
        <p className="map-boundary-status" role="status" aria-live="polite">
          {boundaryMessage}
        </p>
      ) : null}
      {streetMode ? (
        <p className="map-attribution">
          {!readOnly ? (
            <>
              &copy;{' '}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">
                OpenStreetMap
              </a>{' '}
              &middot;{' '}
            </>
          ) : null}
          &copy;{' '}
          <a href="https://www.ibge.gov.br/" target="_blank" rel="noreferrer noopener">
            IBGE
          </a>{' '}
          &middot;{' '}
          <a href="https://leafletjs.com/" target="_blank" rel="noreferrer noopener">
            Leaflet
          </a>
        </p>
      ) : null}
    </div>
  );
}
