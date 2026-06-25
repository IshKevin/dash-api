import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

router.get('/statistics', authenticate, authorize('admin'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [totalCount, errorCount, warnCount, infoCount, debugCount, todayCount, last7DaysCount] = await Promise.all([
    prisma.log.count(),
    prisma.log.count({ where: { level: 'error' } }),
    prisma.log.count({ where: { level: 'warn' } }),
    prisma.log.count({ where: { level: 'info' } }),
    prisma.log.count({ where: { level: 'debug' } }),
    prisma.log.count({ where: { timestamp: { gte: today } } }),
    prisma.log.count({ where: { timestamp: { gte: sevenDaysAgo } } }),
  ]);

  sendSuccess(res, {
    total_count: totalCount,
    error_count: errorCount,
    warn_count: warnCount,
    info_count: infoCount,
    debug_count: debugCount,
    today_count: todayCount,
    last_7_days: last7DaysCount,
  }, 'Log statistics retrieved successfully');
}));

router.get('/export', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { level, start_date, end_date } = req.query;
  const where: any = {};
  if (level) where.level = level;
  if (start_date || end_date) {
    where.timestamp = {};
    if (start_date) where.timestamp.gte = new Date(start_date as string);
    if (end_date) where.timestamp.lte = new Date(end_date as string);
  }

  const logs = await prisma.log.findMany({ where, orderBy: { timestamp: 'desc' } });
  const csvHeader = 'Timestamp,Level,Message,Meta\n';
  const csvData = logs.map(log => {
    const meta = log.meta ? JSON.stringify(log.meta).replace(/"/g, '""') : '';
    return `"${log.timestamp}","${log.level}","${log.message.replace(/"/g, '""')}","${meta}"`;
  }).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="logs_${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csvHeader + csvData);
}));

router.delete('/cleanup', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const older_than_days = parseInt(req.body.older_than_days || '30');
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - older_than_days);

  const result = await prisma.log.deleteMany({ where: { timestamp: { lt: cutoffDate } } });
  sendSuccess(res, { deleted_count: result.count }, 'Old logs cleaned successfully');
}));

router.get('/', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const page = parseInt(req.query.page as string) || 1;
  const where: any = {};
  if (req.query.level) where.level = req.query.level;

  const [logs, total] = await Promise.all([
    prisma.log.findMany({ where, orderBy: { timestamp: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.log.count({ where }),
  ]);

  sendSuccess(res, {
    logs,
    pagination: { total, page, pages: Math.ceil(total / limit) },
  }, 'Logs retrieved successfully');
}));

export default router;
