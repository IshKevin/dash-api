/**
 * Live weather from Open-Meteo (https://open-meteo.com) — free, no API key,
 * global coverage including Rwanda. Data licence: CC BY 4.0 (attribution
 * required, see WEATHER_SOURCES). Only coordinates / district names are sent to
 * the provider, never user data.
 *
 *  - Forecast API  (api.open-meteo.com/v1/forecast): current conditions,
 *    hourly + daily forecast for 16 days, plus the last 7 days (past_days).
 *    Cached 30 minutes per ~1 km grid cell (lat/lng rounded to 2 decimals).
 *  - Archive API   (archive-api.open-meteo.com/v1/archive, ERA5 reanalysis):
 *    daily rainfall + ET0 for the last 90 days and the same 90 days in each of
 *    the previous HISTORY_YEARS years, to say whether it is drier or wetter
 *    than normal. Cached 12 hours.
 *
 * Everything below `buildOverview` is pure (no network) so it can be unit
 * tested with fixtures.
 */
import axios from 'axios';
import logger from '../config/logger';

const FORECAST_URL = process.env.WEATHER_API_URL || 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = process.env.WEATHER_ARCHIVE_URL || 'https://archive-api.open-meteo.com/v1/archive';
const GEOCODE_URL = process.env.WEATHER_GEOCODE_URL || 'https://geocoding-api.open-meteo.com/v1/search';
const TIMEOUT_MS = 8000;
const ARCHIVE_TIMEOUT_MS = 20000; // ~10 years of daily data; first call can be slow, then cached 12 h
const FORECAST_TTL_MS = 30 * 60 * 1000;
const ARCHIVE_TTL_MS = 12 * 60 * 60 * 1000;
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000;
const HISTORY_YEARS = 10;
const HISTORY_DAYS = 90;
const PAST_DAYS = 7;
const KIGALI = { lat: -1.9441, lng: 30.0619 };

export class WeatherUnavailableError extends Error {}

/* ───────────────────────────── Sources ───────────────────────────── */

export interface WeatherSource {
  id: string;
  name: string;
  url: string | null;
  licence?: string;
  licence_url?: string;
  attribution?: string;
  used_for: string;
}

const OM_LICENCE = { licence: 'CC BY 4.0', licence_url: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Weather data by Open-Meteo.com' };

/** Every number in the API response carries a `source` id from this list. */
export const WEATHER_SOURCES: WeatherSource[] = [
  {
    id: 'open-meteo-forecast',
    name: 'Open-Meteo Weather Forecast API (best-match of national weather models, e.g. ECMWF, DWD ICON, NOAA GFS)',
    url: 'https://open-meteo.com/en/docs',
    ...OM_LICENCE,
    used_for: 'Current conditions, hourly and 16-day forecast, last 7 days, soil moisture and temperature, evapotranspiration (ET0)',
  },
  {
    id: 'open-meteo-archive',
    name: 'Open-Meteo Historical Weather API (ERA5 / ERA5-Land reanalysis, Copernicus Climate Change Service)',
    url: 'https://open-meteo.com/en/docs/historical-weather-api',
    ...OM_LICENCE,
    used_for: `Rainfall of the last ${HISTORY_DAYS} days and the ${HISTORY_YEARS}-year average for the same dates`,
  },
  {
    id: 'fao-56',
    name: 'FAO Irrigation and Drainage Paper 56 — reference evapotranspiration (ET0) method',
    url: 'https://www.fao.org/4/x0490e/x0490e00.htm',
    used_for: 'Meaning of ET0 (water the crop loses to the air) used in the water balance',
  },
  {
    id: 'meteo-rwanda',
    name: 'Meteo Rwanda (Rwanda Meteorology Agency) — official forecasts and severe-weather warnings',
    url: 'https://www.meteorwanda.gov.rw',
    used_for: 'Official warnings. Always follow Meteo Rwanda warnings over this page.',
  },
  {
    id: 'derived',
    name: 'Calculated by this system from the data above, using the thresholds in ADVICE_THRESHOLDS',
    url: null,
    used_for: 'Advice, alerts, spraying windows, harvest days, water balance and "drier/wetter than normal"',
  },
];

/* ───────────────────────────── Thresholds ───────────────────────────── */

/**
 * All advice thresholds in one place. Units: °C, %, mm, km/h, m³/m³.
 * Chosen from common avocado extension guidance and agronomic rules of thumb;
 * tune here, never inline.
 */
export const ADVICE_THRESHOLDS = {
  spray: {
    /** Mean wind above this → drift; spraying not advised. */
    maxWindKmh: 15,
    /** Gusts above this → drift. */
    maxGustKmh: 25,
    /** Hours that must stay dry after spraying so the product dries on the leaves (most labels: 2–6 h). */
    dryHoursAfter: 4,
    /** An hour counts as "rain" if rain ≥ this (mm) … */
    rainMm: 0.2,
    /** … or rain chance ≥ this (%). */
    rainProbabilityPct: 50,
    /** Too hot: spray evaporates / leaf burn. */
    maxTempC: 30,
    /** Only consider daylight working hours (local time). */
    firstHour: 6,
    lastHour: 18,
  },
  irrigation: {
    /** Past-7-day water balance (rain − ET0) below this (mm) → trees are short of water. */
    deficitMm: -15,
    /** Strong deficit → irrigate even mature trees. */
    severeDeficitMm: -30,
    /** If at least this much rain is expected in the next 3 days, wait for the rain. */
    rainSoonMm: 10,
    /** Topsoil (3–9 cm) moisture below this is dry. */
    drySoilM3: 0.2,
  },
  disease: {
    /** An hour is "wet" if humidity ≥ this … */
    wetHumidityPct: 90,
    /** … or rain ≥ this (mm). */
    wetRainMm: 0.2,
    /** Anthracnose / fungal spread is favoured in this temperature range during wet hours. */
    warmMinC: 18,
    warmMaxC: 30,
    /** Warm-and-wet hours in the next 48 h for moderate / high risk. */
    moderateHours: 6,
    highHours: 12,
    /** Root-rot (Phytophthora) risk: rain in the last 7 days ≥ this (mm) … */
    waterlogRain7dMm: 70,
    /** … or deeper soil (9–27 cm) moisture ≥ this (near saturation). */
    waterlogSoilM3: 0.42,
  },
  heat: {
    /** Daily max ≥ caution → sunburn on fruit / stress on young trees. */
    cautionC: 29,
    dangerC: 32,
    /** Cold nights at high altitude (Northern / Western highlands). */
    coldC: 6,
  },
  rain: {
    /** Daily rain ≥ heavy → check drains; ≥ veryHeavy → flood / erosion warning. */
    heavyDayMm: 30,
    veryHeavyDayMm: 50,
    /** Any single hour ≥ this → intense downpour. */
    intenseHourMm: 10,
    /** Gusts ≥ this → strong wind (branches, fruit drop). */
    strongGustKmh: 50,
  },
  harvest: {
    /** A good harvest day: rain ≤ this (mm) … */
    maxRainMm: 2,
    /** … and the day's highest hourly rain chance ≤ this (%). Afternoon showers are
     *  common in the rainy seasons, so only near-certain rain rules a day out. */
    maxRainProbabilityPct: 80,
    /** … and gusts below this (ladders, fruit drop). */
    maxGustKmh: 40,
  },
  normal: {
    /** Percent of the multi-year average rainfall for each label. */
    muchDrierPct: 50,
    drierPct: 80,
    wetterPct: 120,
    muchWetterPct: 150,
  },
} as const;

/* ───────────────────────────── Cache ───────────────────────────── */

const cache = new Map<string, { at: number; ttl: number; value: Promise<any> }>();
async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as Promise<T>;
  const value = fn();
  cache.set(key, { at: Date.now(), ttl, value });
  value.catch(() => cache.delete(key)); // never cache failures
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return value;
}
/** Test hook. */
export const clearWeatherCache = () => cache.clear();

const round2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const sum = (xs: (number | null)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);

/* ───────────────────────────── WMO codes ───────────────────────────── */

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
const isThunder = (code: number | null) => code !== null && code >= 95;

/* ───────────────────────────── Geocoding ───────────────────────────── */

/** District / place name in Rwanda → coordinates (falls back to Kigali). */
export async function geocodeRwanda(place: string): Promise<{ lat: number; lng: number; resolved: string }> {
  const name = String(place || '').replace(/\b(district|province|city)\b/gi, '').trim();
  if (!name) return { ...KIGALI, resolved: 'Kigali' };
  return cached(`geo:${name.toLowerCase()}`, GEOCODE_TTL_MS, async () => {
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

/* ───────────────────────────── Upstream fetch ───────────────────────────── */

const CURRENT_VARS = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day';
const HOURLY_VARS = [
  'temperature_2m', 'relative_humidity_2m', 'precipitation_probability', 'precipitation', 'weather_code',
  'wind_speed_10m', 'wind_gusts_10m', 'uv_index', 'et0_fao_evapotranspiration', 'leaf_wetness_probability',
  'soil_moisture_0_to_1cm', 'soil_moisture_3_to_9cm', 'soil_moisture_9_to_27cm', 'soil_temperature_6cm',
].join(',');
const DAILY_VARS = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'precipitation_hours',
  'precipitation_probability_max', 'relative_humidity_2m_mean', 'wind_speed_10m_max', 'wind_gusts_10m_max',
  'uv_index_max', 'sunshine_duration', 'et0_fao_evapotranspiration', 'sunrise', 'sunset',
].join(',');

/** Raw Open-Meteo forecast JSON (16 days ahead + 7 days back), cached 30 min. */
export async function fetchForecastRaw(lat: number, lng: number): Promise<any> {
  const la = round2(lat);
  const ln = round2(lng);
  return cached(`fc:${la},${ln}`, FORECAST_TTL_MS, async () => {
    let data: any;
    try {
      ({ data } = await axios.get(FORECAST_URL, {
        timeout: TIMEOUT_MS,
        params: {
          latitude: la, longitude: ln,
          current: CURRENT_VARS, hourly: HOURLY_VARS, daily: DAILY_VARS,
          timezone: 'Africa/Kigali', forecast_days: 16, past_days: PAST_DAYS,
        },
      }));
    } catch (error: any) {
      logger.warn(`Weather forecast request failed: ${error?.message}`);
      throw new WeatherUnavailableError('The weather forecast service is temporarily unavailable');
    }
    if (!data?.current || !data?.daily?.time) throw new WeatherUnavailableError('The weather service returned no data');
    return data;
  });
}

/** YYYY-MM-DD arithmetic in UTC (no server time-zone surprises). */
export function shiftDate(date: string, days = 0, years = 0): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (years) d.setUTCFullYear(d.getUTCFullYear() + years);
  if (days) d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Raw archive JSON: daily rain + ET0 from (start of window − HISTORY_YEARS) to yesterday, cached 12 h. */
export async function fetchArchiveRaw(lat: number, lng: number, today: string): Promise<any> {
  const la = round2(lat);
  const ln = round2(lng);
  const end = shiftDate(today, -1);
  const start = shiftDate(shiftDate(end, -(HISTORY_DAYS + 5)), 0, -HISTORY_YEARS);
  return cached(`ar:${la},${ln}:${today}`, ARCHIVE_TTL_MS, async () => {
    let data: any;
    try {
      ({ data } = await axios.get(ARCHIVE_URL, {
        timeout: ARCHIVE_TIMEOUT_MS,
        params: {
          latitude: la, longitude: ln, start_date: start, end_date: end,
          daily: 'precipitation_sum,et0_fao_evapotranspiration', timezone: 'Africa/Kigali',
        },
      }));
    } catch (error: any) {
      logger.warn(`Weather archive request failed: ${error?.message}`);
      throw new WeatherUnavailableError('The historical rainfall service is temporarily unavailable');
    }
    if (!data?.daily?.time) throw new WeatherUnavailableError('The historical rainfall service returned no data');
    return data;
  });
}

/* ───────────────────────────── Legacy shape ───────────────────────────── */

export interface CurrentWeather {
  temperature_c: number;
  humidity_pct: number;
  rainfall_mm: number;
  wind_speed_kmh: number;
  soil_moisture_pct: number | null;
  conditions: string;
  observed_at: string;
  // Added (optional for older callers)
  apparent_temperature_c?: number | null;
  wind_gusts_kmh?: number | null;
  wind_direction_deg?: number | null;
  cloud_cover_pct?: number | null;
  weather_code?: number | null;
  is_day?: boolean;
}
export interface DailyForecast {
  date: string;
  temp_min_c: number;
  temp_max_c: number;
  rainfall_mm: number;
  rain_probability_pct: number | null;
  humidity_pct: number | null;
  conditions: string;
  // Added
  weather_code?: number | null;
  rain_hours?: number | null;
  wind_max_kmh?: number | null;
  gusts_max_kmh?: number | null;
  uv_index_max?: number | null;
  sunshine_hours?: number | null;
  et0_mm?: number | null;
  sunrise?: string | null;
  sunset?: string | null;
}
export interface HourlyPoint {
  time: string;
  temperature_c: number | null;
  humidity_pct: number | null;
  rain_mm: number | null;
  rain_probability_pct: number | null;
  wind_speed_kmh: number | null;
  wind_gusts_kmh: number | null;
  uv_index: number | null;
  et0_mm: number | null;
  leaf_wetness_pct: number | null;
  weather_code: number | null;
  conditions: string;
  soil_moisture_0_1_m3: number | null;
  soil_moisture_3_9_m3: number | null;
  soil_moisture_9_27_m3: number | null;
  soil_temperature_6cm_c: number | null;
}

/** Normalised forecast: arrays in local time, `nowIndex` = current hour, `todayIndex` = today in daily. */
export interface ParsedForecast {
  today: string;
  current: CurrentWeather;
  hourly: HourlyPoint[];
  daily: DailyForecast[];
  nowIndex: number;
  todayIndex: number;
  elevation_m: number | null;
}

export function parseForecast(data: any): ParsedForecast {
  const c = data.current;
  const h = data.hourly || {};
  const hourly: HourlyPoint[] = (h.time || []).map((time: string, i: number) => {
    const code = num(h.weather_code?.[i]);
    return {
      time,
      temperature_c: num(h.temperature_2m?.[i]),
      humidity_pct: num(h.relative_humidity_2m?.[i]),
      rain_mm: num(h.precipitation?.[i]),
      rain_probability_pct: num(h.precipitation_probability?.[i]),
      wind_speed_kmh: num(h.wind_speed_10m?.[i]),
      wind_gusts_kmh: num(h.wind_gusts_10m?.[i]),
      uv_index: num(h.uv_index?.[i]),
      et0_mm: num(h.et0_fao_evapotranspiration?.[i]),
      leaf_wetness_pct: num(h.leaf_wetness_probability?.[i]),
      weather_code: code,
      conditions: describeWeatherCode(code ?? 3),
      soil_moisture_0_1_m3: num(h.soil_moisture_0_to_1cm?.[i]),
      soil_moisture_3_9_m3: num(h.soil_moisture_3_to_9cm?.[i]),
      soil_moisture_9_27_m3: num(h.soil_moisture_9_to_27cm?.[i]),
      soil_temperature_6cm_c: num(h.soil_temperature_6cm?.[i]),
    };
  });
  const d = data.daily || {};
  const daily: DailyForecast[] = (d.time || []).map((date: string, i: number) => {
    const code = num(d.weather_code?.[i]);
    const sun = num(d.sunshine_duration?.[i]);
    return {
      date,
      temp_min_c: d.temperature_2m_min?.[i],
      temp_max_c: d.temperature_2m_max?.[i],
      rainfall_mm: d.precipitation_sum?.[i] ?? 0,
      rain_probability_pct: d.precipitation_probability_max?.[i] ?? null,
      humidity_pct: d.relative_humidity_2m_mean?.[i] ?? null,
      conditions: describeWeatherCode(code ?? 3),
      weather_code: code,
      rain_hours: num(d.precipitation_hours?.[i]),
      wind_max_kmh: num(d.wind_speed_10m_max?.[i]),
      gusts_max_kmh: num(d.wind_gusts_10m_max?.[i]),
      uv_index_max: num(d.uv_index_max?.[i]),
      sunshine_hours: sun === null ? null : r1(sun / 3600),
      et0_mm: num(d.et0_fao_evapotranspiration?.[i]),
      sunrise: d.sunrise?.[i] ?? null,
      sunset: d.sunset?.[i] ?? null,
    };
  });
  const today = String(c.time).slice(0, 10);
  let nowIndex = hourly.findIndex((p) => p.time.slice(0, 13) === String(c.time).slice(0, 13));
  if (nowIndex < 0) nowIndex = Math.min(PAST_DAYS * 24, Math.max(0, hourly.length - 1));
  let todayIndex = daily.findIndex((x) => x.date === today);
  if (todayIndex < 0) todayIndex = Math.min(PAST_DAYS, Math.max(0, daily.length - 1));

  const sm = hourly[nowIndex]?.soil_moisture_3_9_m3 ?? null;
  return {
    today,
    nowIndex,
    todayIndex,
    hourly,
    daily,
    elevation_m: num(data.elevation),
    current: {
      temperature_c: c.temperature_2m,
      humidity_pct: c.relative_humidity_2m,
      rainfall_mm: c.precipitation ?? 0,
      wind_speed_kmh: c.wind_speed_10m,
      soil_moisture_pct: sm === null ? null : Math.round(sm * 1000) / 10, // m³/m³ → %
      conditions: describeWeatherCode(c.weather_code),
      observed_at: c.time,
      apparent_temperature_c: num(c.apparent_temperature),
      wind_gusts_kmh: num(c.wind_gusts_10m),
      wind_direction_deg: num(c.wind_direction_10m),
      cloud_cover_pct: num(c.cloud_cover),
      weather_code: num(c.weather_code),
      is_day: c.is_day === undefined ? undefined : c.is_day === 1,
    },
  };
}

/** Backward-compatible: current conditions + `days` daily rows starting today. */
export async function getWeather(lat: number, lng: number, days = 7): Promise<{ current: CurrentWeather; daily: DailyForecast[] }> {
  const parsed = parseForecast(await fetchForecastRaw(lat, lng));
  const n = Math.min(Math.max(days, 1), 16);
  return { current: parsed.current, daily: parsed.daily.slice(parsed.todayIndex, parsed.todayIndex + n) };
}

/** Practical advice for avocado growers from current + next days (legacy list of strings). */
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

/* ───────────────────────────── Rainfall vs normal ───────────────────────────── */

export type NormalStatus = 'much_drier' | 'drier' | 'normal' | 'wetter' | 'much_wetter';
export const NORMAL_LABELS: Record<NormalStatus, string> = {
  much_drier: 'Much drier than normal',
  drier: 'Drier than normal',
  normal: 'About normal',
  wetter: 'Wetter than normal',
  much_wetter: 'Much wetter than normal',
};

export function classifyVsNormal(pct: number | null): NormalStatus | null {
  if (pct === null) return null;
  const t = ADVICE_THRESHOLDS.normal;
  if (pct < t.muchDrierPct) return 'much_drier';
  if (pct < t.drierPct) return 'drier';
  if (pct <= t.wetterPct) return 'normal';
  if (pct <= t.muchWetterPct) return 'wetter';
  return 'much_wetter';
}

export interface RainfallHistory {
  source: 'open-meteo-archive';
  end_date: string;
  years_compared: number;
  windows: { days: number; start_date: string; end_date: string; actual_mm: number; normal_mm: number | null; pct_of_normal: number | null; status: NormalStatus | null; label: string | null; et0_mm: number | null }[];
  periods: { start_date: string; end_date: string; actual_mm: number; normal_mm: number | null }[];
}

/** Rain of the last 30/60/90 days vs the HISTORY_YEARS-year average for the same dates. */
export function computeRainfallHistory(data: any, windows = [30, 60, 90], periodDays = 10): RainfallHistory | null {
  const t: string[] = data?.daily?.time || [];
  const rain = new Map<string, number | null>();
  const et0 = new Map<string, number | null>();
  t.forEach((date, i) => {
    rain.set(date, num(data.daily.precipitation_sum?.[i]));
    et0.set(date, num(data.daily.et0_fao_evapotranspiration?.[i]));
  });
  // Last date with data (reanalysis lags a few days behind).
  let end: string | null = null;
  for (let i = t.length - 1; i >= 0; i--) if (rain.get(t[i]) !== null && rain.get(t[i]) !== undefined) { end = t[i]; break; }
  if (!end) return null;

  /** Sum over [start..stop]; null if more than 10% of days are missing. */
  const rangeSum = (m: Map<string, number | null>, start: string, stop: string): number | null => {
    let s = 0; let n = 0; let missing = 0;
    for (let d = start; d <= stop; d = shiftDate(d, 1)) {
      n++;
      const v = m.get(d);
      if (v === null || v === undefined) missing++; else s += v;
    }
    return n && missing / n <= 0.1 ? s : null;
  };
  const normalFor = (start: string, stop: string): { mean: number | null; years: number } => {
    const sums: number[] = [];
    for (let y = 1; y <= HISTORY_YEARS; y++) {
      const v = rangeSum(rain, shiftDate(start, 0, -y), shiftDate(stop, 0, -y));
      if (v !== null) sums.push(v);
    }
    return { mean: sums.length >= 3 ? sums.reduce((a, b) => a + b, 0) / sums.length : null, years: sums.length };
  };

  let yearsCompared = 0;
  const win = windows.map((days) => {
    const start = shiftDate(end!, -(days - 1));
    const actual = rangeSum(rain, start, end!) ?? 0;
    const { mean, years } = normalFor(start, end!);
    yearsCompared = Math.max(yearsCompared, years);
    const pct = mean !== null && mean > 0 ? Math.round((actual / mean) * 100) : null;
    const status = classifyVsNormal(pct);
    return {
      days, start_date: start, end_date: end!,
      actual_mm: r1(actual)!, normal_mm: r1(mean), pct_of_normal: pct,
      status, label: status ? NORMAL_LABELS[status] : null,
      et0_mm: r1(rangeSum(et0, start, end!)),
    };
  });

  const maxDays = Math.max(...windows);
  const periods: RainfallHistory['periods'] = [];
  for (let k = Math.floor(maxDays / periodDays) - 1; k >= 0; k--) {
    const stop = shiftDate(end, -k * periodDays);
    const start = shiftDate(stop, -(periodDays - 1));
    periods.push({ start_date: start, end_date: stop, actual_mm: r1(rangeSum(rain, start, stop) ?? 0)!, normal_mm: r1(normalFor(start, stop).mean) });
  }
  return { source: 'open-meteo-archive', end_date: end, years_compared: yearsCompared, windows: win, periods };
}

/* ───────────────────────────── Advice ───────────────────────────── */

export type Level = 'good' | 'caution' | 'warning';
export interface Advice {
  id: 'spraying' | 'irrigation' | 'disease' | 'heat' | 'harvest' | 'rain';
  level: Level;
  title: string;
  message: string;
  details: string[];
  source: 'derived';
  based_on: string[];
}
export interface WeatherAlert {
  id: string;
  level: 'warning' | 'watch';
  title: string;
  message: string;
  date: string;
  source: 'derived';
  based_on: string[];
}
export interface SprayWindow { start: string; end: string; hours: number }

const hourOf = (time: string) => Number(time.slice(11, 13));
const isRainHour = (p: HourlyPoint) =>
  (p.rain_mm ?? 0) >= ADVICE_THRESHOLDS.spray.rainMm || (p.rain_probability_pct ?? 0) >= ADVICE_THRESHOLDS.spray.rainProbabilityPct;

/** Is spraying OK in hour i (calm, not hot, daylight, and the next N hours stay dry)? */
export function sprayOk(hourly: HourlyPoint[], i: number): boolean {
  const t = ADVICE_THRESHOLDS.spray;
  const p = hourly[i];
  if (!p) return false;
  const hr = hourOf(p.time);
  if (hr < t.firstHour || hr > t.lastHour) return false;
  if ((p.wind_speed_kmh ?? 99) > t.maxWindKmh || (p.wind_gusts_kmh ?? 99) > t.maxGustKmh) return false;
  if ((p.temperature_c ?? 0) > t.maxTempC) return false;
  const ahead = hourly.slice(i, i + t.dryHoursAfter + 1);
  if (ahead.length < t.dryHoursAfter + 1) return false; // can't tell → don't promise
  return !ahead.some(isRainHour);
}

/** Groups consecutive spray-OK hours in [from, to) into windows. */
export function sprayWindows(hourly: HourlyPoint[], from: number, to: number): SprayWindow[] {
  const out: SprayWindow[] = [];
  let start = -1;
  for (let i = from; i <= to; i++) {
    const ok = i < to && sprayOk(hourly, i);
    if (ok && start < 0) start = i;
    if (!ok && start >= 0) {
      out.push({ start: hourly[start].time, end: hourly[i - 1].time, hours: i - start });
      start = -1;
    }
  }
  return out;
}

export function harvestOk(d: DailyForecast): boolean {
  const t = ADVICE_THRESHOLDS.harvest;
  return (d.rainfall_mm ?? 0) <= t.maxRainMm && (d.rain_probability_pct ?? 0) <= t.maxRainProbabilityPct && (d.gusts_max_kmh ?? 0) < t.maxGustKmh;
}

const fmtHour = (time: string) => time.slice(11, 16);
const fmtDay = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
};
const windowText = (w: SprayWindow) => `${fmtDay(w.start.slice(0, 10))} ${fmtHour(w.start)}–${String(hourOf(w.end) + 1).padStart(2, '0')}:00`;

export interface WaterBalance {
  source: 'derived';
  based_on: string[];
  past_7d: { rain_mm: number; et0_mm: number; balance_mm: number } | null;
  next_7d: { rain_mm: number; et0_mm: number; balance_mm: number } | null;
}

export function computeWaterBalance(f: ParsedForecast): WaterBalance {
  const part = (rows: DailyForecast[]) => {
    if (!rows.length) return null;
    const rain = sum(rows.map((d) => d.rainfall_mm));
    const et0 = sum(rows.map((d) => d.et0_mm ?? null));
    return { rain_mm: r1(rain)!, et0_mm: r1(et0)!, balance_mm: r1(rain - et0)! };
  };
  return {
    source: 'derived',
    based_on: ['open-meteo-forecast', 'fao-56'],
    past_7d: part(f.daily.slice(Math.max(0, f.todayIndex - 7), f.todayIndex)),
    next_7d: part(f.daily.slice(f.todayIndex, f.todayIndex + 7)),
  };
}

export type SoilStatus = 'dry' | 'moist' | 'wet' | 'waterlogged';
export function soilStatus(m3: number | null): SoilStatus | null {
  if (m3 === null) return null;
  if (m3 < ADVICE_THRESHOLDS.irrigation.drySoilM3) return 'dry';
  if (m3 < 0.35) return 'moist';
  if (m3 < ADVICE_THRESHOLDS.disease.waterlogSoilM3) return 'wet';
  return 'waterlogged';
}

/**
 * Turns the forecast (and optional rainfall history) into plain-language
 * advice cards and alerts. Pure — no network.
 */
export function buildAdvice(f: ParsedForecast, history: RainfallHistory | null = null): {
  advice: Advice[]; alerts: WeatherAlert[]; spray_windows: SprayWindow[]; harvest_days: string[];
} {
  const T = ADVICE_THRESHOLDS;
  const advice: Advice[] = [];
  const alerts: WeatherAlert[] = [];
  const next48 = f.hourly.slice(f.nowIndex, f.nowIndex + 48);
  const days = f.daily.slice(f.todayIndex, f.todayIndex + 7);
  const now = f.hourly[f.nowIndex];
  const wb = computeWaterBalance(f);

  /* Spraying */
  const windows = sprayWindows(f.hourly, f.nowIndex, Math.min(f.hourly.length, f.nowIndex + 48)).filter((w) => w.hours >= 2);
  const sprayNow = sprayOk(f.hourly, f.nowIndex);
  advice.push({
    id: 'spraying',
    level: sprayNow ? 'good' : windows.length ? 'caution' : 'warning',
    title: sprayNow ? 'Good time to spray now' : windows.length ? 'Spray only at the times below' : 'Do not spray in the next 2 days',
    message: windows.length
      ? `Spray when the wind is calm and no rain is expected for ${T.spray.dryHoursAfter} hours, so the product is not blown away or washed off.`
      : `Rain or wind is expected — spray would be washed off or blown away. Wait for a calm, dry period of at least ${T.spray.dryHoursAfter} hours.`,
    details: windows.slice(0, 3).map((w) => `Good window: ${windowText(w)}`),
    source: 'derived',
    based_on: ['open-meteo-forecast'],
  });

  /* Irrigation */
  const past = wb.past_7d;
  const rainNext3 = sum(days.slice(0, 3).map((d) => d.rainfall_mm));
  const topsoil = now?.soil_moisture_3_9_m3 ?? null;
  const dryTopsoil = topsoil !== null && topsoil < T.irrigation.drySoilM3;
  if (past && (past.balance_mm <= T.irrigation.deficitMm || dryTopsoil) && rainNext3 < T.irrigation.rainSoonMm) {
    const severe = past.balance_mm <= T.irrigation.severeDeficitMm;
    advice.push({
      id: 'irrigation',
      level: severe ? 'warning' : 'caution',
      title: severe ? 'Trees need water' : 'Water young trees',
      message: severe
        ? 'The last 7 days were dry and little rain is coming. Water young trees and, if you can, flowering or fruiting trees too. Water early morning or evening and mulch around the trunk.'
        : 'Soil is drying out and little rain is coming. Water young trees (under 3 years) early morning or evening and keep mulch around the trunk.',
      details: [
        `Last 7 days: rain ${past.rain_mm} mm, water lost by plants and soil (ET0) ${past.et0_mm} mm → ${past.balance_mm} mm`,
        `Rain expected next 3 days: ${r1(rainNext3)} mm`,
        ...(topsoil !== null ? [`Topsoil moisture: ${Math.round(topsoil * 100)}% (dry below ${T.irrigation.drySoilM3 * 100}%)`] : []),
      ],
      source: 'derived',
      based_on: ['open-meteo-forecast', 'fao-56'],
    });
  } else {
    advice.push({
      id: 'irrigation',
      level: 'good',
      title: 'No extra watering needed',
      message: rainNext3 >= T.irrigation.rainSoonMm ? 'Rain is coming in the next 3 days. Wait for it before watering.' : 'Soil has enough water for now. Check again in a few days.',
      details: [
        ...(past ? [`Last 7 days: rain ${past.rain_mm} mm, ET0 ${past.et0_mm} mm → ${past.balance_mm > 0 ? '+' : ''}${past.balance_mm} mm`] : []),
        `Rain expected next 3 days: ${r1(rainNext3)} mm`,
      ],
      source: 'derived',
      based_on: ['open-meteo-forecast', 'fao-56'],
    });
  }
  const dry30 = history?.windows.find((w) => w.days === 30);
  if (dry30?.status === 'much_drier' || dry30?.status === 'drier') {
    advice[advice.length - 1].details.push(`Last 30 days: ${dry30.actual_mm} mm of rain, normal is ${dry30.normal_mm} mm (${dry30.label?.toLowerCase()}).`);
    if (dry30.status === 'much_drier' && advice[advice.length - 1].level === 'good') advice[advice.length - 1].level = 'caution';
  }

  /* Disease */
  const wetWarm = next48.filter((p) => {
    const wet = (p.humidity_pct ?? 0) >= T.disease.wetHumidityPct || (p.rain_mm ?? 0) >= T.disease.wetRainMm;
    const warm = (p.temperature_c ?? 0) >= T.disease.warmMinC && (p.temperature_c ?? 0) <= T.disease.warmMaxC;
    return wet && warm;
  }).length;
  const rainPast7 = past?.rain_mm ?? 0;
  const deepSoil = now?.soil_moisture_9_27_m3 ?? null;
  const waterlogged = rainPast7 >= T.disease.waterlogRain7dMm || (deepSoil !== null && deepSoil >= T.disease.waterlogSoilM3);
  const fungalLevel: Level = wetWarm >= T.disease.highHours ? 'warning' : wetWarm >= T.disease.moderateHours ? 'caution' : 'good';
  const diseaseLevel: Level = waterlogged ? (fungalLevel === 'good' ? 'caution' : 'warning') : fungalLevel;
  const diseaseMsgs: string[] = [];
  if (fungalLevel !== 'good') diseaseMsgs.push('Long wet and warm periods help anthracnose (black spots on fruit and leaves) spread. Check fruit and leaves, remove fallen fruit, and prune for air flow.');
  if (waterlogged) diseaseMsgs.push('The soil is very wet. Standing water causes root rot (Phytophthora). Open drains and keep water away from the trunk.');
  advice.push({
    id: 'disease',
    level: diseaseLevel,
    title: diseaseLevel === 'good' ? 'Low disease risk' : diseaseLevel === 'caution' ? 'Some disease risk' : 'High disease risk',
    message: diseaseMsgs.join(' ') || 'Weather is not favourable for fungal diseases right now. Keep checking your trees weekly.',
    details: [
      `Warm and wet hours in the next 48 h: ${wetWarm} (risk from ${T.disease.moderateHours}, high from ${T.disease.highHours})`,
      `Rain in the last 7 days: ${r1(rainPast7)} mm`,
      ...(deepSoil !== null ? [`Soil moisture at 9–27 cm: ${Math.round(deepSoil * 100)}%`] : []),
    ],
    source: 'derived',
    based_on: ['open-meteo-forecast'],
  });
  if (dry30?.status === 'wetter' || dry30?.status === 'much_wetter') {
    const d = advice[advice.length - 1];
    d.details.push(`Last 30 days: ${dry30.actual_mm} mm of rain, normal is ${dry30.normal_mm} mm (${dry30.label?.toLowerCase()}).`);
    d.based_on.push('open-meteo-archive');
  }

  /* Heat / cold */
  const hot = days.filter((d) => (d.temp_max_c ?? 0) >= T.heat.cautionC);
  const maxT = Math.max(...days.map((d) => d.temp_max_c ?? -99));
  const minT = Math.min(...days.map((d) => d.temp_min_c ?? 99));
  if (hot.length) {
    const danger = maxT >= T.heat.dangerC;
    advice.push({
      id: 'heat',
      level: danger ? 'warning' : 'caution',
      title: danger ? 'Very hot days ahead' : 'Hot days ahead',
      message: 'Hot sun can burn fruit and young trees. Keep leaves on the tree to shade fruit, paint young trunks with white wash, water young trees, and harvest in the cool morning.',
      details: [`Hot days (${T.heat.cautionC}°C or more): ${hot.map((d) => `${fmtDay(d.date)} ${Math.round(d.temp_max_c)}°C`).join(', ')}`],
      source: 'derived',
      based_on: ['open-meteo-forecast'],
    });
  } else if (minT <= T.heat.coldC) {
    advice.push({
      id: 'heat',
      level: 'caution',
      title: 'Cold nights ahead',
      message: 'Very cold nights can hurt young avocado trees. Mulch and cover young plants in the evening.',
      details: [`Lowest temperature next 7 days: ${Math.round(minT)}°C`],
      source: 'derived',
      based_on: ['open-meteo-forecast'],
    });
  } else {
    advice.push({
      id: 'heat',
      level: 'good',
      title: 'No heat stress expected',
      message: 'Temperatures are comfortable for avocado trees this week.',
      details: Number.isFinite(maxT) ? [`Temperatures next 7 days: ${Math.round(minT)}–${Math.round(maxT)}°C`] : [],
      source: 'derived',
      based_on: ['open-meteo-forecast'],
    });
  }

  /* Harvest */
  const harvestDays = days.filter(harvestOk).map((d) => d.date);
  advice.push({
    id: 'harvest',
    level: harvestDays.length >= 3 ? 'good' : harvestDays.length ? 'caution' : 'warning',
    title: harvestDays.length ? `${harvestDays.length} good harvest day${harvestDays.length > 1 ? 's' : ''} this week` : 'No dry day for harvest this week',
    message: harvestDays.length
      ? 'Pick fruit on dry days, in the morning when it is cool. Wet fruit rots faster and may be rejected by buyers.'
      : 'Every day this week may be rainy. If you must harvest, pick when the fruit is dry and keep it in the shade.',
    details: harvestDays.length ? [`Best days: ${harvestDays.map(fmtDay).join(', ')}`] : [],
    source: 'derived',
    based_on: ['open-meteo-forecast'],
  });

  /* Heavy rain / storms / wind → alerts */
  for (const d of days) {
    const code = d.weather_code ?? null;
    const dayHours = f.hourly.filter((p) => p.time.startsWith(d.date));
    const maxHour = Math.max(0, ...dayHours.map((p) => p.rain_mm ?? 0));
    if ((d.rainfall_mm ?? 0) >= T.rain.veryHeavyDayMm) {
      alerts.push({ id: `rain-${d.date}`, level: 'warning', date: d.date, title: `Very heavy rain ${fmtDay(d.date)}`,
        message: `About ${r1(d.rainfall_mm)} mm of rain expected. Risk of floods, landslides and soil erosion. Clear drains, avoid low-lying fields and steep paths.`,
        source: 'derived', based_on: ['open-meteo-forecast'] });
    } else if ((d.rainfall_mm ?? 0) >= T.rain.heavyDayMm || maxHour >= T.rain.intenseHourMm) {
      alerts.push({ id: `rain-${d.date}`, level: 'watch', date: d.date, title: `Heavy rain ${fmtDay(d.date)}`,
        message: `About ${r1(d.rainfall_mm)} mm of rain expected${maxHour >= T.rain.intenseHourMm ? `, up to ${r1(maxHour)} mm in one hour` : ''}. Check that water can drain away from the trees.`,
        source: 'derived', based_on: ['open-meteo-forecast'] });
    }
    if (isThunder(code)) {
      alerts.push({ id: `storm-${d.date}`, level: code === 96 || code === 99 ? 'warning' : 'watch', date: d.date, title: `Thunderstorms ${fmtDay(d.date)}`,
        message: 'Storms may bring lightning, strong wind and sometimes hail, which can damage flowers and young fruit. Do not shelter under trees.',
        source: 'derived', based_on: ['open-meteo-forecast'] });
    }
    if ((d.gusts_max_kmh ?? 0) >= T.rain.strongGustKmh) {
      alerts.push({ id: `wind-${d.date}`, level: 'watch', date: d.date, title: `Strong wind ${fmtDay(d.date)}`,
        message: `Gusts up to ${Math.round(d.gusts_max_kmh!)} km/h. Support heavily loaded branches and young trees.`,
        source: 'derived', based_on: ['open-meteo-forecast'] });
    }
  }
  const heavy = alerts.filter((a) => a.id.startsWith('rain-'));
  advice.push({
    id: 'rain',
    level: heavy.some((a) => a.level === 'warning') ? 'warning' : heavy.length ? 'caution' : 'good',
    title: heavy.length ? 'Heavy rain coming' : 'No heavy rain expected',
    message: heavy.length
      ? 'Clear drains, make sure water does not stand around trunks, and avoid applying fertiliser right before heavy rain.'
      : 'No heavy rain in the next 7 days. Always check Meteo Rwanda for official warnings.',
    details: heavy.map((a) => a.title),
    source: 'derived',
    based_on: ['open-meteo-forecast'],
  });

  return { advice, alerts, spray_windows: windows, harvest_days: harvestDays };
}

/* ───────────────────────────── Overview ───────────────────────────── */

export interface WeatherPoint {
  lat: number;
  lng: number;
  label: string;
  source: 'farm_gps' | 'district_centre' | 'query';
  approximate: boolean;
  farm_id?: string | null;
  farm_name?: string | null;
  district?: string | null;
}

/** Assemble the full response from raw upstream payloads (either may be missing). Pure. */
export function buildOverview(forecastRaw: any | null, archiveRaw: any | null, errors: { part: string; message: string }[] = []) {
  const f = forecastRaw ? parseForecast(forecastRaw) : null;
  const history = archiveRaw ? computeRainfallHistory(archiveRaw) : null;
  if (archiveRaw && !history) errors.push({ part: 'rainfall_history', message: 'No historical rainfall data for this place' });

  let body: Record<string, any> = { forecast_available: Boolean(f) };
  if (f) {
    const derived = buildAdvice(f, history);
    const today = f.daily[f.todayIndex];
    const now = f.hourly[f.nowIndex];
    const hourly = f.hourly.slice(f.nowIndex, f.nowIndex + 48).map((p, k) => ({ ...p, spray_ok: sprayOk(f.hourly, f.nowIndex + k) }));
    body = {
      ...body,
      current: { ...f.current, source: 'open-meteo-forecast' },
      today: today ? { ...today, source: 'open-meteo-forecast' } : null,
      hourly,
      hourly_source: 'open-meteo-forecast',
      daily: f.daily.slice(f.todayIndex, f.todayIndex + 16).map((d) => ({ ...d, harvest_ok: harvestOk(d) })),
      daily_source: 'open-meteo-forecast',
      past_daily: f.daily.slice(0, f.todayIndex),
      soil: now ? {
        source: 'open-meteo-forecast',
        observed_at: now.time,
        moisture_0_1cm_m3: now.soil_moisture_0_1_m3,
        moisture_3_9cm_m3: now.soil_moisture_3_9_m3,
        moisture_9_27cm_m3: now.soil_moisture_9_27_m3,
        temperature_6cm_c: now.soil_temperature_6cm_c,
        status: soilStatus(now.soil_moisture_3_9_m3),
        deep_status: soilStatus(now.soil_moisture_9_27_m3),
      } : null,
      water_balance: computeWaterBalance(f),
      elevation_m: f.elevation_m,
      ...derived,
    };
  }
  return {
    ...body,
    rainfall_history: history,
    thresholds: ADVICE_THRESHOLDS,
    partial: errors.length > 0,
    errors,
  };
}

/** Fetch both upstreams in parallel; partial data if one fails, error only if both fail. */
export async function getWeatherOverview(point: WeatherPoint) {
  const errors: { part: string; message: string }[] = [];
  // Rwanda is UTC+2 all year (no daylight saving).
  const today = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
  const [fc, ar] = await Promise.all([
    fetchForecastRaw(point.lat, point.lng).catch((e: Error) => {
      errors.push({ part: 'forecast', message: e.message });
      return null;
    }),
    fetchArchiveRaw(point.lat, point.lng, today).catch((e: Error) => {
      errors.push({ part: 'rainfall_history', message: e.message });
      return null;
    }),
  ]);
  if (!fc && !ar) throw new WeatherUnavailableError('The weather services are temporarily unavailable. Please try again later.');
  return {
    location: { ...point, lat: round2(point.lat), lng: round2(point.lng) },
    ...buildOverview(fc, ar, errors),
    sources: WEATHER_SOURCES,
    generated_at: new Date().toISOString(),
  };
}
