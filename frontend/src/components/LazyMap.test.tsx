import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LazyMap from './LazyMap';
import { readMapTheme } from '../lib/mapTheme';

// Leaflet does not run in jsdom; the heavy module is replaced by a stub.
const loaded = vi.fn();
vi.mock('./MapStage', () => {
  loaded();
  return { default: () => <div>map module</div> };
});

describe('LazyMap', () => {
  it('shows a placeholder first and the map module after the first paint', async () => {
    render(
      <LazyMap
        regions={[]}
        selectedRegion="ceara"
        selectedPosition={null}
        onSelectPosition={() => undefined}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading map');
    expect(await screen.findByText('map module')).toBeInTheDocument();
  });
});

describe('readMapTheme', () => {
  it('falls back to the token values and styles the selected boundary distinctly', () => {
    const theme = readMapTheme();
    expect(theme.selectedBoundary.color).toBe('#56b4e9');
    expect(theme.pointRing.color).toBe('#f0e442');
    expect(theme.boundary.color).not.toBe(theme.selectedBoundary.color);
  });

  it('reads colours from CSS custom properties when present', () => {
    document.documentElement.style.setProperty('--map-point', '#112233');
    expect(readMapTheme().pointDot.color).toBe('#112233');
    document.documentElement.style.removeProperty('--map-point');
  });
});
