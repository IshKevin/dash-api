import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import Farm from '../models/Farm';

const router = Router();

// Mock weather data - in production, you would integrate with a real weather API
const mockWeatherData = {
  'Kigali': {
    temperature: '24°C',
    humidity: '65%',
    rainfall: '2mm',
    wind_speed: '15 km/h',
    conditions: 'Partly Cloudy'
  },
  'Huye': {
    temperature: '22°C',
    humidity: '70%',
    rainfall: '5mm',
    wind_speed: '12 km/h',
    conditions: 'Light Rain'
  },
  'Musanze': {
    temperature: '20°C',
    humidity: '75%',
    rainfall: '8mm',
    wind_speed: '18 km/h',
    conditions: 'Overcast'
  }
};

/**
 * @route   GET /api/weather/current
 * @desc    Get current weather for location
 * @access  Private
 */
router.get('/current', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { location } = req.query;

        if (!location) {
            return sendError(res, 'Location parameter is required', 400);
        }

        // In production, you would call a real weather API here
        const weatherData = (mockWeatherData as any)[location as string] || {
            temperature: '23°C',
            humidity: '68%',
            rainfall: '3mm',
            wind_speed: '14 km/h',
            conditions: 'Partly Cloudy'
        };

        const response = {
            location: location as string,
            ...weatherData,
            timestamp: new Date().toISOString()
        };

        return sendSuccess(res, response, 'Current weather retrieved successfully');
    } catch (error: any) {
        console.error('Get current weather error:', error);
        return sendError(res, 'Failed to retrieve current weather', 500);
    }
}));

/**
 * @route   GET /api/weather/forecast
 * @desc    Get weather forecast
 * @access  Private
 */
router.get('/forecast', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { location, days = 7 } = req.query;

        if (!location) {
            return sendError(res, 'Location parameter is required', 400);
        }

        // Mock forecast data - in production, integrate with real weather API
        const forecast = [];
        const baseTemp = 24;
        
        for (let i = 0; i < Number(days); i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            
            forecast.push({
                date: date.toISOString().split('T')[0],
                temperature: `${baseTemp + Math.floor(Math.random() * 6) - 3}°C`,
                humidity: `${60 + Math.floor(Math.random() * 20)}%`,
                rainfall: `${Math.floor(Math.random() * 10)}mm`,
                conditions: ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain'][Math.floor(Math.random() * 4)]
            });
        }

        const response = {
            location: location as string,
            forecast,
            generated_at: new Date().toISOString()
        };

        return sendSuccess(res, response, 'Weather forecast retrieved successfully');
    } catch (error: any) {
        console.error('Get weather forecast error:', error);
        return sendError(res, 'Failed to retrieve weather forecast', 500);
    }
}));

/**
 * @route   GET /api/weather/farm-conditions
 * @desc    Get farm-specific weather conditions
 * @access  Private
 */
router.get('/farm-conditions', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { farm_id } = req.query;

        if (!farm_id) {
            return sendError(res, 'Farm ID parameter is required', 400);
        }

        const farm = await Farm.findById(farm_id);
        if (!farm) {
            return sendError(res, 'Farm not found', 404);
        }

        // Get weather for farm location
        const location = farm.location.district;
        const weatherData = (mockWeatherData as any)[location] || mockWeatherData['Kigali'];

        // Generate farm-specific recommendations
        const recommendations = [];
        const temp = parseInt(weatherData.temperature);
        const humidity = parseInt(weatherData.humidity);
        const rainfall = parseInt(weatherData.rainfall);

        if (temp > 25) {
            recommendations.push('Consider providing shade for young trees');
        }
        if (humidity > 70) {
            recommendations.push('Monitor for fungal diseases');
        }
        if (rainfall < 2) {
            recommendations.push('Consider irrigation in 2 days');
        } else if (rainfall > 10) {
            recommendations.push('Ensure proper drainage');
        }
        if (temp >= 20 && temp <= 25 && rainfall < 5) {
            recommendations.push('Good conditions for harvesting');
        }

        const response = {
            farm_id: farm._id,
            farm_name: farm.farmName,
            location: `${farm.location.sector}, ${farm.location.district}`,
            current_conditions: {
                ...weatherData,
                soil_moisture: `${45 + Math.floor(Math.random() * 20)}%`, // Mock soil moisture
                rainfall_today: weatherData.rainfall
            },
            recommendations
        };

        return sendSuccess(res, response, 'Farm weather conditions retrieved successfully');
    } catch (error: any) {
        console.error('Get farm weather conditions error:', error);
        return sendError(res, 'Failed to retrieve farm weather conditions', 500);
    }
}));

/**
 * @route   POST /api/weather/multi-location
 * @desc    Get weather for multiple locations
 * @access  Private
 */
router.post('/multi-location', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { locations } = req.body;

        if (!locations || !Array.isArray(locations)) {
            return sendError(res, 'Locations array is required', 400);
        }

        const weatherResults = locations.map((location: string) => {
            const weatherData = (mockWeatherData as any)[location] || {
                temperature: '23°C',
                humidity: '68%',
                rainfall: '3mm',
                wind_speed: '14 km/h',
                conditions: 'Partly Cloudy'
            };

            return {
                location,
                ...weatherData,
                timestamp: new Date().toISOString()
            };
        });

        return sendSuccess(res, weatherResults, 'Multi-location weather retrieved successfully');
    } catch (error: any) {
        console.error('Get multi-location weather error:', error);
        return sendError(res, 'Failed to retrieve multi-location weather', 500);
    }
}));

export default router;