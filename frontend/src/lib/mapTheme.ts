import type { PathOptions } from 'leaflet';

/** Fallbacks equal the values in tokens.css, used where CSS custom properties cannot be read (tests). */
const FALLBACK = {
  regionFill: '#131d22',
  regionStroke: '#4a6068',
  selectedFill: '#21343c',
  selectedStroke: '#56b4e9',
  point: '#f0e442',
  surface: '#151d21',
};

function token(styles: CSSStyleDeclaration | null, name: string, fallback: string): string {
  const value = styles?.getPropertyValue(name).trim();
  return value || fallback;
}

export type MapTheme = {
  boundary: PathOptions;
  selectedBoundary: PathOptions;
  pointRing: PathOptions;
  pointDot: PathOptions;
};

/** Leaflet path styles taken from the design tokens, so colours are defined once (tokens.css). */
export function readMapTheme(): MapTheme {
  const styles = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const regionFill = token(styles, '--map-region-fill', FALLBACK.regionFill);
  const regionStroke = token(styles, '--map-region-stroke', FALLBACK.regionStroke);
  const selectedFill = token(styles, '--map-selected-fill', FALLBACK.selectedFill);
  const selectedStroke = token(styles, '--map-selected-stroke', FALLBACK.selectedStroke);
  const point = token(styles, '--map-point', FALLBACK.point);

  return {
    boundary: { color: regionStroke, fillColor: regionFill, fillOpacity: 0.9, weight: 1.5 },
    selectedBoundary: { color: selectedStroke, fillColor: selectedFill, fillOpacity: 1, weight: 2.5 },
    pointRing: { color: point, fillColor: point, fillOpacity: 0.16, weight: 3 },
    pointDot: { color: point, fillColor: point, fillOpacity: 1, weight: 1 },
  };
}
