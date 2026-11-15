const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MINUS = '−';

/** Parses 'YYYY-MM-DD' (or a longer ISO string) as UTC midnight. NaN when it cannot be read. */
export function parseDate(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** 'Dec 2023' from an ISO date or a UTC timestamp in milliseconds. */
export function formatMonth(date: string | number): string {
  const ms = typeof date === 'number' ? date : parseDate(date);
  if (!Number.isFinite(ms)) return String(date);
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function decimalsFor(value: number): number {
  return Math.abs(value) >= 10 ? 1 : 2;
}

export function formatNumber(value: number, decimals = decimalsFor(value)): string {
  const text = Math.abs(value).toFixed(decimals);
  return value < 0 && Number(text) !== 0 ? `${MINUS}${text}` : text;
}

/** '+0.40' or a minus sign followed by '0.40'; zero has no sign. */
export function formatSigned(value: number, decimals = decimalsFor(value)): string {
  const text = formatNumber(value, decimals);
  return value > 0 && Number(text) !== 0 ? `+${text}` : text;
}

/** '4.17° S, 38.54° W' from latitude and longitude. */
export function formatCoordinatePair(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(2)}° ${latitude < 0 ? 'S' : 'N'}`;
  const lon = `${Math.abs(longitude).toFixed(2)}° ${longitude < 0 ? 'W' : 'E'}`;
  return `${lat}, ${lon}`;
}

export function formatPValue(p: number): string {
  return p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(p < 0.1 ? 3 : 2)}`;
}

/** Whole calendar months covered by two ISO dates, inclusive of both months. */
export function monthsBetween(startDate: string, endDate: string): number {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  const s = new Date(start);
  const e = new Date(end);
  return (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()) + 1;
}

export function periodYears(startDate: string, endDate: string): number {
  return monthsBetween(startDate, endDate) / 12;
}

export function formatYears(years: number): string {
  const rounded = Math.round(years * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${rounded === 1 ? 'year' : 'years'}`;
}

/** '2026-11-15 14:03 UTC' for ISO timestamps; the raw text when it cannot be parsed. */
export function formatRetrievedAt(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
