import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// GET /api/visits
router.get('/', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const where: any = {};

  if (req.query.status) where.status = req.query.status as any;
  if (req.query.agent_id) where.agent_id = req.query.agent_id as string;
  if (req.query.farm_id) where.farm_id = req.query.farm_id as string;

  // Agents can only see their own visits
  if (req.user && req.user.role !== 'admin') {
    where.agent_id = req.user.id;
  }

  const [visits, total] = await Promise.all([
    prisma.farmVisit.findMany({
      where,
      skip,
      take: limit,
      orderBy: { scheduled_at: 'desc' },
      include: {
        farm: { select: { farmName: true, farmer_id: true } },
        agent: { select: { full_name: true, email: true } },
      },
    }),
    prisma.farmVisit.count({ where }),
  ]);

  return sendPaginatedResponse(res, visits, total, page, limit, 'Visits retrieved successfully');
}));

// POST /api/visits
router.post('/', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { farm_id, agent_id, scheduled_at, purpose } = req.body;

  const farm = await prisma.farm.findUnique({ where: { id: farm_id } });
  if (!farm) {
    return sendNotFound(res, 'Farm not found');
  }

  const agentUser = await prisma.user.findUnique({ where: { id: agent_id } });
  if (!agentUser || agentUser.role !== 'agent') {
    return sendError(res, 'Agent not found or user is not an agent', 400 as any);
  }

  const visit_number = 'VISIT-' + Date.now();

  const visit = await prisma.farmVisit.create({
    data: {
      visit_number,
      farm_id,
      agent_id,
      scheduled_at: new Date(scheduled_at),
      purpose: purpose || null,
      status: 'scheduled',
    },
    include: {
      farm: { select: { farmName: true, farmer_id: true } },
      agent: { select: { full_name: true, email: true } },
    },
  });

  return sendCreated(res, visit, 'Visit created successfully');
}));

// GET /api/visits/farm/:farmId  — must be before /:id to avoid conflict
router.get('/farm/:farmId', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { farmId } = req.params;

  const visits = await prisma.farmVisit.findMany({
    where: { farm_id: farmId },
    orderBy: { scheduled_at: 'desc' },
    include: {
      agent: { select: { full_name: true } },
    },
  });

  return sendSuccess(res, visits, 'Farm visits retrieved successfully');
}));

// GET /api/visits/:id
router.get('/:id', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const visit = await prisma.farmVisit.findUnique({
    where: { id },
    include: {
      farm: { select: { farmName: true, farmer_id: true } },
      agent: { select: { full_name: true, email: true } },
    },
  });

  if (!visit) {
    return sendNotFound(res, 'Visit not found');
  }

  if (req.user?.role === 'agent' && visit.agent_id !== req.user.id) {
    return sendError(res, 'Access denied: this visit is not assigned to you', 403);
  }

  return sendSuccess(res, visit, 'Visit retrieved successfully');
}));

// PUT /api/visits/:id
router.put('/:id', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { scheduled_at, purpose, findings, recommendations } = req.body;

  const existing = await prisma.farmVisit.findUnique({ where: { id } });
  if (!existing) {
    return sendNotFound(res, 'Visit not found');
  }

  // Agents can only update their own assigned visits
  if (req.user && req.user.role !== 'admin' && existing.agent_id !== req.user.id) {
    return sendError(res, 'Forbidden: you are not the assigned agent for this visit', 403 as any);
  }

  const updateData: any = {};
  if (scheduled_at !== undefined) updateData.scheduled_at = new Date(scheduled_at);
  if (purpose !== undefined) updateData.purpose = purpose;
  if (findings !== undefined) updateData.findings = findings;
  if (recommendations !== undefined) updateData.recommendations = recommendations;

  const visit = await prisma.farmVisit.update({
    where: { id },
    data: updateData,
    include: {
      farm: { select: { farmName: true, farmer_id: true } },
      agent: { select: { full_name: true, email: true } },
    },
  });

  return sendSuccess(res, visit, 'Visit updated successfully');
}));

// PUT /api/visits/:id/complete
router.put('/:id/complete', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { findings, recommendations } = req.body;

  const existing = await prisma.farmVisit.findUnique({ where: { id } });
  if (!existing) {
    return sendNotFound(res, 'Visit not found');
  }

  if (existing.status !== 'scheduled' && existing.status !== 'in_progress') {
    return sendError(res, 'Visit must be scheduled or in progress to complete', 400 as any);
  }

  const visit = await prisma.farmVisit.update({
    where: { id },
    data: {
      status: 'completed',
      completed_at: new Date(),
      findings: findings ?? existing.findings,
      recommendations: recommendations ?? existing.recommendations,
    },
    include: {
      farm: { select: { farmName: true, farmer_id: true } },
      agent: { select: { full_name: true, email: true } },
    },
  });

  return sendSuccess(res, visit, 'Visit marked as completed');
}));

// PUT /api/visits/:id/start
router.put('/:id/start', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const existing = await prisma.farmVisit.findUnique({ where: { id } });
  if (!existing) {
    return sendNotFound(res, 'Visit not found');
  }

  const visit = await prisma.farmVisit.update({
    where: { id },
    data: { status: 'in_progress' },
    include: {
      farm: { select: { farmName: true, farmer_id: true } },
      agent: { select: { full_name: true, email: true } },
    },
  });

  return sendSuccess(res, visit, 'Visit started');
}));

// PUT /api/visits/:id/cancel
router.put('/:id/cancel', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const existing = await prisma.farmVisit.findUnique({ where: { id } });
  if (!existing) {
    return sendNotFound(res, 'Visit not found');
  }

  if (existing.status === 'completed') {
    return sendError(res, 'Cannot cancel a completed visit', 400 as any);
  }

  const visit = await prisma.farmVisit.update({
    where: { id },
    data: { status: 'cancelled' },
    include: {
      farm: { select: { farmName: true, farmer_id: true } },
      agent: { select: { full_name: true, email: true } },
    },
  });

  return sendSuccess(res, visit, 'Visit cancelled');
}));

export default router;
