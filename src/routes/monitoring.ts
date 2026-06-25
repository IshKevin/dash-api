import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import os from 'os';
import { env } from '../config/environment';

const router = Router();

// GET /api/monitoring/health
router.get('/health', asyncHandler(async (_req: any, res: Response) => {
  let dbStatus = 'healthy';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'unhealthy';
  }

  const mem = process.memoryUsage();
  sendSuccess(res, {
    status: dbStatus === 'healthy' ? 'healthy' : 'degraded',
    database: { status: dbStatus, type: 'postgresql' },
    memory: {
      used: Math.round(mem.heapUsed / 1024 / 1024),
      total: Math.round(mem.heapTotal / 1024 / 1024),
    },
    uptime: Math.floor(process.uptime()),
  }, 'Health check');
}));

// GET /api/monitoring/usage
router.get('/usage', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const period = (req.query.period as string) || '24h';
  let hoursAgo = 24;
  if (period === '7d') hoursAgo = 168;
  else if (period === '30d') hoursAgo = 720;

  const dateFilter = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

  const [recentLogs, totalRequests] = await Promise.all([
    prisma.log.findMany({
      where: { timestamp: { gte: dateFilter } },
      select: { level: true, timestamp: true },
      orderBy: { timestamp: 'desc' },
    }),
    prisma.log.count({ where: { timestamp: { gte: dateFilter } } }),
  ]);

  const byLevel: Record<string, number> = {};
  recentLogs.forEach(log => {
    byLevel[log.level] = (byLevel[log.level] || 0) + 1;
  });

  sendSuccess(res, {
    period,
    totalRequests,
    byLevel,
    dateFilter: dateFilter.toISOString(),
  }, 'Usage stats retrieved');
}));

// GET /api/monitoring/system
router.get('/system', authenticate, authorize('admin'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const mem = process.memoryUsage();
  const cpus = os.cpus();

  sendSuccess(res, {
    platform: os.platform(),
    arch: os.arch(),
    node_version: process.version,
    uptime: Math.floor(process.uptime()),
    memory: {
      heap_used: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total: Math.round(mem.heapTotal / 1024 / 1024),
      rss: Math.round(mem.rss / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
    },
    cpu: {
      count: cpus.length,
      model: cpus[0]?.model || 'unknown',
    },
    os_memory: {
      total: Math.round(os.totalmem() / 1024 / 1024),
      free: Math.round(os.freemem() / 1024 / 1024),
    },
    env: env.NODE_ENV,
  }, 'System info retrieved');
}));

// GET /api/monitoring/database
router.get('/database', authenticate, authorize('admin'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const startTime = Date.now();

  const [userCount, productCount, orderCount, logCount] = await Promise.all([
    prisma.user.count(),
    prisma.product.count(),
    prisma.order.count(),
    prisma.log.count(),
  ]);

  const queryTime = Date.now() - startTime;

  sendSuccess(res, {
    status: 'connected',
    type: 'postgresql',
    query_time_ms: queryTime,
    table_counts: {
      users: userCount,
      products: productCount,
      orders: orderCount,
      logs: logCount,
    },
  }, 'Database stats retrieved');
}));

export default router;
