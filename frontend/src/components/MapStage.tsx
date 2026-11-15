import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Tooltip,
  useMap,
  useMapEvents,
  ZoomControl,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoJSONPoint, RegionRecord } from '../api/client';
import { readMapTheme } from '../lib/mapTheme';

export type MapStageProps = {
  regions: RegionRecord[];
  selectedRegion: string;
  /** The point that will be analysed (the region center when none was chosen). */
  selectedPosition?: GeoJSONPoint | null;
  /** True when `selectedPosition` is the default region center rather than a choice. */
  isDefaultPoint?: boolean;
  onSelectPosition: (position: GeoJSONPoint) => void;
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

function SelectedRegionViewport({ region }: { region?: RegionRecord }) {
  const map = useMap();

  useEffect(() => {
    if (region) {
      map.flyTo(
        [region.center.latitude, region.center.longitude],
        Math.max(map.getZoom(), 6),
        { duration: 0.45 },
      );
    }
  }, [map, region]);

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
    click: ({ latlng }) =>
      onSelectPosition({
        type: 'Point',
        coordinates: [latlng.lng, latlng.lat],
      }),
    // Keyboard: arrow keys pan the map; Enter chooses the point at the center of the view.
    keydown: ({ originalEvent }) => {
      if (originalEvent.key !== 'Enter') return;
      originalEvent.preventDefault();
      const center = map.getCenter();
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
    container.setAttribute('aria-label', 'Map of the selected region');
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
}: MapStageProps) {
  const theme = useMemo(() => readMapTheme(), []);
  const initialRegion = regions.find((region) => region.id === selectedRegion) ?? regions[0];
  const initialCenter: [number, number] = initialRegion
    ? [initialRegion.center.latitude, initialRegion.center.longitude]
    : [-7, -39];
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
    if (!activeRegion) {
      setRegionBoundaries([]);
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
      if (
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
    [onSelectPosition, regionBoundaries],
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
  const boundaryMessage = nationalBoundaryLoading
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

  return (
    <div className="map-root">
      <MapContainer
        className="interactive-map"
        center={initialCenter}
        zoom={6}
        minZoom={3}
        maxZoom={17}
        scrollWheelZoom
        keyboard
        zoomControl={false}
        attributionControl={false}
      >
        {/* No third-party tiles: the background is a flat dark colour (CSS); only IBGE boundaries are drawn. */}
        <ZoomControl position="bottomright" />
        <MapAccessibility describedBy="map-keyboard-help" />
        <ViewportBoundsReporter onChange={reportViewportBounds} />
        <MapPositionSelector onSelectPosition={handleMapPositionSelect} />
        <SelectedRegionViewport region={activeRegion} />
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
      <p className="visually-hidden" id="map-keyboard-help">
        Click the map to choose the point. With the keyboard, use the arrow keys to move the map and press Enter to
        choose the point at the center of the view, or type latitude and longitude in the Point menu.
      </p>
      <p className="map-boundary-status" role="status" aria-live="polite">
        {boundaryMessage}
      </p>
      <p className="map-attribution">
        Boundaries:{' '}
        <a href="https://www.ibge.gov.br/" target="_blank" rel="noreferrer noopener">
          IBGE
        </a>{' '}
        &copy; IBGE &middot;{' '}
        <a href="https://leafletjs.com/" target="_blank" rel="noreferrer noopener">
          Leaflet
        </a>
      </p>
    </div>
  );
}
