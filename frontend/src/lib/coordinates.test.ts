import { describe, expect, it } from 'vitest';
import { coordinateText, parseCoordinate, validatePoint } from './coordinates';

describe('parseCoordinate', () => {
  it('accepts values inside the range, including the limits', () => {
    expect(parseCoordinate('-4.5', 'latitude')).toEqual({ ok: true, value: -4.5 });
    expect(parseCoordinate('90', 'latitude')).toEqual({ ok: true, value: 90 });
    expect(parseCoordinate('-90', 'latitude')).toEqual({ ok: true, value: -90 });
    expect(parseCoordinate('180', 'longitude')).toEqual({ ok: true, value: 180 });
    expect(parseCoordinate('-180', 'longitude')).toEqual({ ok: true, value: -180 });
    expect(parseCoordinate('0', 'longitude')).toEqual({ ok: true, value: 0 });
  });

  it('rejects latitude outside -90..90 and longitude outside -180..180', () => {
    expect(parseCoordinate('90.0001', 'latitude').ok).toBe(false);
    expect(parseCoordinate('-91', 'latitude').ok).toBe(false);
    expect(parseCoordinate('180.5', 'longitude').ok).toBe(false);
    expect(parseCoordinate('-181', 'longitude').ok).toBe(false);
    // a latitude is not valid as a longitude limit and vice versa
    expect(parseCoordinate('120', 'latitude').ok).toBe(false);
    expect(parseCoordinate('120', 'longitude').ok).toBe(true);
  });

  it('rejects empty text and anything that is not a plain number', () => {
    for (const text of ['', '   ', 'abc', '4,5,6', '1e3', 'Infinity', 'NaN', '--4', '4..5', '4 5', '0x10']) {
      const result = parseCoordinate(text, 'latitude');
      expect(result.ok, `"${text}"`).toBe(false);
    }
  });

  it('accepts a decimal comma, a degree sign and the typographic minus', () => {
    expect(parseCoordinate('-4,5', 'latitude')).toEqual({ ok: true, value: -4.5 });
    expect(parseCoordinate('38.5°', 'longitude')).toEqual({ ok: true, value: 38.5 });
    expect(parseCoordinate('−38.5', 'longitude')).toEqual({ ok: true, value: -38.5 });
    expect(parseCoordinate('  12.25 ', 'latitude')).toEqual({ ok: true, value: 12.25 });
  });

  it('says what to fix, naming the axis and the range', () => {
    const empty = parseCoordinate('', 'latitude');
    const range = parseCoordinate('95', 'latitude');
    const notNumber = parseCoordinate('north', 'longitude');
    expect(empty.ok === false && empty.message).toBe('Enter a latitude between −90 and 90.');
    expect(range.ok === false && range.message).toBe('Latitude must be between −90 and 90.');
    expect(notNumber.ok === false && notNumber.message).toBe('Longitude must be a number between −180 and 180.');
  });
});

describe('validatePoint', () => {
  it('returns a GeoJSON point with longitude first', () => {
    expect(validatePoint('-4.5', '-38.5')).toEqual({
      ok: true,
      point: { type: 'Point', coordinates: [-38.5, -4.5] },
    });
  });

  it('reports each invalid field separately', () => {
    const result = validatePoint('100', 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.latitude).toBeDefined();
      expect(result.errors.longitude).toBeDefined();
    }
    const onlyLongitude = validatePoint('10', '200');
    expect(onlyLongitude.ok === false && onlyLongitude.errors).toEqual({
      longitude: 'Longitude must be between −180 and 180.',
    });
  });
});

describe('coordinateText', () => {
  it('shows at most four decimals', () => {
    expect(coordinateText(-4.123456)).toBe('-4.1235');
    expect(coordinateText(-5)).toBe('-5');
  });
});
