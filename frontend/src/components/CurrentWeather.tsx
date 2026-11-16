import { useEffect, useState } from 'react';
import type { GeoJSONPoint } from '../api/client';

const UPDATE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const clock = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
});

type Weather = {
  temperature: number;
  humidity: number;
  wind: number;
  time: number;
};

type WeatherState = {
  pointKey: string;
  data?: Weather;
  failed: boolean;
};

function parseWeather(payload: unknown): Weather {
  const current = (payload as { current?: Record<string, unknown> } | null)?.current;
  const fields = [
    current?.temperature_2m, current?.relative_humidity_2m, current?.wind_speed_10m, current?.time,
  ];
  const numbers = fields.filter((field): field is number => typeof field === 'number' && Number.isFinite(field));
  if (numbers.length !== fields.length) throw new Error('Missing current conditions');
  const [temperature, humidity, wind, time] = numbers;
  if (time < 0 || !Number.isFinite(new Date(time * 1000).valueOf())) throw new Error('Invalid weather timestamp');
  return { temperature, humidity, wind, time };
}

export default function CurrentWeather({ point }: { point?: GeoJSONPoint | null }) {
  const latitude = point?.coordinates[1].toFixed(4);
  const longitude = point?.coordinates[0].toFixed(4);
  const pointKey = latitude !== undefined && longitude !== undefined ? latitude + ',' + longitude : '';
  const [state, setState] = useState<WeatherState>();

  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return;
    let active = true;
    let next: number | undefined;
    let currentRequest: AbortController | undefined;
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude, longitude, current: 'temperature_2m,relative_humidity_2m,wind_speed_10m',
      timeformat: 'unixtime', timezone: 'GMT',
    }).toString();

    async function update() {
      const request = new AbortController();
      currentRequest = request;
      const timeout = window.setTimeout(() => request.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, { signal: request.signal, credentials: 'omit' });
        if (!response.ok) throw new Error('Weather service unavailable');
        const data = parseWeather(await response.json());
        if (active) setState({ pointKey, data, failed: false });
      } catch {
        if (active) {
          setState((previous) => ({
            pointKey, data: previous?.pointKey === pointKey ? previous.data : undefined, failed: true,
          }));
        }
      } finally {
        window.clearTimeout(timeout);
        if (active) next = window.setTimeout(update, UPDATE_MS);
      }
    }

    void update();
    return () => {
      active = false;
      currentRequest?.abort();
      window.clearTimeout(next);
    };
  }, [latitude, longitude, pointKey]);

  const weather = state?.pointKey === pointKey ? state : undefined;
  const conditions = weather?.data;

  return (
    <aside className="map-weather" aria-label="Current weather at the selected point">
      <div className="map-weather-title">
        <strong>Current weather</strong>
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>
      </div>
      <div role="status">
        {conditions ? (
          <>
            <div className="map-weather-values">
              <b>{conditions.temperature.toFixed(1)} °C</b>
              <span>Humidity {Math.round(conditions.humidity)}%</span>
              <span>Wind {conditions.wind.toFixed(1)} km/h</span>
            </div>
            <small>
              {weather.failed ? 'Update failed · Last model data ' : 'Model data '}
              <time dateTime={new Date(conditions.time * 1000).toISOString()}>
                {clock.format(conditions.time * 1000)} UTC
              </time>
            </small>
          </>
        ) : (
          <small>{!pointKey ? 'Select a point on the map' : weather?.failed ? 'Weather unavailable' : 'Loading weather…'}</small>
        )}
      </div>
    </aside>
  );
}
