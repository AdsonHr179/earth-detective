import { fireEvent, render, screen } from '@testing-library/react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { expect, it, vi } from 'vitest';
import GoogleMap3D from './GoogleMap3D';
import type { GeoJSONPoint } from '../api/client';

vi.mock('@googlemaps/js-api-loader', () => ({
  importLibrary: vi.fn(),
  setOptions: vi.fn(),
}));

it('handles a pending overview reset, a point click and a renderer error', async () => {
  type MapsLibrary = Awaited<ReturnType<typeof importLibrary>>;
  let finish!: (library: MapsLibrary) => void;
  vi.mocked(importLibrary).mockReturnValueOnce(new Promise<MapsLibrary>((resolve) => { finish = resolve; }));
  const makeMap = vi.fn(function MockMap() { return document.createElement('div'); });
  const library = {
    Map3DElement: makeMap,
    Marker3DElement: function MockMarker() { return document.createElement('div'); },
  } as unknown as MapsLibrary;
  const onSelectPosition = vi.fn();
  const point: GeoJSONPoint = { type: 'Point', coordinates: [-39.5, -5.2] };
  const props = { apiKey: 'test-only-key', point, onSelectPosition };

  const { rerender } = render(<GoogleMap3D {...props} resetVersion={0} />);
  rerender(<GoogleMap3D {...props} resetVersion={1} />);
  finish(library);

  const globe = await screen.findByLabelText('Google satellite map in 3D');
  expect(setOptions).toHaveBeenCalledWith({ key: 'test-only-key', v: 'weekly' });
  expect(makeMap).toHaveBeenCalledWith(expect.objectContaining({ range: 18_000_000, tilt: 0 }));
  fireEvent(globe, Object.assign(new Event('gmp-click', { cancelable: true }), {
    position: { lat: 35.6895, lng: 139.6917 },
  }));
  expect(onSelectPosition).toHaveBeenCalledWith({ type: 'Point', coordinates: [139.6917, 35.6895] });
  fireEvent(globe, new Event('gmp-error'));
  expect(screen.getByRole('status')).toHaveTextContent('Google 3D is unavailable');
});
