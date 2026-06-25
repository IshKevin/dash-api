import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

const mockWeatherData: Record<string, any> = {
  Kigali: { temperature: '24°C', humidity: '65%', rainfall: '2mm', wind_speed: '15 km/h', conditions: 'Partly Cloudy' },
  Huye: { temperature: '22°C', humidity: '70%', rainfall: '5mm', wind_speed: '12 km/h', conditions: 'Light Rain' },
  Musanze: { temperature: '20°C', humidity: '75%', rainfall: '8mm', wind_speed: '18 km/h', conditions: 'Overcast' },
};

const defaultWeather = { temperature: '23°C', humidity: '68%', rainfall: '3mm', wind_speed: '14 km/h', conditions: 'Partly Cloudy' };

router.get('/current', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { location } = req.query;
  if (!location) { sendError(res, 'Location parameter is required', 400); return; }
  const weatherData = mockWeatherData[location as string] || defaultWeather;
  sendSuccess(res, { location, ...weatherData, timestamp: new Date().toISOString() }, 'Current weather retrieved successfully');
}));

router.get('/forecast', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { location, days = 7 } = req.query;
  if (!location) { sendError(res, 'Location parameter is required', 400); return; }

  const forecast = [];
  for (let i = 0; i < Number(days); i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    forecast.push({
      date: date.toISOString().split('T')[0],
      temperature: `${24 + Math.floor(Math.random() * 6) - 3}°C`,
      humidity: `${60 + Math.floor(Math.random() * 20)}%`,
      rainfall: `${Math.floor(Math.random() * 10)}mm`,
      conditions: ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain'][Math.floor(Math.random() * 4)],
    });
  }
  sendSuccess(res, { location, forecast, generated_at: new Date().toISOString() }, 'Weather forecast retrieved successfully');
}));

router.get('/farm-conditions', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { farm_id } = req.query;
  if (!farm_id) { sendError(res, 'Farm ID parameter is required', 400); return; }

  const farm = await prisma.farm.findUnique({ where: { id: farm_id as string } });
  if (!farm) { sendError(res, 'Farm not found', 404); return; }

  const role = req.user?.role;
  if (role === 'farmer' && farm.farmer_id !== req.user?.id) {
    sendError(res, 'Access denied: this farm does not belong to you', 403);
    return;
  }

  const loc = (farm.location as any) || {};
  const weatherData = mockWeatherData[loc.district] || mockWeatherData.Kigali!;
  const temp = parseInt(weatherData.temperature);
  const humidity = parseInt(weatherData.humidity);
  const rainfall = parseInt(weatherData.rainfall);

  const recommendations: string[] = [];
  if (temp > 25) recommendations.push('Consider providing shade for young trees');
  if (humidity > 70) recommendations.push('Monitor for fungal diseases');
  if (rainfall < 2) recommendations.push('Consider irrigation in 2 days');
  else if (rainfall > 10) recommendations.push('Ensure proper drainage');
  if (temp >= 20 && temp <= 25 && rainfall < 5) recommendations.push('Good conditions for harvesting');

  sendSuccess(res, {
    farm_id: farm.id,
    farm_name: farm.farmName,
    location: `${loc.sector || ''}, ${loc.district || ''}`.replace(/^, /, ''),
    current_conditions: { ...weatherData, soil_moisture: `${45 + Math.floor(Math.random() * 20)}%`, rainfall_today: weatherData.rainfall },
    recommendations,
  }, 'Farm weather conditions retrieved successfully');
}));

router.post('/multi-location', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { locations } = req.body;
  if (!locations || !Array.isArray(locations)) { sendError(res, 'Locations array is required', 400); return; }

  const weatherResults = locations.map((location: string) => ({
    location,
    ...(mockWeatherData[location] || defaultWeather),
    timestamp: new Date().toISOString(),
  }));
  sendSuccess(res, weatherResults, 'Multi-location weather retrieved successfully');
}));

export default router;
