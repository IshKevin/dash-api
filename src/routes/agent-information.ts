import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { validateIdParam, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { createNotification } from '../utils/notificationService';
import { farmerScope, getTerritory, normalizeArea, TerritoryArea } from '../utils/agentScope';

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

  const { statistics, province, district, sector, cell, village, specialization, experience, certification } = req.body;

  const profile = await prisma.agentProfile.upsert({
    where: { user_id: agentId },
    create: {
      user_id: agentId,
      agentId: agentId,
      territory: [],
      statistics: statistics || {},
      province,
      district,
      sector,
      cell,
      village,
      specialization,
      experience,
      certification,
    },
    update: {
      statistics: statistics !== undefined ? statistics : undefined,
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

// PUT /api/agent-information/me
router.put('/me', authenticate, authorize('agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { statistics, province, district, sector, cell, village, specialization, experience, certification } = req.body;
  const agentId = req.user!.id;

  const profile = await prisma.agentProfile.upsert({
    where: { user_id: agentId },
    create: {
      user_id: agentId,
      agentId: agentId,
      territory: [],
      statistics: statistics || {},
      province,
      district,
      sector,
      specialization,
      experience,
      certification,
    },
    update: {
      statistics: statistics !== undefined ? statistics : undefined,
      province: province !== undefined ? province : undefined,
      district: district !== undefined ? district : undefined,
      sector: sector !== undefined ? sector : undefined,
      cell: cell !== undefined ? cell : undefined,
      village: village !== undefined ? village : undefined,
      specialization: specialization !== undefined ? specialization : undefined,
      experience: experience !== undefined ? experience : undefined,
      certification: certification !== undefined ? certification : undefined,
    },
  });

  sendSuccess(res, profile, 'Agent profile updated successfully');
}));

// PUT /api/agent-information/:id
router.put('/:id', authenticate, authorize('admin', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;

  if (req.user?.role === 'agent' && req.user.id !== agentId) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const { statistics, province, district, sector, cell, village, specialization, experience, certification } = req.body;

  const profile = await prisma.agentProfile.upsert({
    where: { user_id: agentId },
    create: {
      user_id: agentId,
      agentId: agentId,
      territory: [],
      statistics: statistics || {},
      province,
      district,
      sector,
      cell,
      village,
      specialization,
      experience,
      certification,
    },
    update: {
      statistics: statistics !== undefined ? statistics : undefined,
      province: province !== undefined ? province : undefined,
      district: district !== undefined ? district : undefined,
      sector: sector !== undefined ? sector : undefined,
      cell: cell !== undefined ? cell : undefined,
      village: village !== undefined ? village : undefined,
      specialization: specialization !== undefined ? specialization : undefined,
      experience: experience !== undefined ? experience : undefined,
      certification: certification !== undefined ? certification : undefined,
    },
  });

  sendSuccess(res, profile, 'Agent profile updated successfully');
}));

// Territory = the area(s) an admin assigns to a VBA. A VBA only serves farmers there.
// It is never changed through the general profile updates above.

// GET /api/agent-information/:id/territory — the areas a VBA serves and how many farmers that covers
router.get('/:id/territory', authenticate, authorize('admin', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (req.user!.role === 'agent' && req.user!.id !== req.params.id) { sendError(res, 'Access denied', 403); return; }
  const agent = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true } });
  if (!agent || agent.role !== 'agent') { sendNotFound(res, 'Agent not found'); return; }
  const territory = await getTerritory(req.params.id);
  sendSuccess(res, { territory, farmers_covered: await countCovered(req.params.id, territory.length) }, 'Territory retrieved');
}));

// PUT /api/agent-information/:id/territory — admin assigns the areas a VBA serves.
// Body: { territory: [{ province?, district?, sector?, cell?, village? }, …] } (empty array = no area)
router.put('/:id/territory', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agent = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true } });
  if (!agent || agent.role !== 'agent') { sendNotFound(res, 'Agent not found'); return; }
  const raw = req.body?.territory;
  if (!Array.isArray(raw)) { sendError(res, 'territory must be an array of areas', 400); return; }
  if (raw.length > 50) { sendError(res, 'At most 50 areas per agent', 400); return; }
  const areas: TerritoryArea[] = [];
  for (const [i, a] of raw.entries()) {
    const [area, err] = normalizeArea(a);
    if (err) { sendError(res, `Area ${i + 1}: ${err}`, 400); return; }
    if (!areas.some((x) => JSON.stringify(x) === JSON.stringify(area))) areas.push(area!);
  }
  // Keep the profile's home district in step with the first area, for display.
  const first = areas[0];
  const home = first ? { province: first.province ?? null, district: first.district ?? null, sector: first.sector ?? null } : {};
  await prisma.agentProfile.upsert({
    where: { user_id: agent.id },
    create: { user_id: agent.id, agentId: agent.id, territory: areas as any, ...home },
    update: { territory: areas as any, ...home },
  });
  const farmers = await countCovered(agent.id, areas.length);
  await createNotification(
    agent.id, 'info', 'Your area was updated',
    areas.length
      ? `You now serve ${farmers} farmer${farmers === 1 ? '' : 's'} in ${areas.map(describeArea).join('; ')}.`
      : 'You have no area assigned at the moment, so no farmers are shown to you.',
    undefined, 'system'
  );
  sendSuccess(res, { territory: areas, farmers_covered: farmers }, 'Territory updated');
}));

async function countCovered(agentId: string, areaCount: number): Promise<number> {
  if (!areaCount) return 0;
  const scope = await farmerScope({ user: { id: agentId, role: 'agent' } } as AuthenticatedRequest);
  return prisma.user.count({ where: { AND: [{ role: 'farmer' }, scope!] } });
}

const describeArea = (a: TerritoryArea) =>
  [a.village, a.cell, a.sector && `${a.sector} sector`, a.district, a.district ? undefined : a.province].filter(Boolean).join(', ');

// PUT /api/agent-information/:id/performance
router.put('/:id/performance', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { farmersAssisted, totalTransactions, performance, statistics } = req.body;

  const agent = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!agent || agent.role !== 'agent') {
    sendNotFound(res, 'Agent not found');
    return;
  }

  const profile = await prisma.agentProfile.upsert({
    where: { user_id: req.params.id },
    create: {
      user_id: req.params.id,
      agentId: req.params.id,
      farmersAssisted: farmersAssisted ?? 0,
      totalTransactions: totalTransactions ?? 0,
      performance,
      statistics: statistics || {},
    },
    update: {
      farmersAssisted: farmersAssisted !== undefined ? farmersAssisted : undefined,
      totalTransactions: totalTransactions !== undefined ? totalTransactions : undefined,
      performance: performance !== undefined ? performance : undefined,
      statistics: statistics !== undefined ? statistics : undefined,
    },
  });

  sendSuccess(res, profile, 'Agent performance updated successfully');
}));

export default router;
