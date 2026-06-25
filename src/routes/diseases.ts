import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize, adminOnly } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// GET /api/diseases/registry
router.get(
  '/registry',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search as string | undefined;
    const is_active = req.query.is_active as string | undefined;

    const where: Record<string, any> = {};

    if (is_active !== undefined) {
      where.is_active = is_active === 'true';
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [entries, total] = await Promise.all([
      prisma.diseaseRegistry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      prisma.diseaseRegistry.count({ where }),
    ]);

    return sendPaginatedResponse(res, entries, total, page, limit, 'Disease registry retrieved successfully');
  })
);

// POST /api/diseases/registry
router.post(
  '/registry',
  authenticate,
  adminOnly,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { name, description, symptoms, prevention, treatment } = req.body;

    if (!name) {
      return sendError(res, 'Name is required', 400 as any);
    }

    const existing = await prisma.diseaseRegistry.findUnique({ where: { name } });
    if (existing) {
      return sendError(res, 'A disease registry entry with this name already exists', 409 as any);
    }

    const entry = await prisma.diseaseRegistry.create({
      data: { name, description, symptoms, prevention, treatment },
    });

    return sendCreated(res, entry, 'Disease registry entry created successfully');
  })
);

// PUT /api/diseases/registry/:id
router.put(
  '/registry/:id',
  authenticate,
  adminOnly,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { name, description, symptoms, prevention, treatment, is_active } = req.body;

    const existing = await prisma.diseaseRegistry.findUnique({ where: { id } });
    if (!existing) {
      return sendNotFound(res, 'Disease registry entry not found');
    }

    if (name && name !== existing.name) {
      const nameConflict = await prisma.diseaseRegistry.findUnique({ where: { name } });
      if (nameConflict) {
        return sendError(res, 'A disease registry entry with this name already exists', 409 as any);
      }
    }

    const updated = await prisma.diseaseRegistry.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(symptoms !== undefined && { symptoms }),
        ...(prevention !== undefined && { prevention }),
        ...(treatment !== undefined && { treatment }),
        ...(is_active !== undefined && { is_active }),
      },
    });

    return sendSuccess(res, updated, 'Disease registry entry updated successfully');
  })
);

// DELETE /api/diseases/registry/:id
router.delete(
  '/registry/:id',
  authenticate,
  adminOnly,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const existing = await prisma.diseaseRegistry.findUnique({ where: { id } });
    if (!existing) {
      return sendNotFound(res, 'Disease registry entry not found');
    }

    const updated = await prisma.diseaseRegistry.update({
      where: { id },
      data: { is_active: false },
    });

    return sendSuccess(res, updated, 'Disease registry entry deactivated successfully');
  })
);

// GET /api/diseases/cases
router.get(
  '/cases',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const { status, severity, farm_id } = req.query;

    const where: Record<string, any> = {};

    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (farm_id) where.farm_id = farm_id;

    const [cases, total] = await Promise.all([
      prisma.diseaseCase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { detected_date: 'desc' },
        include: { farm: true },
      }),
      prisma.diseaseCase.count({ where }),
    ]);

    return sendPaginatedResponse(res, cases, total, page, limit, 'Disease cases retrieved successfully');
  })
);

// POST /api/diseases/cases
router.post(
  '/cases',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      disease_name,
      farm_id,
      severity,
      affected_trees,
      symptoms,
      treatment,
      notes,
      outbreak_id,
    } = req.body;

    if (!disease_name || !farm_id) {
      return sendError(res, 'disease_name and farm_id are required', 400 as any);
    }

    const farm = await prisma.farm.findUnique({ where: { id: farm_id } });
    if (!farm) {
      return sendNotFound(res, 'Farm not found');
    }

    const case_number = 'DC-' + Date.now();

    const newCase = await prisma.diseaseCase.create({
      data: {
        case_number,
        disease_name,
        farm_id,
        ...(severity && { severity }),
        ...(affected_trees !== undefined && { affected_trees }),
        ...(symptoms !== undefined && { symptoms }),
        ...(treatment !== undefined && { treatment }),
        ...(notes !== undefined && { notes }),
        ...(outbreak_id !== undefined && { outbreak_id }),
        reported_by: req.user?.id,
      },
      include: { farm: true },
    });

    return sendCreated(res, newCase, 'Disease case created successfully');
  })
);

// GET /api/diseases/cases/:id
router.get(
  '/cases/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const diseaseCase = await prisma.diseaseCase.findUnique({
      where: { id },
      include: {
        farm: true,
        outbreak: true,
      },
    });

    if (!diseaseCase) {
      return sendNotFound(res, 'Disease case not found');
    }

    return sendSuccess(res, diseaseCase, 'Disease case retrieved successfully');
  })
);

// PUT /api/diseases/cases/:id
router.put(
  '/cases/:id',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { status, treatment, resolved_date, notes, severity, affected_trees } = req.body;

    const existing = await prisma.diseaseCase.findUnique({ where: { id } });
    if (!existing) {
      return sendNotFound(res, 'Disease case not found');
    }

    const updated = await prisma.diseaseCase.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(treatment !== undefined && { treatment }),
        ...(resolved_date !== undefined && { resolved_date: new Date(resolved_date) }),
        ...(notes !== undefined && { notes }),
        ...(severity !== undefined && { severity }),
        ...(affected_trees !== undefined && { affected_trees }),
      },
      include: { farm: true },
    });

    return sendSuccess(res, updated, 'Disease case updated successfully');
  })
);

// GET /api/diseases/outbreaks
router.get(
  '/outbreaks',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const { status, province } = req.query;

    const where: Record<string, any> = {};

    if (status) where.status = status;
    if (province) where.province = province;

    const [outbreaks, total] = await Promise.all([
      prisma.diseaseOutbreak.findMany({
        where,
        skip,
        take: limit,
        orderBy: { start_date: 'desc' },
        include: {
          _count: { select: { cases: true } },
        },
      }),
      prisma.diseaseOutbreak.count({ where }),
    ]);

    return sendPaginatedResponse(res, outbreaks, total, page, limit, 'Disease outbreaks retrieved successfully');
  })
);

// POST /api/diseases/outbreaks
router.post(
  '/outbreaks',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { disease_name, severity, province, district, description, response_plan } = req.body;

    if (!disease_name) {
      return sendError(res, 'disease_name is required', 400 as any);
    }

    const outbreak_number = 'OB-' + Date.now();

    const outbreak = await prisma.diseaseOutbreak.create({
      data: {
        outbreak_number,
        disease_name,
        ...(severity && { severity }),
        ...(province !== undefined && { province }),
        ...(district !== undefined && { district }),
        ...(description !== undefined && { description }),
        ...(response_plan !== undefined && { response_plan }),
        reported_by: req.user?.id,
      },
    });

    return sendCreated(res, outbreak, 'Disease outbreak created successfully');
  })
);

// GET /api/diseases/outbreaks/:id
router.get(
  '/outbreaks/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const outbreak = await prisma.diseaseOutbreak.findUnique({
      where: { id },
      include: { cases: true },
    });

    if (!outbreak) {
      return sendNotFound(res, 'Disease outbreak not found');
    }

    return sendSuccess(res, outbreak, 'Disease outbreak retrieved successfully');
  })
);

// PUT /api/diseases/outbreaks/:id
router.put(
  '/outbreaks/:id',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { status, end_date, response_plan, affected_farms, description } = req.body;

    const existing = await prisma.diseaseOutbreak.findUnique({ where: { id } });
    if (!existing) {
      return sendNotFound(res, 'Disease outbreak not found');
    }

    let resolvedEndDate = end_date ? new Date(end_date) : undefined;
    if (status === 'resolved' && !resolvedEndDate) {
      resolvedEndDate = new Date();
    }

    const updated = await prisma.diseaseOutbreak.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(resolvedEndDate !== undefined && { end_date: resolvedEndDate }),
        ...(response_plan !== undefined && { response_plan }),
        ...(affected_farms !== undefined && { affected_farms }),
        ...(description !== undefined && { description }),
      },
      include: { _count: { select: { cases: true } } },
    });

    return sendSuccess(res, updated, 'Disease outbreak updated successfully');
  })
);

// GET /api/diseases/statistics
router.get(
  '/statistics',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const [casesByStatus, casesBySeverity, activeOutbreaksCount, topDiseases] = await Promise.all([
      prisma.diseaseCase.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      prisma.diseaseCase.groupBy({
        by: ['severity'],
        _count: { _all: true },
      }),
      prisma.diseaseOutbreak.count({
        where: { status: 'active' },
      }),
      prisma.diseaseCase.groupBy({
        by: ['disease_name'],
        _count: { _all: true },
        orderBy: { _count: { disease_name: 'desc' } },
        take: 5,
      }),
    ]);

    const stats = {
      cases_by_status: casesByStatus.map((item) => ({
        status: item.status,
        count: item._count._all,
      })),
      cases_by_severity: casesBySeverity.map((item) => ({
        severity: item.severity,
        count: item._count._all,
      })),
      active_outbreaks_count: activeOutbreaksCount,
      top_diseases: topDiseases.map((item) => ({
        disease_name: item.disease_name,
        count: item._count._all,
      })),
    };

    return sendSuccess(res, stats, 'Disease statistics retrieved successfully');
  })
);

export default router;
