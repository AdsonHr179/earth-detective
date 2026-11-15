import type { GeoJSONPoint } from '../api/client';

export type Axis = 'latitude' | 'longitude';
export type CoordinateResult = { ok: true; value: number } | { ok: false; message: string };

const LIMITS: Record<Axis, number> = { latitude: 90, longitude: 180 };
const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

function capitalised(axis: Axis) {
  return axis === 'latitude' ? 'Latitude' : 'Longitude';
}

/**
 * Reads one coordinate typed by a person. Accepts a decimal comma, a trailing degree sign and
 * the typographic minus. Rejects empty text, non-numbers and values outside the valid range
 * (latitude -90 to 90, longitude -180 to 180), with a sentence that says what to fix.
 */
export function parseCoordinate(text: string, axis: Axis): CoordinateResult {
  const limit = LIMITS[axis];
  const range = `−${limit} and ${limit}`;
  const cleaned = text
    .trim()
    .replace(/−/g, '-')
    .replace(/°$/, '')
    .replace(',', '.')
    .trim();

  if (cleaned === '') {
    return { ok: false, message: `Enter a ${axis} between ${range}.` };
  }
  if (!NUMBER.test(cleaned)) {
    return { ok: false, message: `${capitalised(axis)} must be a number between ${range}.` };
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < -limit || value > limit) {
    return { ok: false, message: `${capitalised(axis)} must be between ${range}.` };
  }
  return { ok: true, value };
}

export type PointValidation =
  | { ok: true; point: GeoJSONPoint }
  | { ok: false; errors: { latitude?: string; longitude?: string } };

/** Validates both fields together and returns a GeoJSON point (longitude first) or the errors per field. */
export function validatePoint(latitudeText: string, longitudeText: string): PointValidation {
  const latitude = parseCoordinate(latitudeText, 'latitude');
  const longitude = parseCoordinate(longitudeText, 'longitude');
  if (latitude.ok && longitude.ok) {
    return { ok: true, point: { type: 'Point', coordinates: [longitude.value, latitude.value] } };
  }
  return {
    ok: false,
    errors: {
      ...(latitude.ok ? {} : { latitude: latitude.message }),
      ...(longitude.ok ? {} : { longitude: longitude.message }),
    },
  };
}

/** A coordinate as the text shown in its field. */
export function coordinateText(value: number): string {
  return String(Math.round(value * 10000) / 10000);
}
