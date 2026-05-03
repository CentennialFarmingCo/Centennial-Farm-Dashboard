'use client';

import { useEffect, useState } from "react";

const DEFAULT_LAT = 37.302;
const DEFAULT_LON = -120.482;
const DEFAULT_NAME = "Merced County, CA";

const LAT = Number(process.env.NEXT_PUBLIC_FARM_LAT ?? DEFAULT_LAT);
const LON = Number(process.env.NEXT_PUBLIC_FARM_LON ?? DEFAULT_LON);
const LOC_NAME = process.env.NEXT_PUBLIC_FARM_LOCATION_NAME ?? DEFAULT_NAME;

type Current = {
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  precipitation: number;
  weather_code: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  time: string;
};

type Daily = {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max: number[];
  precipitation_sum: number[];
  weather_code: number[];
  wind_speed_10m_max: number[];
};

type WeatherResponse = {
  current: Current;
  daily: Daily;
};

const WMO: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Heavy showers',
  82: 'Violent showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm w/ hail',
  99: 'Severe thunderstorm',
};

function describe(code: number): string {
  return WMO[code] ?? 'Unknown';
}

function compass(deg: number): string {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function dayLabel(iso: string, idx: number): string {
  if (idx === 0) return 'Today';
  if (idx === 1) return 'Tomorrow';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

export default function Weather() {
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (!Number.isFinite(LAT) || !Number.isFinite(LON)) {
          throw new Error('Invalid coordinates configured');
        }
        const params = new URLSearchParams({
          latitude: String(LAT),
          longitude: String(LON),
          current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
          daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code,wind_speed_10m_max',
          temperature_unit: 'fahrenheit',
          wind_speed_unit: 'mph',
          precipitation_unit: 'inch',
          timezone: 'auto',
          forecast_days: '5',
        });
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
        if (!res.ok) throw new Error(`Weather service responded ${res.status}`);
        const json = await res.json() as WeatherResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load weather');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const card: React.CSSProperties = {
    backgroundColor: 'white',
    borderRadius: '24px',
    padding: '24px',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
  };

  if (loading) {
    return (
      <div style={card} data-testid="weather-loading">
        <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '8px' }}>Weather</h2>
        <p style={{ color: '#666' }}>Loading conditions for {LOC_NAME}…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={card} data-testid="weather-error">
        <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '8px' }}>Weather unavailable</h2>
        <p style={{ color: '#a33', marginBottom: '8px' }}>{error ?? 'No data'}</p>
        <p style={{ color: '#666', fontSize: '13px' }}>
          Weather is provided live in the browser. If you&rsquo;re offline or the
          service is down, this panel will retry on next page load.
        </p>
      </div>
    );
  }

  const c = data.current;
  const d = data.daily;

  return (
    <div style={{ display: 'grid', gap: '16px' }} data-testid="weather-panel">
      <div style={card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '4px' }}>Current Conditions</h2>
            <p style={{ color: '#666', fontSize: '13px' }}>
              {LOC_NAME} &middot; {LAT.toFixed(3)}, {LON.toFixed(3)}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '48px', fontWeight: 700, color: '#C55A2E', lineHeight: 1 }} data-testid="weather-temp">
              {Math.round(c.temperature_2m)}&deg;F
            </p>
            <p style={{ color: '#555' }}>{describe(c.weather_code)}</p>
            <p style={{ fontSize: '12px', color: '#888' }}>Feels like {Math.round(c.apparent_temperature)}&deg;F</p>
          </div>
        </div>
        <div
          style={{
            marginTop: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
          }}
        >
          <Stat label="Wind" value={`${Math.round(c.wind_speed_10m)} mph ${compass(c.wind_direction_10m)}`} />
          <Stat label="Humidity" value={`${Math.round(c.relative_humidity_2m)}%`} />
          <Stat label="Precip (last hr)" value={`${c.precipitation.toFixed(2)} in`} />
          <Stat
            label="Today High / Low"
            value={`${Math.round(d.temperature_2m_max[0])}° / ${Math.round(d.temperature_2m_min[0])}°`}
          />
          <Stat label="Rain Chance Today" value={`${d.precipitation_probability_max[0] ?? 0}%`} />
        </div>
      </div>

      <div style={card}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>5-Day Forecast</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
          }}
          data-testid="weather-forecast"
        >
          {d.time.map((iso, i) => (
            <div
              key={iso}
              style={{
                backgroundColor: '#F4EEE0',
                borderRadius: '14px',
                padding: '14px',
                textAlign: 'center',
              }}
            >
              <p style={{ fontWeight: 600, marginBottom: '4px' }}>{dayLabel(iso, i)}</p>
              <p style={{ fontSize: '12px', color: '#666', minHeight: '32px' }}>{describe(d.weather_code[i])}</p>
              <p style={{ fontSize: '20px', fontWeight: 700, color: '#C55A2E' }}>
                {Math.round(d.temperature_2m_max[i])}&deg;
                <span style={{ color: '#888', fontSize: '14px', fontWeight: 500 }}>
                  {' '}/ {Math.round(d.temperature_2m_min[i])}&deg;
                </span>
              </p>
              <p style={{ fontSize: '12px', color: '#3b7a57' }}>
                {d.precipitation_probability_max[i] ?? 0}% rain
              </p>
              <p style={{ fontSize: '11px', color: '#888' }}>
                wind {Math.round(d.wind_speed_10m_max[i])} mph
              </p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '11px', color: '#888', marginTop: '14px' }}>
          Forecast: <a href="https://open-meteo.com/" style={{ color: '#888' }}>Open-Meteo</a>.
          Set <code>NEXT_PUBLIC_FARM_LAT</code>, <code>NEXT_PUBLIC_FARM_LON</code>,
          and <code>NEXT_PUBLIC_FARM_LOCATION_NAME</code> in Vercel to point at your farm.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ backgroundColor: '#F4EEE0', borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
      <p style={{ fontSize: '11px', textTransform: 'uppercase', color: '#888', letterSpacing: '0.04em' }}>{label}</p>
      <p style={{ fontSize: '18px', fontWeight: 600, color: '#333' }}>{value}</p>
    </div>
  );
}
