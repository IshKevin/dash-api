import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError, sendCreated, sendPaginatedResponse, sendNotFound } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// GET /api/trees/farm/:farmId — list tree records for a farm (paginated)
router.get(
  '/farm/:farmId',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { farmId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const farm = await prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) {
      return sendNotFound(res, 'Farm not found');
    }

    const [records, total] = await Promise.all([
      prisma.treeRecord.findMany({
        where: { farm_id: farmId },
        orderBy: { record_date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.treeRecord.count({ where: { farm_id: farmId } }),
    ]);

    return sendPaginatedResponse(res, records, total, page, limit, 'Tree records retrieved successfully');
  })
);

// POST /api/trees/farm/:farmId — create a tree record for a farm
router.post(
  '/farm/:farmId',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { farmId } = req.params;
    const {
      total_trees,
      age_0_2,
      age_3_5,
      age_6_10,
      age_above_10,
      healthy_count,
      diseased_count,
      dead_count,
      notes,
      record_date,
    } = req.body;

    const farm = await prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) {
      return sendNotFound(res, 'Farm not found');
    }

    const [treeRecord] = await Promise.all([
      prisma.treeRecord.create({
        data: {
          farm_id: farmId,
          total_trees: total_trees ?? 0,
          age_0_2: age_0_2 ?? 0,
          age_3_5: age_3_5 ?? 0,
          age_6_10: age_6_10 ?? 0,
          age_above_10: age_above_10 ?? 0,
          healthy_count: healthy_count ?? 0,
          diseased_count: diseased_count ?? 0,
          dead_count: dead_count ?? 0,
          notes: notes ?? null,
          record_date: record_date ? new Date(record_date) : undefined,
          recorded_by: req.user?.id ?? null,
        },
      }),
      prisma.farm.update({
        where: { id: farmId },
        data: { tree_count: total_trees ?? 0 },
      }),
    ]);

    return sendCreated(res, treeRecord, 'Tree record created successfully');
  })
);

// GET /api/trees/farm/:farmId/diseases — list tree diseases for a farm
router.get(
  '/farm/:farmId/diseases',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { farmId } = req.params;

    const farm = await prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) {
      return sendNotFound(res, 'Farm not found');
    }
    if (req.user?.role === 'farmer' && farm.farmer_id !== req.user.id) {
      return sendError(res, 'Access denied: this farm does not belong to you', 403);
    }

    const diseases = await prisma.treeDisease.findMany({
      where: { farm_id: farmId },
      orderBy: { detected_date: 'desc' },
    });

    return sendSuccess(res, diseases, 'Tree diseases retrieved successfully');
  })
);

// POST /api/trees/farm/:farmId/diseases — report a tree disease for a farm
router.post(
  '/farm/:farmId/diseases',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { farmId } = req.params;
    const {
      disease_name,
      affected_count,
      severity,
      treatment_notes,
      notes,
      detected_date,
    } = req.body;

    const farm = await prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) {
      return sendNotFound(res, 'Farm not found');
    }

    const disease = await prisma.treeDisease.create({
      data: {
        farm_id: farmId,
        disease_name,
        affected_count: affected_count ?? 0,
        severity: severity ?? 'low',
        treatment_notes: treatment_notes ?? null,
        notes: notes ?? null,
        detected_date: detected_date ? new Date(detected_date) : undefined,
        reported_by: req.user?.id ?? null,
      },
    });

    return sendCreated(res, disease, 'Tree disease reported successfully');
  })
);

// PUT /api/trees/diseases/:id — update a tree disease record
router.put(
  '/diseases/:id',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { treated, treatment_notes, notes, severity, affected_count } = req.body;

    const existing = await prisma.treeDisease.findUnique({ where: { id } });
    if (!existing) {
      return sendNotFound(res, 'Tree disease record not found');
    }

    const updated = await prisma.treeDisease.update({
      where: { id },
      data: {
        ...(treated !== undefined && { treated }),
        ...(treatment_notes !== undefined && { treatment_notes }),
        ...(notes !== undefined && { notes }),
        ...(severity !== undefined && { severity }),
        ...(affected_count !== undefined && { affected_count }),
      },
    });

    return sendSuccess(res, updated, 'Tree disease record updated successfully');
  })
);

// GET /api/trees/farm/:farmId/summary — get tree summary for a farm
router.get(
  '/farm/:farmId/summary',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { farmId } = req.params;

    const farm = await prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) {
      return sendNotFound(res, 'Farm not found');
    }
    if (req.user?.role === 'farmer' && farm.farmer_id !== req.user.id) {
      return sendError(res, 'Access denied: this farm does not belong to you', 403);
    }

    const [latest_record, untreated_diseases_count, all_diseases] = await Promise.all([
      prisma.treeRecord.findFirst({
        where: { farm_id: farmId },
        orderBy: { record_date: 'desc' },
      }),
      prisma.treeDisease.count({
        where: { farm_id: farmId, treated: false },
      }),
      prisma.treeDisease.findMany({
        where: { farm_id: farmId },
        select: { disease_name: true },
        distinct: ['disease_name'],
      }),
    ]);

    const all_disease_names = all_diseases.map((d) => d.disease_name);

    return sendSuccess(
      res,
      { latest_record, untreated_diseases_count, all_disease_names },
      'Tree summary retrieved successfully'
    );
  })
);

export default router;
