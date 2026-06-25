import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, adminOnly } from '../middleware/auth';
import { sendSuccess, sendCreated, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// GET /api/settings/initialize  (adminOnly) — must be before /:key to avoid route shadowing
router.get('/initialize', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.systemSetting.count();

  if (existing > 0) {
    sendSuccess(res, { created: 0, message: 'Default settings already exist' }, 'Settings already initialized');
    return;
  }

  const defaults = [
    { key: 'service_types', value: 'harvest,pest_control,consultation,maintenance,planting', category: 'services', description: 'Available service types' },
    { key: 'max_trees_per_farm', value: '10000', data_type: 'number', category: 'farms', description: 'Maximum trees allowed per farm' },
    { key: 'low_stock_threshold', value: '10', data_type: 'number', category: 'inventory', description: 'Stock quantity to trigger low-stock alert' },
    { key: 'notification_email', value: '', category: 'notifications', description: 'Admin email for system notifications' },
    { key: 'harvest_forecast_confidence_min', value: '60', data_type: 'number', category: 'forecasting', description: 'Minimum confidence % for forecasts' },
  ];

  await prisma.systemSetting.createMany({ data: defaults });

  sendCreated(res, { created: defaults.length, message: `${defaults.length} default settings created` }, 'Settings initialized successfully');
}));

// GET /api/settings
router.get('/', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const where: any = {};
  if (req.query.category) {
    where.category = req.query.category as string;
  }

  const settings = await prisma.systemSetting.findMany({
    where,
    orderBy: [{ category: 'asc' }, { key: 'asc' }],
  });

  sendSuccess(res, settings, 'Settings retrieved successfully');
}));

// GET /api/settings/:key
router.get('/:key', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: req.params.key },
  });

  if (!setting) {
    sendNotFound(res, `Setting '${req.params.key}' not found`);
    return;
  }

  sendSuccess(res, setting, 'Setting retrieved successfully');
}));

// POST /api/settings
router.post('/', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { key, value, description, category, data_type, is_editable } = req.body;

  const existing = await prisma.systemSetting.findUnique({ where: { key } });
  if (existing) {
    sendError(res, `Setting with key '${key}' already exists`, 409);
    return;
  }

  const setting = await prisma.systemSetting.create({
    data: {
      key,
      value,
      description,
      category,
      data_type: data_type ?? 'string',
      is_editable: is_editable !== undefined ? is_editable : true,
      updated_by: req.user!.id,
    },
  });

  sendCreated(res, setting, 'Setting created successfully');
}));

// PUT /api/settings/:key
router.put('/:key', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { value, description } = req.body;

  const setting = await prisma.systemSetting.findUnique({
    where: { key: req.params.key },
  });

  if (!setting) {
    sendNotFound(res, `Setting '${req.params.key}' not found`);
    return;
  }

  if (!setting.is_editable) {
    sendError(res, 'This setting is read-only', 400);
    return;
  }

  const updated = await prisma.systemSetting.update({
    where: { key: req.params.key },
    data: {
      value,
      ...(description !== undefined && { description }),
      updated_by: req.user!.id,
    },
  });

  sendSuccess(res, updated, 'Setting updated successfully');
}));

// DELETE /api/settings/:key
router.delete('/:key', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: req.params.key },
  });

  if (!setting) {
    sendNotFound(res, `Setting '${req.params.key}' not found`);
    return;
  }

  await prisma.systemSetting.delete({ where: { key: req.params.key } });

  sendSuccess(res, null, 'Setting deleted successfully');
}));

export default router;
