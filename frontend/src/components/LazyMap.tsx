import { lazy, Suspense } from 'react';
import { useAfterFirstPaint } from '../hooks/useAfterFirstPaint';
import type { MapStageProps } from './MapStage';

// Leaflet and the map code are a separate chunk, requested only after the first paint.
const MapStage = lazy(() => import('./MapStage'));

function MapPlaceholder() {
  return (
    <div className="map-placeholder" role="status">
      Loading map…
    </div>
  );
}

export default function LazyMap(props: MapStageProps) {
  const ready = useAfterFirstPaint();
  if (!ready) return <MapPlaceholder />;
  return (
    <Suspense fallback={<MapPlaceholder />}>
      <MapStage {...props} />
    </Suspense>
  );
}
