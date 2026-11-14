import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoJSONPoint, RegionRecord } from '../api/client';

type RegionMapProps = {
  regions: RegionRecord[];
  selectedRegion: string;
  selectedPosition?: GeoJSONPoint | null;
  onSelectPosition: (position: GeoJSONPoint) => void;
};

type VisibleBoundary = {
  stateCode: string;
  data: GeoJSON.GeoJsonObject;
  bounds: L.LatLngBounds;
};

const boundaryCache = new Map<string, GeoJSON.GeoJsonObject>();
const boundaryStyle: L.PathOptions = {
  color: '#0c8b62',
  fillColor: '#0c8b62',
  fillOpacity: 0.12,
  weight: 2,
};
const selectedBoundaryStyle: L.PathOptions = {
  color: '#b66b12',
  fillColor: '#f1a63b',
  fillOpacity: 0.24,
  weight: 3,
};
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
  useMapEvents({
    click: ({ latlng }) =>
      onSelectPosition({
        type: 'Point',
        coordinates: [latlng.lng, latlng.lat],
      }),
  });

  return null;
}

export default function RegionMap({
  regions,
  selectedRegion,
  selectedPosition,
  onSelectPosition,
}: RegionMapProps) {
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
    <>
      <MapContainer
        className="interactive-map"
        center={initialCenter}
        zoom={6}
        minZoom={3}
        maxZoom={17}
        scrollWheelZoom
        keyboard
        aria-label="Interactive map of available regions"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Boundaries: <a href="https://www.ibge.gov.br/">IBGE</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ViewportBoundsReporter onChange={reportViewportBounds} />
        <MapPositionSelector onSelectPosition={handleMapPositionSelect} />
        <SelectedRegionViewport region={activeRegion} />
        {displayedBoundaries.map((boundary) => (
          <GeoJSON
            key={boundary.stateCode}
            data={boundary.data}
            style={
              boundary.stateCode === selectedStateBoundary?.stateCode
                ? selectedBoundaryStyle
                : boundaryStyle
            }
            interactive={false}
          />
        ))}
        {selectedPosition?.type === 'Point' ? (
          <CircleMarker
            center={[selectedPosition.coordinates[1], selectedPosition.coordinates[0]]}
            radius={9}
            pathOptions={{
              color: '#b66b12',
              fillColor: '#f1a63b',
              fillOpacity: 0.85,
              weight: 3,
            }}
          >
            <Tooltip>Selected analysis position</Tooltip>
          </CircleMarker>
        ) : null}
      </MapContainer>
      <p className="map-boundary-status" role="status" aria-live="polite">
        {boundaryMessage}
      </p>
    </>
  );
}
