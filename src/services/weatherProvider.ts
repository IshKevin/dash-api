/**
 * Live weather from Open-Meteo (https://open-meteo.com) — free, no API key,
 * global coverage including Rwanda. Only coordinates / district names are sent
 * to the provider, never user data. Results are cached for 20 minutes per
 * location to stay well within the provider's fair-use limits.
 */
import axios from 'axios';
import logger from '../config/logger';

const FORECAST_URL = process.env.WEATHER_API_URL || 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = process.env.WEATHER_GEOCODE_URL || 'https://geocoding-api.open-meteo.com/v1/search';
const TIMEOUT_MS = 6000;
const TTL_MS = 20 * 60 * 1000;
const KIGALI = { lat: -1.9441, lng: 30.0619 };

export class WeatherUnavailableError extends Error {}

const cache = new Map<string, { at: number; value: any }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return value;
}

/** WMO weather interpretation codes → short label. */
export function describeWeatherCode(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Partly Cloudy';
  if (code === 3) return 'Cloudy';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 65) return code === 61 ? 'Light Rain' : 'Rain';
  if (code >= 66 && code <= 67) return 'Freezing Rain';
  if (code >= 80 && code <= 82) return 'Rain Showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Cloudy';
}

/** District / place name in Rwanda → coordinates (falls back to Kigali). */
export async function geocodeRwanda(place: string): Promise<{ lat: number; lng: number; resolved: string }> {
  const name = String(place || '').replace(/\b(district|province|city)\b/gi, '').trim();
  if (!name) return { ...KIGALI, resolved: 'Kigali' };
  return cached(`geo:${name.toLowerCase()}`, async () => {
    try {
      const { data } = await axios.get(GEOCODE_URL, { params: { name, count: 10, language: 'en', format: 'json' }, timeout: TIMEOUT_MS });
      const hit = (data?.results || []).find((r: any) => r.country_code === 'RW');
      if (hit) return { lat: hit.latitude, lng: hit.longitude, resolved: hit.name };
    } catch (error: any) {
      logger.warn(`Weather geocoding failed for "${name}": ${error?.message}`);
    }
    return { ...KIGALI, resolved: 'Kigali' };
  });
}

export interface CurrentWeather {
  temperature_c: number;
  humidity_pct: number;
  rainfall_mm: number;
  wind_speed_kmh: number;
  soil_moisture_pct: number | null;
  conditions: string;
  observed_at: string;
}
export interface DailyForecast {
  date: string;
  temp_min_c: number;
  temp_max_c: number;
  rainfall_mm: number;
  rain_probability_pct: number | null;
  humidity_pct: number | null;
  conditions: string;
}

export async function getWeather(lat: number, lng: number, days = 7): Promise<{ current: CurrentWeather; daily: DailyForecast[] }> {
  const key = `wx:${lat.toFixed(2)},${lng.toFixed(2)}:${days}`;
  return cached(key, async () => {
    let data: any;
    try {
      ({ data } = await axios.get(FORECAST_URL, {
        timeout: TIMEOUT_MS,
        params: {
          latitude: lat,
          longitude: lng,
          current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code',
          hourly: 'soil_moisture_3_to_9cm',
          daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,relative_humidity_2m_mean,weather_code',
          timezone: 'Africa/Kigali',
          forecast_days: Math.min(Math.max(days, 1), 16),
        },
      }));
    } catch (error: any) {
      logger.warn(`Weather provider request failed: ${error?.message}`);
      throw new WeatherUnavailableError('The weather service is temporarily unavailable');
    }
    const c = data?.current;
    if (!c) throw new WeatherUnavailableError('The weather service returned no data');

    // Soil moisture is hourly; take the value for the current hour.
    let soil: number | null = null;
    const hours: string[] = data?.hourly?.time || [];
    const idx = hours.findIndex((t) => t.slice(0, 13) === String(c.time).slice(0, 13));
    const sm = idx >= 0 ? data.hourly.soil_moisture_3_to_9cm?.[idx] : null;
    if (typeof sm === 'number') soil = Math.round(sm * 1000) / 10; // m³/m³ → %

    const d = data.daily || {};
    const daily: DailyForecast[] = (d.time || []).map((date: string, i: number) => ({
      date,
      temp_min_c: d.temperature_2m_min?.[i],
      temp_max_c: d.temperature_2m_max?.[i],
      rainfall_mm: d.precipitation_sum?.[i] ?? 0,
      rain_probability_pct: d.precipitation_probability_max?.[i] ?? null,
      humidity_pct: d.relative_humidity_2m_mean?.[i] ?? null,
      conditions: describeWeatherCode(d.weather_code?.[i] ?? 3),
    }));

    return {
      current: {
        temperature_c: c.temperature_2m,
        humidity_pct: c.relative_humidity_2m,
        rainfall_mm: c.precipitation ?? 0,
        wind_speed_kmh: c.wind_speed_10m,
        soil_moisture_pct: soil,
        conditions: describeWeatherCode(c.weather_code),
        observed_at: c.time,
      },
      daily,
    };
  });
}

/** Practical advice for avocado growers from current + next days. */
export function farmRecommendations(current: CurrentWeather, daily: DailyForecast[]): string[] {
  const recs: string[] = [];
  const next3Rain = daily.slice(0, 3).reduce((s, d) => s + (d.rainfall_mm || 0), 0);
  if (current.temperature_c > 28) recs.push('High temperature: water young trees early in the morning and provide shade.');
  if (current.humidity_pct > 80 || (daily[0]?.humidity_pct ?? 0) > 80) recs.push('High humidity: watch for anthracnose and other fungal diseases.');
  if (next3Rain < 2) recs.push('Little rain expected in the next 3 days: plan irrigation.');
  if (next3Rain > 30) recs.push('Heavy rain expected: check drainage and postpone spraying.');
  if (daily.slice(0, 2).some((d) => (d.rain_probability_pct ?? 0) >= 60)) recs.push('Rain likely within 48 hours: avoid applying pesticides or fertiliser now.');
  if (current.temperature_c >= 18 && current.temperature_c <= 28 && next3Rain < 5) recs.push('Good conditions for harvesting in the next few days.');
  if (current.soil_moisture_pct !== null && current.soil_moisture_pct < 15) recs.push('Soil is dry: irrigate if trees are flowering or fruiting.');
  return recs;
}

/** Old string-style fields kept for existing clients. */
export const legacyCurrent = (c: CurrentWeather) => ({
  temperature: `${Math.round(c.temperature_c)}°C`,
  humidity: `${Math.round(c.humidity_pct)}%`,
  rainfall: `${Math.round(c.rainfall_mm * 10) / 10}mm`,
  wind_speed: `${Math.round(c.wind_speed_kmh)} km/h`,
  conditions: c.conditions,
});
