import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { validateIdParam, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// GET /api/notifications
router.get('/', authenticate, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const userId = req.user!.id;

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { recipient_id: userId },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.notification.count({ where: { recipient_id: userId } }),
    prisma.notification.count({ where: { recipient_id: userId, is_read: false } }),
  ]);

  sendPaginatedResponse(res, notifications, total, page, limit, 'Notifications retrieved', { unreadCount });
}));

// GET /api/notifications/unread-count
router.get('/unread-count', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const count = await prisma.notification.count({
    where: { recipient_id: req.user!.id, is_read: false },
  });

  sendSuccess(res, { count }, 'Unread count retrieved');
}));

// GET /api/notifications/:id
router.get('/:id', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const notification = await prisma.notification.findFirst({
    where: { id: req.params.id, recipient_id: req.user!.id },
  });

  if (!notification) {
    sendNotFound(res, 'Notification not found');
    return;
  }

  sendSuccess(res, notification, 'Notification retrieved');
}));

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const notification = await prisma.notification.updateMany({
    where: { id: req.params.id, recipient_id: req.user!.id },
    data: { is_read: true },
  });

  if (notification.count === 0) {
    sendNotFound(res, 'Notification not found');
    return;
  }

  const updated = await prisma.notification.findUnique({ where: { id: req.params.id } });
  sendSuccess(res, updated, 'Marked as read');
}));

// PUT /api/notifications/read-all
router.put('/read-all', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await prisma.notification.updateMany({
    where: { recipient_id: req.user!.id, is_read: false },
    data: { is_read: true },
  });

  sendSuccess(res, null, 'All notifications marked as read');
}));

// DELETE /api/notifications/:id
router.delete('/:id', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const deleted = await prisma.notification.deleteMany({
    where: { id: req.params.id, recipient_id: req.user!.id },
  });

  if (deleted.count === 0) {
    sendNotFound(res, 'Notification not found');
    return;
  }

  sendSuccess(res, null, 'Notification deleted');
}));

// POST /api/notifications (Admin only)
router.post('/', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { recipient_id, title, message, type } = req.body;

  if (!recipient_id || !title || !message) {
    sendError(res, 'recipient_id, title, and message are required', 400);
    return;
  }

  const notification = await prisma.notification.create({
    data: {
      recipient_id,
      title,
      message,
      type: (type || 'info') as any,
    },
  });

  sendCreated(res, notification, 'Notification created');
}));

export default router;
