import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import {
  getWeather,
  geocodeRwanda,
  farmRecommendations,
  legacyCurrent,
  WeatherUnavailableError,
  WEATHER_SOURCES,
  getWeatherOverview,
  WeatherPoint,
} from '../services/weatherProvider';
import { districtCentre, parseLatLng, isInRwanda } from '../services/proximity';
import { canonicalDistrict } from '../services/rwandaGeo';

// Live weather (Open-Meteo). Responses keep the old string fields
// (temperature "23°C" …) and add numeric ones plus `source` / `sources`.
const router = Router();
const SOURCE = 'open-meteo';
const SOURCES = WEATHER_SOURCES.filter((s) => s.id !== 'open-meteo-archive');

const unavailable = (res: Response, error: unknown) => {
  if (error instanceof WeatherUnavailableError) {
    sendError(res, error.message, 503);
    return true;
  }
  return false;
};

router.get('/current', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { location } = req.query;
  if (!location) { sendError(res, 'Location parameter is required', 400); return; }
  try {
    const place = await geocodeRwanda(String(location));
    const { current } = await getWeather(place.lat, place.lng, 1);
    sendSuccess(res, { location, resolved_location: place.resolved, source: SOURCE, ...legacyCurrent(current), current, sources: SOURCES, timestamp: new Date().toISOString() }, 'Current weather retrieved successfully');
  } catch (error) {
    if (!unavailable(res, error)) throw error;
  }
}));

router.get('/forecast', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { location } = req.query;
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? '7'), 10) || 7, 1), 16);
  if (!location) { sendError(res, 'Location parameter is required', 400); return; }
  try {
    const place = await geocodeRwanda(String(location));
    const { daily } = await getWeather(place.lat, place.lng, days);
    const forecast = daily.map((d) => ({
      ...d,
      temperature: `${Math.round(d.temp_min_c)}–${Math.round(d.temp_max_c)}°C`,
      humidity: d.humidity_pct !== null ? `${Math.round(d.humidity_pct)}%` : '—',
      rainfall: `${Math.round(d.rainfall_mm * 10) / 10}mm`,
    }));
    sendSuccess(res, { location, resolved_location: place.resolved, source: SOURCE, forecast, sources: SOURCES, generated_at: new Date().toISOString() }, 'Weather forecast retrieved successfully');
  } catch (error) {
    if (!unavailable(res, error)) throw error;
  }
}));

router.get('/farm-conditions', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { farm_id } = req.query;
  if (!farm_id) { sendError(res, 'Farm ID parameter is required', 400); return; }

  const farm = await prisma.farm.findUnique({ where: { id: farm_id as string } });
  if (!farm) { sendError(res, 'Farm not found', 404); return; }
  if (req.user?.role === 'farmer' && farm.farmer_id !== req.user?.id) {
    sendError(res, 'Access denied: this farm does not belong to you', 403);
    return;
  }

  const loc = (farm.location as any) || {};
  try {
    // Exact farm GPS when known, otherwise the farm's district.
    const point = farm.latitude !== null && farm.longitude !== null
      ? { lat: farm.latitude, lng: farm.longitude, resolved: 'farm GPS location' }
      : await geocodeRwanda(loc.district || loc.province || 'Kigali');
    const { current, daily } = await getWeather(point.lat, point.lng, 7);

    sendSuccess(res, {
      farm_id: farm.id,
      farm_name: farm.farmName,
      location: [loc.sector, loc.district].filter(Boolean).join(', ') || point.resolved,
      weather_point: point.resolved,
      source: SOURCE,
      current_conditions: {
        ...legacyCurrent(current),
        soil_moisture: current.soil_moisture_pct !== null ? `${current.soil_moisture_pct}%` : '—',
        rainfall_today: `${Math.round((daily[0]?.rainfall_mm ?? current.rainfall_mm) * 10) / 10}mm`,
        observed_at: current.observed_at,
      },
      current,
      forecast: daily,
      recommendations: farmRecommendations(current, daily),
      sources: SOURCES,
    }, 'Farm weather conditions retrieved successfully');
  } catch (error) {
    if (!unavailable(res, error)) throw error;
  }
}));

type FarmRow = { id: string; farmName: string; farmer_id: string; latitude: number | null; longitude: number | null; location: any; archived_at: Date | null };
const farmDistrict = (farm: FarmRow) => canonicalDistrict((farm.location as any)?.district)?.name ?? null;
const hasGps = (farm: FarmRow) => farm.latitude !== null && farm.longitude !== null && isInRwanda({ lat: farm.latitude, lng: farm.longitude });

/** Farm → weather point: exact GPS, else its district centre, else the fallback district. */
function farmPoint(farm: FarmRow, fallbackDistrict: string | null): WeatherPoint | null {
  const base = { farm_id: farm.id, farm_name: farm.farmName, district: farmDistrict(farm) ?? fallbackDistrict };
  if (hasGps(farm)) return { ...base, lat: farm.latitude!, lng: farm.longitude!, label: farm.farmName, source: 'farm_gps', approximate: false };
  const district = farmDistrict(farm) ?? fallbackDistrict;
  const c = districtCentre(district);
  if (!c) return null;
  return { ...base, ...c, label: `${farm.farmName} — centre of ${district} district (approximate, add GPS to your farm for exact weather)`, source: 'district_centre', approximate: true };
}

/**
 * @route GET /api/weather/overview
 * @desc  Everything a farmer needs in one call: current, 48 h hourly, 16-day
 *        daily, soil, water balance, rainfall vs the 10-year normal, plain
 *        advice + alerts, thresholds used and the `sources` every number cites.
 *        Location (first match): lat & lng (inside Rwanda) | farm_id | district |
 *        farmer's first farm with GPS | farmer's profile district.
 *        Partial data (`partial: true`, `errors[]`) if one upstream fails; 503 if all fail.
 * @access Authenticated. Farmers only for their own farms.
 */
router.get('/overview', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const user = req.user!;
  const isFarmer = user.role === 'farmer';

  // The farmer's farms (for the picker) and profile district (fallback).
  let farms: FarmRow[] = [];
  let profileDistrict: string | null = null;
  if (isFarmer) {
    const [rows, profile] = await Promise.all([
      prisma.farm.findMany({
        where: { farmer_id: user.id, archived_at: null },
        select: { id: true, farmName: true, farmer_id: true, latitude: true, longitude: true, location: true, archived_at: true },
        orderBy: { created_at: 'asc' },
      }),
      prisma.farmerProfile.findUnique({ where: { user_id: user.id }, select: { district: true, farm_district: true } }),
    ]);
    farms = rows as FarmRow[];
    profileDistrict = canonicalDistrict(profile?.farm_district || profile?.district)?.name ?? null;
  }

  let point: WeatherPoint | null = null;
  if (q.lat !== undefined || q.lng !== undefined) {
    const p = parseLatLng(q.lat, q.lng);
    if (!p) { sendError(res, 'lat and lng must both be given and lie inside Rwanda', 400); return; }
    point = { ...p, label: 'Your current location', source: 'query', approximate: false };
  } else if (q.farm_id) {
    const farm = await prisma.farm.findUnique({
      where: { id: String(q.farm_id) },
      select: { id: true, farmName: true, farmer_id: true, latitude: true, longitude: true, location: true, archived_at: true },
    });
    if (!farm) { sendError(res, 'Farm not found', 404); return; }
    if (isFarmer && farm.farmer_id !== user.id) { sendError(res, 'Access denied: this farm does not belong to you', 403); return; }
    point = farmPoint(farm as FarmRow, profileDistrict);
    if (!point) { sendError(res, 'This farm has no GPS location or district yet. Ask your field agent to add it.', 400); return; }
  } else if (q.district) {
    const d = canonicalDistrict(q.district)?.name ?? null;
    const c = districtCentre(d);
    if (!c || !d) { sendError(res, 'Unknown district', 400); return; }
    point = { ...c, label: `${d} district (approximate)`, source: 'district_centre', approximate: true, district: d };
  } else if (isFarmer) {
    const first = farms.find(hasGps) ?? farms[0];
    point = first ? farmPoint(first, profileDistrict) : null;
    if (!point && profileDistrict) {
      point = { ...districtCentre(profileDistrict)!, label: `${profileDistrict} district (approximate, from your profile)`, source: 'district_centre', approximate: true, district: profileDistrict };
    }
    if (!point) { sendError(res, 'We could not find your farm location. Add GPS to your farm, set your district on your profile, or share your current location.', 400); return; }
  } else {
    sendError(res, 'Give lat & lng, a farm_id or a district', 400);
    return;
  }

  try {
    const overview = await getWeatherOverview(point);
    sendSuccess(res, {
      ...overview,
      farms: farms.map((f) => ({ id: f.id, name: f.farmName, district: farmDistrict(f), has_gps: hasGps(f) })),
    }, 'Weather overview retrieved successfully');
  } catch (error) {
    if (!unavailable(res, error)) throw error;
  }
}));

router.post('/multi-location', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { locations } = req.body;
  if (!locations || !Array.isArray(locations)) { sendError(res, 'Locations array is required', 400); return; }
  if (locations.length > 30) { sendError(res, 'At most 30 locations', 400); return; }
  try {
    const results = await Promise.all(locations.map(async (location: string) => {
      const place = await geocodeRwanda(String(location));
      const { current } = await getWeather(place.lat, place.lng, 1);
      return { location, resolved_location: place.resolved, source: SOURCE, ...legacyCurrent(current), current, sources: SOURCES, timestamp: new Date().toISOString() };
    }));
    sendSuccess(res, results, 'Multi-location weather retrieved successfully');
  } catch (error) {
    if (!unavailable(res, error)) throw error;
  }
}));

export default router;
