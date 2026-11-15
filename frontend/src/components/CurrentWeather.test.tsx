import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CurrentWeather from './CurrentWeather';

function weatherResponse(temperature: number, time: number) {
  return Response.json({
    current: { temperature_2m: temperature, relative_humidity_2m: 56, wind_speed_10m: 7.4, time },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('refreshes current conditions after five minutes and labels retained data if the service fails', async () => {
  vi.useFakeTimers();
  const fetchWeather = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(weatherResponse(29, 1794775500))
    .mockResolvedValueOnce(weatherResponse(28.8, 1794776400))
    .mockResolvedValueOnce(new Response(null, { status: 503 }));
  vi.stubGlobal('fetch', fetchWeather);

  const { unmount } = render(<CurrentWeather point={{ type: 'Point', coordinates: [-39.5, -5.2] }} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByRole('status')).toHaveTextContent('29.0');
  expect(fetchWeather).toHaveBeenCalledTimes(1);

  await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
  expect(screen.getByRole('status')).toHaveTextContent('28.8');
  expect(fetchWeather).toHaveBeenCalledTimes(2);

  await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
  expect(screen.getByRole('status')).toHaveTextContent('28.8');
  expect(screen.getByRole('status')).toHaveTextContent('Update failed');
  unmount();
  await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
  expect(fetchWeather).toHaveBeenCalledTimes(3);
});
