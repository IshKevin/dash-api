import { Router, Response } from 'express';
import { FarmStatus } from '@prisma/client';
import { parseLatLng } from '../services/proximity';
import { normalizeLocation } from '../services/rwandaLocation';
import { prisma } from '../lib/prisma';
import { validateIdParam, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize, adminOnly } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { canAccessFarmer, farmerScope, OUTSIDE_TERRITORY } from '../utils/agentScope';

const router = Router();

// GET /api/farms
router.get('/', authenticate, authorize('admin', 'agent'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const where: any = {};

  // Archived farms are hidden unless explicitly requested.
  if (req.query.include_archived !== 'true') where.archived_at = null;
  if (req.query.status) where.status = req.query.status as any;
  if (req.query.farmer_id) where.farmer_id = req.query.farmer_id;
  const scope = await farmerScope(req); // VBAs: only farms of farmers in their area
  if (scope) where.farmer = scope;

  // Each location filter is its own JSON-path condition (a multi-key path
  // would look for nested keys and never match).
  const and: any[] = [];
  for (const key of ['province', 'district', 'sector'] as const) {
    if (req.query[key]) and.push({ location: { path: [key], equals: String(req.query[key]) } });
  }
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search) {
    and.push({ OR: [
      { farmName: { contains: search, mode: 'insensitive' } },
      { farmerName: { contains: search, mode: 'insensitive' } },
      { upi: { contains: search } },
    ] });
  }
  if (and.length) where.AND = and;

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

// GET /api/farms/mine — the farmer's own active farms with what the farm pages need
router.get('/mine', authenticate, authorize('farmer'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const farms = await prisma.farm.findMany({
    where: { farmer_id: req.user!.id, archived_at: null },
    orderBy: { created_at: 'asc' },
    select: {
      id: true, farmName: true, location: true, farm_size: true, tree_count: true, varieties: true, status: true,
      planting_date: true, expected_harvest: true, latitude: true, longitude: true, upi: true, land_verified_at: true,
      irrigation_system: true, organic_certified: true, notes: true, created_at: true,
      _count: { select: { harvest_lots: true, service_requests: true } },
    },
  });
  sendSuccess(res, farms, 'Your farms');
}));

// GET /api/farms/overview
router.get('/overview', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const scope = await farmerScope(req);
  const active = { archived_at: null, ...(scope && { farmer: scope }) };
  const [total, byStatus] = await Promise.all([
    prisma.farm.count({ where: active }),
    prisma.farm.groupBy({ by: ['status'], where: active, _count: { _all: true } }),
  ]);

  const statusCounts: Record<string, number> = {};
  byStatus.forEach(s => { statusCounts[s.status] = s._count._all; });

  const [treesAgg, areaAgg] = await Promise.all([
    prisma.farm.aggregate({ where: active, _sum: { tree_count: true } }),
    prisma.farm.aggregate({ where: active, _sum: { farm_size: true } }),
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

  if (!(await canAccessFarmer(req, farm.farmer_id))) {
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

  if (!(await canAccessFarmer(req, farm.farmer_id))) {
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

  if (!(await canAccessFarmer(req, farm.farmer_id))) {
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
// Farmers add their own farms (a farmer can have several); admins/VBAs add
// one for a farmer (farmer_id). Only a name and a district are required —
// everything else has a sensible default or comes from the farmer's profile.
router.post('/', authenticate, authorize('admin', 'agent', 'farmer'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = req.body || {};
  const farmerId: string | undefined = req.user!.role === 'farmer' ? req.user!.id : b.farmer_id;
  const farmName = typeof (b.farm_name ?? b.farmName) === 'string' ? String(b.farm_name ?? b.farmName).trim() : '';
  if (!farmerId || !farmName) {
    sendError(res, req.user!.role === 'farmer' ? 'farm_name is required' : 'farmer_id and farm_name are required', 400);
    return;
  }

  const farmer = await prisma.user.findUnique({ where: { id: farmerId }, include: { farmer_profile: true } });
  if (!farmer || farmer.role !== 'farmer') {
    sendError(res, 'Invalid farmer_id', 400);
    return;
  }
  if (!(await canAccessFarmer(req, farmerId))) {
    sendError(res, OUTSIDE_TERRITORY, 403);
    return;
  }

  // Location: validated against the official list (rwanda package). Falls back
  // to the farm address on the farmer's profile.
  const fp = farmer.farmer_profile;
  const rawLoc = b.location && typeof b.location === 'object' && b.location.district
    ? b.location
    : { province: fp?.farm_province || fp?.province, district: fp?.farm_district || fp?.district, sector: fp?.farm_sector || fp?.sector, cell: fp?.farm_cell || fp?.cell, village: fp?.farm_village || fp?.village };
  const [loc, locErr] = normalizeLocation(rawLoc);
  if (locErr) { sendError(res, `Farm location: ${locErr}`, 400); return; }

  const num = (v: unknown, field: string, int = false): [number | undefined, string | null] => {
    if (v === undefined || v === null || v === '') return [undefined, null];
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || (int && !Number.isInteger(n))) return [undefined, `${field} must be a ${int ? 'whole ' : ''}positive number`];
    return [n, null];
  };
  const [treeCount, tErr] = num(b.tree_count, 'tree_count', true);
  const [farmSize, sErr] = num(b.farm_size, 'farm_size');
  if (tErr || sErr) { sendError(res, (tErr || sErr)!, 400); return; }

  let plantingDate: Date;
  if (b.planting_date) plantingDate = new Date(b.planting_date);
  else if (b.planting_year) plantingDate = new Date(Date.UTC(Number(b.planting_year), 0, 1));
  else if (fp?.farm_age) plantingDate = new Date(Date.UTC(new Date().getUTCFullYear() - fp.farm_age, 0, 1));
  else plantingDate = new Date();
  if (Number.isNaN(plantingDate.getTime()) || plantingDate.getTime() > Date.now() + 864e5) { sendError(res, 'planting date must be a valid date, not in the future', 400); return; }

  if (b.status !== undefined && !(Object.values(FarmStatus) as string[]).includes(b.status)) {
    sendError(res, `status must be one of: ${Object.values(FarmStatus).join(', ')}`, 400); return;
  }
  let point: { lat: number; lng: number } | null = null;
  if (b.latitude !== undefined || b.longitude !== undefined) {
    point = parseLatLng(b.latitude, b.longitude);
    if (!point) { sendError(res, 'latitude and longitude must both be given and lie inside Rwanda', 400); return; }
  }

  const varieties = Array.isArray(b.varieties) ? b.varieties.map(String).filter(Boolean) : fp?.avocado_type ? [fp.avocado_type] : [];

  const farm = await prisma.farm.create({
    data: {
      farmer_id: farmerId,
      farmName,
      farmerName: farmer.full_name,
      farm_size: farmSize ?? 0,
      location: loc as any,
      varieties,
      tree_count: treeCount ?? 0,
      planting_date: plantingDate,
      expected_harvest: b.expected_harvest ? new Date(b.expected_harvest) : null,
      crop_type: b.crop_type || 'avocado',
      status: (b.status || 'planted') as any,
      notes: typeof b.notes === 'string' ? b.notes : undefined,
      irrigation_system: typeof b.irrigation_system === 'string' ? b.irrigation_system : undefined,
      ...(point && { latitude: point.lat, longitude: point.lng }),
    },
    include: { farmer: { select: { full_name: true, email: true, phone: true } } },
  });

  sendCreated(res, farm, 'Farm created successfully');
}));

// PUT /api/farms/:id
router.put('/:id', authenticate, authorize('admin', 'agent', 'farmer'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.farm.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Farm not found'); return; }

  if (!(await canAccessFarmer(req, existing.farmer_id))) {
    sendError(res, 'Access denied', 403); return;
  }

  const { farm_name, farm_size, planting_date, expected_harvest, latitude, longitude } = req.body;
  // Only known, editable fields — ownership/land/verification fields are not settable here.
  const EDITABLE = ['farmName', 'location', 'crop_type', 'tree_count', 'varieties', 'status', 'organic_certified', 'irrigation_system', 'soil_type', 'notes'];
  const updateData: any = {};
  for (const k of EDITABLE) if (req.body[k] !== undefined) updateData[k] = req.body[k];
  if (farm_name) updateData.farmName = farm_name;
  if (farm_size !== undefined) updateData.farm_size = farm_size;
  if (planting_date) updateData.planting_date = new Date(planting_date);
  if (expected_harvest) updateData.expected_harvest = new Date(expected_harvest);
  // Validated against the official list when it names a district (older clients may send less).
  if (updateData.location && typeof updateData.location === 'object' && updateData.location.district) {
    const [loc, locErr] = normalizeLocation(updateData.location);
    if (locErr) { sendError(res, `Farm location: ${locErr}`, 400); return; }
    // Replace the address levels (so a cleared sector stays cleared) but keep other keys (e.g. coordinates).
    const kept = Object.fromEntries(Object.entries((existing.location as Record<string, unknown>) || {}).filter(([k]) => !['province', 'district', 'sector', 'cell', 'village'].includes(k)));
    updateData.location = { ...kept, ...loc };
  }
  if (updateData.status !== undefined && !(Object.values(FarmStatus) as string[]).includes(updateData.status)) {
    sendError(res, `status must be one of: ${Object.values(FarmStatus).join(', ')}`, 400); return;
  }
  if (latitude !== undefined || longitude !== undefined) {
    if (latitude === null && longitude === null) {
      updateData.latitude = null;
      updateData.longitude = null;
    } else {
      const p = parseLatLng(latitude, longitude);
      if (!p) { sendError(res, 'latitude and longitude must both be given and lie inside Rwanda', 400); return; }
      updateData.latitude = p.lat;
      updateData.longitude = p.lng;
    }
    // Moving the farm invalidates an agent's land verification (same rule as /api/land).
    if (updateData.latitude !== existing.latitude || updateData.longitude !== existing.longitude) updateData.land_verified_at = null;
  }

  const farm = await prisma.farm.update({
    where: { id: req.params.id },
    data: updateData,
    include: { farmer: { select: { full_name: true, email: true, phone: true } } },
  });

  sendSuccess(res, farm, 'Farm updated successfully');
}));

// DELETE /api/farms/:id
router.delete('/:id', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.farm.findUnique({
    where: { id: req.params.id },
    select: { id: true, _count: { select: { farm_visits: true, disease_cases: true, tree_records: true, harvest_lots: true, forecasts: true, surveys: true } } },
  });
  if (!existing) { sendNotFound(res, 'Farm not found'); return; }
  const linked = Object.entries(existing._count).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`);
  if (linked.length) {
    sendError(res, `This farm still has ${linked.join(', ')}. Archive it instead of deleting.`, 409);
    return;
  }
  await prisma.farm.delete({ where: { id: existing.id } });

  sendSuccess(res, null, 'Farm deleted successfully');
}));

// GET /api/farms/:id/history
router.get('/:id/history', authenticate, authorize('admin', 'agent', 'farmer'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const farm = await prisma.farm.findUnique({ where: { id: req.params.id } });
  if (!farm) { sendNotFound(res, 'Farm not found'); return; }

  if (!(await canAccessFarmer(req, farm.farmer_id))) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const [serviceRequests, reports, visits] = await Promise.all([
    prisma.serviceRequest.findMany({
      // Same farmer only — a farm-name match alone would show other farmers' requests.
      where: { farmer_id: farm.farmer_id, location: { path: ['farm_name'], string_contains: farm.farmName } },
      select: { id: true, title: true, service_type: true, status: true, created_at: true },
      orderBy: { created_at: 'desc' },
      take: 20,
    }),
    prisma.report.findMany({
      where: { farmer_id: farm.farmer_id },
      select: { id: true, title: true, report_type: true, status: true, created_at: true },
      orderBy: { created_at: 'desc' },
      take: 20,
    }),
    prisma.farmVisit.findMany({
      where: { farm_id: req.params.id },
      include: { agent: { select: { full_name: true } } },
      orderBy: { scheduled_at: 'desc' },
      take: 20,
    }),
  ]);

  sendSuccess(res, { service_requests: serviceRequests, reports, visits }, 'Farm history retrieved');
}));

// PUT /api/farms/:id/archive
router.put('/:id/archive', authenticate, authorize('admin', 'farmer'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const farm = await prisma.farm.findUnique({ where: { id: req.params.id } });
  if (!farm) { sendNotFound(res, 'Farm not found'); return; }
  if (req.user!.role === 'farmer' && farm.farmer_id !== req.user!.id) { sendError(res, 'Access denied', 403); return; }
  if ((farm as any).archived_at) { sendError(res, 'Farm is already archived', 400); return; }

  const updated = await prisma.farm.update({
    where: { id: req.params.id },
    data: { archived_at: new Date() } as any,
  });
  sendSuccess(res, updated, 'Farm archived successfully');
}));

// PUT /api/farms/:id/assign-agent
router.put('/:id/assign-agent', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agent_id } = req.body;
  if (!agent_id) { sendError(res, 'agent_id is required', 400); return; }

  const [farm, agent] = await Promise.all([
    prisma.farm.findUnique({ where: { id: req.params.id } }),
    prisma.user.findUnique({ where: { id: agent_id } }),
  ]);
  if (!farm) { sendNotFound(res, 'Farm not found'); return; }
  if (!agent || agent.role !== 'agent') { sendError(res, 'Agent not found or user is not an agent', 400); return; }

  // Re-assigning the same agent must not pile up duplicate visits.
  const open = await prisma.farmVisit.findFirst({ where: { farm_id: req.params.id, agent_id, status: { in: ['scheduled', 'in_progress'] } } });
  if (open) { sendSuccess(res, open, 'Agent already assigned — visit already scheduled'); return; }

  // Schedule a visit
  const visit = await prisma.farmVisit.create({
    data: {
      visit_number: 'VISIT-' + Date.now(),
      farm_id: req.params.id,
      agent_id,
      scheduled_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
      purpose: 'Initial farm assessment',
    },
  });

  sendCreated(res, visit, 'Agent assigned and visit scheduled');
}));

export default router;
