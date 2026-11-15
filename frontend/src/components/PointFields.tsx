import { useEffect, useId, useState, type FormEvent } from 'react';
import type { GeoJSONPoint } from '../api/client';
import { coordinateText, validatePoint } from '../lib/coordinates';

type PointFieldsProps = {
  /** The point that will be analysed (the region center when none was chosen). */
  point: GeoJSONPoint | null;
  /** True when `point` is the region center rather than a choice. */
  isRegionCenter: boolean;
  onApply: (point: GeoJSONPoint) => void;
  onUseCenter?: () => void;
  /** Called after a point was applied from the fields, for example to close the menu. */
  onDone?: () => void;
};

/** Latitude and longitude fields: the keyboard and screen-reader way to choose a point, same as clicking the map. */
export default function PointFields({ point, isRegionCenter, onApply, onUseCenter, onDone }: PointFieldsProps) {
  const ids = useId();
  const latId = `${ids}-lat`;
  const lonId = `${ids}-lon`;
  const [latitude, setLatitude] = useState(point ? coordinateText(point.coordinates[1]) : '');
  const [longitude, setLongitude] = useState(point ? coordinateText(point.coordinates[0]) : '');
  const [errors, setErrors] = useState<{ latitude?: string; longitude?: string }>({});

  // Keep the fields in step when the point changes elsewhere (map click, region change, reset).
  const pointLongitude = point?.coordinates[0];
  const pointLatitude = point?.coordinates[1];
  useEffect(() => {
    setLatitude(pointLatitude === undefined ? '' : coordinateText(pointLatitude));
    setLongitude(pointLongitude === undefined ? '' : coordinateText(pointLongitude));
    setErrors({});
  }, [pointLatitude, pointLongitude]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validatePoint(latitude, longitude);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onApply(result.point);
    onDone?.();
  };

  return (
    <form className="point-form" onSubmit={submit} noValidate>
      <p className="popover-hint">
        {isRegionCenter
          ? 'Using the center of the region. Type coordinates or click the map to choose another point.'
          : 'Enter latitude and longitude or click the map to select a point.'}
      </p>
      <div className="field">
        <label htmlFor={latId}>Latitude (&minus;90 to 90)</label>
        <input
          id={latId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={latitude}
          aria-invalid={errors.latitude ? true : undefined}
          aria-describedby={errors.latitude ? `${latId}-error` : undefined}
          onChange={(event) => setLatitude(event.target.value)}
        />
        {errors.latitude ? (
          <p className="field-error" id={`${latId}-error`} role="alert">
            {errors.latitude}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor={lonId}>Longitude (&minus;180 to 180)</label>
        <input
          id={lonId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={longitude}
          aria-invalid={errors.longitude ? true : undefined}
          aria-describedby={errors.longitude ? `${lonId}-error` : undefined}
          onChange={(event) => setLongitude(event.target.value)}
        />
        {errors.longitude ? (
          <p className="field-error" id={`${lonId}-error`} role="alert">
            {errors.longitude}
          </p>
        ) : null}
      </div>
      <div className="point-actions">
        <button type="submit" className="button button--primary">
          Set point
        </button>
        {onUseCenter ? (
          <button
            type="button"
            className="button"
            disabled={isRegionCenter}
            onClick={() => {
              onUseCenter();
              onDone?.();
            }}
          >
            Use region center
          </button>
        ) : null}
      </div>
    </form>
  );
}
