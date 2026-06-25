import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { validateIdParam, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// GET /api/farms
router.get('/', authenticate, authorize('admin', 'agent'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const where: any = {};

  if (req.query.status) where.status = req.query.status as any;
  if (req.query.farmer_id) where.farmer_id = req.query.farmer_id;

  const locationFilters: any = {};
  if (req.query.province) locationFilters.province = req.query.province;
  if (req.query.district) locationFilters.district = req.query.district;
  if (req.query.sector) locationFilters.sector = req.query.sector;

  if (Object.keys(locationFilters).length > 0) {
    where.location = { path: Object.keys(locationFilters), equals: locationFilters };
  }

  const [farms, total] = await Promise.all([
    prisma.farm.findMany({
      where,
      include: { farmer: { select: { full_name: true, email: true, phone: true } } },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.farm.count({ where }),
  ]);

  sendPaginatedResponse(res, farms, total, page, limit, 'Farms retrieved successfully');
}));

// GET /api/farms/overview
router.get('/overview', authenticate, authorize('admin', 'agent'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const [total, byStatus] = await Promise.all([
    prisma.farm.count(),
    prisma.farm.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const statusCounts: Record<string, number> = {};
  byStatus.forEach(s => { statusCounts[s.status] = s._count._all; });

  const [treesAgg, areaAgg] = await Promise.all([
    prisma.farm.aggregate({ _sum: { tree_count: true } }),
    prisma.farm.aggregate({ _sum: { farm_size: true } }),
  ]);

  sendSuccess(res, {
    total_farms: total,
    by_status: statusCounts,
    total_trees: treesAgg._sum.tree_count || 0,
    total_area: areaAgg._sum.farm_size || 0,
  }, 'Farms overview retrieved successfully');
}));

// GET /api/farms/:id
router.get('/:id', authenticate, authorize('admin', 'agent', 'farmer'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const farm = await prisma.farm.findUnique({
    where: { id: req.params.id },
    include: { farmer: { select: { full_name: true, email: true, phone: true } } },
  });

  if (!farm) {
    sendNotFound(res, 'Farm not found');
    return;
  }

  if (req.user?.role === 'farmer' && farm.farmer_id !== req.user.id) {
    sendError(res, 'Access denied', 403);
    return;
  }

  sendSuccess(res, farm, 'Farm retrieved successfully');
}));

// GET /api/farms/:id/details
router.get('/:id/details', authenticate, authorize('admin', 'agent', 'farmer'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const farm = await prisma.farm.findUnique({
    where: { id: req.params.id },
    include: { farmer: { select: { full_name: true, email: true, phone: true } } },
  });

  if (!farm) {
    sendNotFound(res, 'Farm not found');
    return;
  }

  if (req.user?.role === 'farmer' && farm.farmer_id !== req.user.id) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const estimatedYield = `${((farm.tree_count || 0) * 0.01).toFixed(1)} tons`;
  const isHarvestReady = farm.expected_harvest ? new Date(farm.expected_harvest) <= new Date() : false;

  sendSuccess(res, {
    ...farm,
    estimated_yield: estimatedYield,
    is_harvest_ready: isHarvestReady,
  }, 'Detailed farm information retrieved successfully');
}));

// GET /api/farms/:id/production-stats
router.get('/:id/production-stats', authenticate, authorize('admin', 'agent', 'farmer'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const farm = await prisma.farm.findUnique({ where: { id: req.params.id } });

  if (!farm) {
    sendNotFound(res, 'Farm not found');
    return;
  }

  if (req.user?.role === 'farmer' && farm.farmer_id !== req.user.id) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const stats = {
    farm_id: farm.id,
    farm_name: farm.farmName,
    tree_count: farm.tree_count,
    farm_size: farm.farm_size,
    varieties: farm.varieties,
    expected_harvest: farm.expected_harvest,
    estimated_annual_yield: `${((farm.tree_count || 0) * 0.01 * 2).toFixed(1)} tons`,
  };

  sendSuccess(res, stats, 'Farm production statistics retrieved successfully');
}));

// POST /api/farms
router.post('/', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { farmer_id, farm_name, farm_size, location, varieties, tree_count, planting_date, expected_harvest, status, notes, crop_type } = req.body;

  if (!farmer_id || !farm_name) {
    sendError(res, 'farmer_id and farm_name are required', 400);
    return;
  }

  const farmer = await prisma.user.findUnique({ where: { id: farmer_id } });
  if (!farmer || farmer.role !== 'farmer') {
    sendError(res, 'Invalid farmer_id', 400);
    return;
  }

  const farm = await prisma.farm.create({
    data: {
      farmer_id,
      farmName: farm_name,
      farmerName: farmer.full_name,
      farm_size: farm_size || 0,
      location: location || {},
      varieties: varieties || [],
      tree_count: tree_count || 0,
      planting_date: planting_date ? new Date(planting_date) : new Date(),
      expected_harvest: expected_harvest ? new Date(expected_harvest) : null,
      crop_type: crop_type || 'avocado',
      status: (status || 'planted') as any,
      notes,
    },
    include: { farmer: { select: { full_name: true, email: true, phone: true } } },
  });

  sendCreated(res, farm, 'Farm created successfully');
}));

// PUT /api/farms/:id
router.put('/:id', authenticate, authorize('admin', 'agent', 'farmer'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.farm.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Farm not found'); return; }

  if (req.user?.role === 'farmer' && existing.farmer_id !== req.user.id) {
    sendError(res, 'Access denied', 403); return;
  }

  const { farmer_id, farm_name, farm_size, planting_date, expected_harvest, ...rest } = req.body;
  const updateData: any = { ...rest };
  if (farm_name) updateData.farmName = farm_name;
  if (farm_size !== undefined) updateData.farm_size = farm_size;
  if (planting_date) updateData.planting_date = new Date(planting_date);
  if (expected_harvest) updateData.expected_harvest = new Date(expected_harvest);

  const farm = await prisma.farm.update({
    where: { id: req.params.id },
    data: updateData,
    include: { farmer: { select: { full_name: true, email: true, phone: true } } },
  });

  sendSuccess(res, farm, 'Farm updated successfully');
}));

// DELETE /api/farms/:id
router.delete('/:id', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const farm = await prisma.farm.delete({ where: { id: req.params.id } }).catch(() => null);
  if (!farm) { sendNotFound(res, 'Farm not found'); return; }

  sendSuccess(res, null, 'Farm deleted successfully');
}));

export default router;
