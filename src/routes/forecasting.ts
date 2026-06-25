import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize, adminOnly } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// GET /api/forecasting - List HarvestForecast with filters and pagination
router.get(
  '/',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { farm_id, province, district, forecast_year, page = '1', limit = '20' } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, any> = {};
    if (farm_id) where.farm_id = farm_id;
    if (province) where.province = province;
    if (district) where.district = district;
    if (forecast_year) where.forecast_year = parseInt(forecast_year, 10);

    const [forecasts, total] = await Promise.all([
      prisma.harvestForecast.findMany({
        where,
        include: {
          farm: {
            select: {
              farmName: true,
              farmer_id: true,
            },
          },
        },
        orderBy: [{ forecast_year: 'desc' }, { created_at: 'desc' }],
        skip,
        take: limitNum,
      }),
      prisma.harvestForecast.count({ where }),
    ]);

    return sendPaginatedResponse(res, forecasts, total, pageNum, limitNum, 'Forecasts retrieved successfully');
  })
);

// POST /api/forecasting - Create a new HarvestForecast
router.post(
  '/',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      farm_id,
      province,
      district,
      forecast_year,
      forecast_season,
      predicted_kg,
      confidence_pct,
      basis,
      notes,
    } = req.body;

    if (!forecast_year || predicted_kg === undefined || predicted_kg === null) {
      return sendError(res, 'forecast_year and predicted_kg are required', 400 as any);
    }

    const forecast_number = 'FCST-' + Date.now();

    const forecast = await prisma.harvestForecast.create({
      data: {
        forecast_number,
        farm_id: farm_id ?? null,
        province: province ?? null,
        district: district ?? null,
        forecast_year: parseInt(forecast_year, 10),
        forecast_season: forecast_season ?? null,
        predicted_kg: parseFloat(predicted_kg),
        confidence_pct: confidence_pct !== undefined ? parseFloat(confidence_pct) : 70,
        basis: basis ?? null,
        notes: notes ?? null,
        created_by: req.user!.id,
      },
      include: {
        farm: {
          select: {
            farmName: true,
            farmer_id: true,
          },
        },
      },
    });

    return sendCreated(res, forecast, 'Forecast created successfully');
  })
);

// GET /api/forecasting/regional - Aggregate forecasts grouped by province
router.get(
  '/regional',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const currentYear = new Date().getFullYear();
    const { forecast_year = String(currentYear) } = req.query as Record<string, string>;

    const year = parseInt(forecast_year, 10);

    const grouped = await prisma.harvestForecast.groupBy({
      by: ['province'],
      where: { forecast_year: year },
      _sum: {
        predicted_kg: true,
        actual_kg: true,
      },
      _count: {
        farm_id: true,
      },
    });

    const result = grouped.map((g) => ({
      province: g.province,
      total_predicted_kg: g._sum.predicted_kg ?? 0,
      total_actual_kg: g._sum.actual_kg ?? 0,
      farm_count: g._count.farm_id,
    }));

    return sendSuccess(res, result, 'Regional forecast data retrieved successfully');
  })
);

// GET /api/forecasting/compare - List forecasts with actual_kg set and accuracy rating
router.get(
  '/compare',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { forecast_year, province } = req.query as Record<string, string>;

    const where: Record<string, any> = {
      actual_kg: { not: null },
    };

    if (forecast_year) where.forecast_year = parseInt(forecast_year, 10);
    if (province) where.province = province;

    const forecasts = await prisma.harvestForecast.findMany({
      where,
      include: {
        farm: {
          select: {
            farmName: true,
            farmer_id: true,
          },
        },
      },
      orderBy: [{ forecast_year: 'desc' }, { created_at: 'desc' }],
    });

    const result = forecasts.map((f) => {
      const variance = f.variance_pct ?? 0;
      let accuracy_rating: string;
      if (Math.abs(variance) < 10) {
        accuracy_rating = 'on_track';
      } else if (variance > 0) {
        accuracy_rating = 'over';
      } else {
        accuracy_rating = 'under';
      }
      return { ...f, accuracy_rating };
    });

    return sendSuccess(res, result, 'Forecast comparison data retrieved successfully');
  })
);

// GET /api/forecasting/:id - Get a single forecast
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const forecast = await prisma.harvestForecast.findUnique({
      where: { id },
      include: {
        farm: {
          select: {
            farmName: true,
            farmer_id: true,
          },
        },
      },
    });

    if (!forecast) {
      return sendNotFound(res, 'Forecast not found');
    }

    return sendSuccess(res, forecast, 'Forecast retrieved successfully');
  })
);

// PUT /api/forecasting/:id - Update a forecast
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { predicted_kg, actual_kg, confidence_pct, notes, forecast_season, basis } = req.body;

    const existing = await prisma.harvestForecast.findUnique({ where: { id } });
    if (!existing) {
      return sendNotFound(res, 'Forecast not found');
    }

    const updateData: Record<string, any> = {};

    if (predicted_kg !== undefined) updateData.predicted_kg = parseFloat(predicted_kg);
    if (confidence_pct !== undefined) updateData.confidence_pct = parseFloat(confidence_pct);
    if (notes !== undefined) updateData.notes = notes;
    if (forecast_season !== undefined) updateData.forecast_season = forecast_season;
    if (basis !== undefined) updateData.basis = basis;

    if (actual_kg !== undefined) {
      updateData.actual_kg = parseFloat(actual_kg);
      const effectivePredicted = updateData.predicted_kg ?? existing.predicted_kg;
      if (effectivePredicted && effectivePredicted !== 0) {
        updateData.variance_pct = ((parseFloat(actual_kg) - effectivePredicted) / effectivePredicted) * 100;
      }
    }

    const updated = await prisma.harvestForecast.update({
      where: { id },
      data: updateData,
      include: {
        farm: {
          select: {
            farmName: true,
            farmer_id: true,
          },
        },
      },
    });

    return sendSuccess(res, updated, 'Forecast updated successfully');
  })
);

// DELETE /api/forecasting/:id - Delete a forecast (admin only)
router.delete(
  '/:id',
  authenticate,
  adminOnly,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const existing = await prisma.harvestForecast.findUnique({ where: { id } });
    if (!existing) {
      return sendNotFound(res, 'Forecast not found');
    }

    await prisma.harvestForecast.delete({ where: { id } });

    return sendSuccess(res, null, 'Forecast deleted successfully');
  })
);

export default router;
