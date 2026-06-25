import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { validateIdParam, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// Test route
router.get('/test', (_req: any, res: Response) => {
  res.json({ success: true, message: 'Agent Information routes are working!' });
});

function formatAgentResponse(user: any, profile: any) {
  return {
    user_info: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      created_at: user.created_at,
      updated_at: user.updated_at,
    },
    agent_profile: profile,
  };
}

// GET /api/agent-information
router.get('/', authenticate, authorize('admin'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const where: any = { role: 'agent' };

  if (req.query.status) where.status = req.query.status as any;
  if (req.query.search) {
    const s = req.query.search as string;
    where.OR = [
      { full_name: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [agents, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { agent_profile: true },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  const data = agents.map(agent => {
    const { password: _password, ...user } = agent as any;
    return formatAgentResponse(user, (agent as any).agent_profile);
  });

  sendPaginatedResponse(res, data, total, page, limit, 'Agents retrieved successfully');
}));

// GET /api/agent-information/me
router.get('/me', authenticate, authorize('agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { agent_profile: true },
  });

  if (!user) {
    sendNotFound(res, 'Agent not found');
    return;
  }

  const { password: _pw1, ...userWithoutPassword } = user as any;
  sendSuccess(res, formatAgentResponse(userWithoutPassword, (user as any).agent_profile), 'Agent profile retrieved');
}));

// GET /api/agent-information/:id
router.get('/:id', authenticate, authorize('admin', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role === 'agent' && req.user.id !== req.params.id) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { agent_profile: true },
  });

  if (!user || user.role !== 'agent') {
    sendNotFound(res, 'Agent not found');
    return;
  }

  const { password: _pw2, ...userWithoutPassword } = user as any;
  sendSuccess(res, formatAgentResponse(userWithoutPassword, (user as any).agent_profile), 'Agent information retrieved');
}));

// POST /api/agent-information (create/upsert agent profile)
router.post('/', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.user?.role === 'admin' ? (req.body.agent_id || req.user.id) : req.user!.id;

  const agent = await prisma.user.findUnique({ where: { id: agentId } });
  if (!agent || agent.role !== 'agent') {
    sendNotFound(res, 'Agent not found');
    return;
  }

  const { territory, statistics, province, district, sector, specialization, experience, certification } = req.body;

  const profile = await prisma.agentProfile.upsert({
    where: { user_id: agentId },
    create: {
      user_id: agentId,
      agentId: agentId,
      territory: territory || [],
      statistics: statistics || {},
      province,
      district,
      sector,
      specialization,
      experience,
      certification,
    },
    update: {
      territory: territory || [],
      statistics: statistics || {},
      province,
      district,
      sector,
      specialization,
      experience,
      certification,
    },
  });

  sendCreated(res, profile, 'Agent profile created/updated successfully');
}));

// PUT /api/agent-information/:id
router.put('/:id', authenticate, authorize('admin', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;

  if (req.user?.role === 'agent' && req.user.id !== agentId) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const { territory, statistics, province, district, sector, specialization, experience, certification } = req.body;

  const profile = await prisma.agentProfile.upsert({
    where: { user_id: agentId },
    create: {
      user_id: agentId,
      agentId: agentId,
      territory: territory || [],
      statistics: statistics || {},
      province,
      district,
      sector,
      specialization,
      experience,
      certification,
    },
    update: {
      territory: territory !== undefined ? territory : undefined,
      statistics: statistics !== undefined ? statistics : undefined,
      province: province !== undefined ? province : undefined,
      district: district !== undefined ? district : undefined,
      sector: sector !== undefined ? sector : undefined,
      specialization: specialization !== undefined ? specialization : undefined,
      experience: experience !== undefined ? experience : undefined,
      certification: certification !== undefined ? certification : undefined,
    },
  });

  sendSuccess(res, profile, 'Agent profile updated successfully');
}));

export default router;
