import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess, sendError, sendPaginatedResponse, sendNotFound } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { validateIdParam, validatePagination } from '../middleware/validation';
import multer from 'multer';
import crypto from 'crypto';
import { putObject, getPrivateObjectStream, PRIVATE_PREFIX } from '../config/storage';

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, WEBP and PDF attachments are allowed'));
  },
});

// Fields a client may set on a report — anything else in the body is ignored.
const REPORT_EDITABLE = ['title', 'description', 'report_type', 'priority', 'status', 'farmer_id', 'location', 'findings', 'recommendations', 'notes'] as const;

const router = Router();

const reportSelect = {
  id: true, title: true, description: true, report_type: true, status: true, priority: true,
  agent_id: true, farmer_id: true, scheduled_date: true, completed_date: true, location: true,
  attachments: true, findings: true, recommendations: true, notes: true, created_at: true, updated_at: true,
  agent: { select: { full_name: true, email: true } },
};

router.get('/statistics', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const where: any = {};
  if (req.user?.role === 'agent') where.agent_id = req.user.id;

  const [total, byStatus, byType, byPriority] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.groupBy({ by: ['status'], where, _count: true }),
    prisma.report.groupBy({ by: ['report_type'], where, _count: true }),
    prisma.report.groupBy({ by: ['priority'], where, _count: true }),
  ]);

  const statusCounts = byStatus.reduce((acc: any, s) => { acc[s.status] = s._count; return acc; }, {});
  const typeCounts = byType.reduce((acc: any, t) => { acc[t.report_type] = t._count; return acc; }, {});
  const priorityCounts = byPriority.reduce((acc: any, p) => { acc[p.priority] = p._count; return acc; }, {});

  sendSuccess(res, { total, byStatus: statusCounts, byType: typeCounts, byPriority: priorityCounts }, 'Report statistics retrieved successfully');
}));

router.get('/', authenticate, authorize('admin', 'agent'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const where: any = {};

  if (req.user?.role === 'agent') where.agent_id = req.user.id;
  else if (req.query.agent_id) where.agent_id = req.query.agent_id;

  if (req.query.report_type) where.report_type = req.query.report_type;
  if (req.query.status) where.status = req.query.status;
  if (req.query.date_from || req.query.date_to) {
    where.scheduled_date = {};
    if (req.query.date_from) where.scheduled_date.gte = new Date(req.query.date_from as string);
    if (req.query.date_to) where.scheduled_date.lte = new Date(req.query.date_to as string);
  }

  const [reports, total] = await Promise.all([
    prisma.report.findMany({ where, select: reportSelect, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.report.count({ where }),
  ]);
  sendPaginatedResponse(res, reports, total, page, limit, 'Reports retrieved successfully');
}));

// GET /api/reports/export  — must be BEFORE /:id to avoid being swallowed by the id handler
router.get('/export', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const where: any = {};
  if (req.query.report_type) where.report_type = req.query.report_type as any;
  if (req.query.status) where.status = req.query.status as any;
  if (req.query.agent_id) where.agent_id = req.query.agent_id as string;
  // Agents may only export their own reports.
  if (req.user?.role === 'agent') where.agent_id = req.user.id;
  if (req.query.from || req.query.to) {
    where.created_at = {};
    if (req.query.from) where.created_at.gte = new Date(req.query.from as string);
    if (req.query.to) where.created_at.lte = new Date(req.query.to as string);
  }

  const reports = await prisma.report.findMany({
    where,
    include: { agent: { select: { full_name: true, email: true } } },
    orderBy: { created_at: 'desc' },
    take: 1000,
  });

  const format = req.query.format || 'csv';

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=reports.json');
    res.send(JSON.stringify(reports, null, 2));
    return;
  }

  const headers = ['id', 'title', 'report_type', 'status', 'priority', 'agent_name', 'agent_email', 'farmer_id', 'scheduled_date', 'completed_date', 'findings', 'recommendations', 'created_at'];
  const rows = reports.map(r => [
    r.id,
    '"' + (r.title || '').replace(/"/g, '""') + '"',
    r.report_type,
    r.status,
    r.priority,
    '"' + (r.agent?.full_name || '').replace(/"/g, '""') + '"',
    r.agent?.email || '',
    r.farmer_id || '',
    r.scheduled_date?.toISOString() || '',
    r.completed_date?.toISOString() || '',
    '"' + (r.findings || '').replace(/"/g, '""') + '"',
    '"' + (r.recommendations || '').replace(/"/g, '""') + '"',
    r.created_at.toISOString(),
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=reports.csv');
  res.send(csv);
}));

router.get('/:id', authenticate, authorize('admin', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const report = await prisma.report.findUnique({ where: { id: req.params.id }, select: reportSelect });
  if (!report) { sendNotFound(res, 'Report not found'); return; }
  if (req.user?.role === 'agent' && report.agent_id !== req.user.id) { sendError(res, 'Access denied', 403); return; }
  sendSuccess(res, report, 'Report retrieved successfully');
}));

router.post('/', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { title, description, report_type, priority, farmer_id, scheduled_date, location, findings, recommendations, notes } = req.body;
  if (!title || !description || !report_type || !scheduled_date || !location) {
    sendError(res, 'title, description, report_type, scheduled_date, and location are required', 400); return;
  }

  const agent_id = req.user?.role === 'agent' ? req.user.id : req.body.agent_id;
  if (!agent_id) { sendError(res, 'agent_id is required', 400); return; }

  const report = await prisma.report.create({
    data: {
      title, description, report_type, priority: (priority || 'medium') as any,
      agent_id, farmer_id: farmer_id || null,
      scheduled_date: new Date(scheduled_date), location,
      attachments: [], findings: findings || null, recommendations: recommendations || null, notes: notes || null,
    },
    select: reportSelect,
  });
  sendSuccess(res, report, 'Report created successfully', 201);
}));

router.put('/:id', authenticate, authorize('admin', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.report.findUnique({ where: { id: req.params.id }, select: { agent_id: true } });
  if (!existing) { sendNotFound(res, 'Report not found'); return; }
  if (req.user?.role === 'agent' && existing.agent_id !== req.user.id) { sendError(res, 'Access denied', 403); return; }

  const body = req.body || {};
  const data: any = {};
  for (const k of REPORT_EDITABLE) if (body[k] !== undefined) data[k] = body[k];
  if (req.user?.role === 'admin' && body.agent_id) data.agent_id = body.agent_id;
  for (const k of ['scheduled_date', 'completed_date'] as const) {
    if (body[k] === undefined) continue;
    if (body[k] === null) { if (k === 'completed_date') data[k] = null; continue; }
    const d = new Date(body[k]);
    if (Number.isNaN(d.getTime())) { sendError(res, `${k} must be a valid date`, 400); return; }
    data[k] = d;
  }
  if (data.status === 'completed' && data.completed_date === undefined) data.completed_date = new Date();
  if (Object.keys(data).length === 0) { sendError(res, 'Nothing to update', 400); return; }

  const report = await prisma.report.update({ where: { id: req.params.id }, data, select: reportSelect });
  sendSuccess(res, report, 'Report updated successfully');
}));

router.delete('/:id', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const report = await prisma.report.delete({ where: { id: req.params.id } }).catch(() => null);
  if (!report) { sendNotFound(res, 'Report not found'); return; }
  sendSuccess(res, null, 'Report deleted successfully');
}));

router.post('/:id/attachments', authenticate, authorize('admin', 'agent'), validateIdParam, attachmentUpload.array('files', 5), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.report.findUnique({ where: { id: req.params.id }, select: { agent_id: true, attachments: true } });
  if (!existing) { sendNotFound(res, 'Report not found'); return; }
  if (req.user?.role === 'agent' && existing.agent_id !== req.user.id) { sendError(res, 'Access denied', 403); return; }

  const files = (req as any).files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) { sendError(res, 'No files uploaded (field name: "files")', 400); return; }
  if (existing.attachments.length + files.length > 20) { sendError(res, 'A report can have at most 20 attachments', 400); return; }

  // Stored privately; downloaded through GET /:id/attachments/:index after an access check.
  const keys: string[] = [];
  for (const file of files) {
    const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const key = `${PRIVATE_PREFIX}/reports/${req.params.id}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`;
    await putObject(key, file.buffer, file.mimetype);
    keys.push(key);
  }
  const report = await prisma.report.update({
    where: { id: req.params.id },
    data: { attachments: { push: keys } },
    select: reportSelect,
  });
  sendSuccess(res, { attachments: keys, report }, 'Attachments uploaded successfully');
}));

router.get('/:id/attachments/:index', authenticate, authorize('admin', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const report = await prisma.report.findUnique({ where: { id: req.params.id }, select: { agent_id: true, attachments: true } });
  if (!report) { sendNotFound(res, 'Report not found'); return; }
  if (req.user?.role === 'agent' && report.agent_id !== req.user.id) { sendError(res, 'Access denied', 403); return; }
  const key = report.attachments[parseInt(req.params.index, 10)];
  if (!key || !key.startsWith(`${PRIVATE_PREFIX}/`)) { sendNotFound(res, 'Attachment not found'); return; }
  try {
    const { stream, contentType } = await getPrivateObjectStream(key);
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${key.split('/').pop()}"`);
    stream.pipe(res);
  } catch (error: any) {
    if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) { sendNotFound(res, 'Attachment file is missing'); return; }
    throw error;
  }
}));

export default router;
