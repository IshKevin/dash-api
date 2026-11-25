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
} from '../services/weatherProvider';

// Live weather (Open-Meteo). Responses keep the old string fields
// (temperature "23°C" …) and add numeric ones plus `source`.
const router = Router();
const SOURCE = 'open-meteo';

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
    sendSuccess(res, { location, resolved_location: place.resolved, source: SOURCE, ...legacyCurrent(current), current, timestamp: new Date().toISOString() }, 'Current weather retrieved successfully');
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
    sendSuccess(res, { location, resolved_location: place.resolved, source: SOURCE, forecast, generated_at: new Date().toISOString() }, 'Weather forecast retrieved successfully');
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
    }, 'Farm weather conditions retrieved successfully');
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
      return { location, resolved_location: place.resolved, source: SOURCE, ...legacyCurrent(current), current, timestamp: new Date().toISOString() };
    }));
    sendSuccess(res, results, 'Multi-location weather retrieved successfully');
  } catch (error) {
    if (!unavailable(res, error)) throw error;
  }
}));

export default router;
