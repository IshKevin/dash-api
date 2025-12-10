import { Router, Response } from 'express';
import { Notification } from '../models/Notification';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess, sendError, sendPaginatedResponse, sendNotFound } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

/**
 * @route   GET /api/notifications
 * @desc    Get user notifications
 * @access  Private
 */
router.get('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const query = { recipient_id: req.user?.id };

        const notifications = await Notification.find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Notification.countDocuments(query);
        const unreadCount = await Notification.countDocuments({ ...query, is_read: false });

        sendPaginatedResponse(res, notifications.map(n => (n as any).toPublicJSON()), total, page, limit, 'Notifications retrieved', { unreadCount });
    } catch (error) {
        sendError(res, 'Failed to retrieve notifications', 500);
    }
}));

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread count
 * @access  Private
 */
router.get('/unread-count', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const count = await Notification.countDocuments({
            recipient_id: req.user?.id,
            is_read: false
        });

        sendSuccess(res, { count }, 'Unread count retrieved');
    } catch (error) {
        sendError(res, 'Failed to get unread count', 500);
    }
}));

/**
 * @route   GET /api/notifications/:id
 * @desc    Get notification by ID
 * @access  Private
 */
router.get('/:id', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const notification = await Notification.findOne({
            _id: req.params.id,
            recipient_id: req.user?.id
        });

        if (!notification) {
            sendNotFound(res, 'Notification not found');
            return;
        }

        sendSuccess(res, (notification as any).toPublicJSON(), 'Notification retrieved');
    } catch (error) {
        sendError(res, 'Failed to retrieve notification', 500);
    }
}));

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark as read
 * @access  Private
 */
router.put('/:id/read', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipient_id: req.user?.id },
            { is_read: true },
            { new: true }
        );

        if (!notification) {
            sendNotFound(res, 'Notification not found');
            return;
        }

        sendSuccess(res, (notification as any).toPublicJSON(), 'Marked as read');
    } catch (error) {
        sendError(res, 'Failed to update notification', 500);
    }
}));

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all as read
 * @access  Private
 */
router.put('/read-all', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        await Notification.updateMany(
            { recipient_id: req.user?.id, is_read: false },
            { is_read: true }
        );

        sendSuccess(res, null, 'All notifications marked as read');
    } catch (error) {
        sendError(res, 'Failed to mark all as read', 500);
    }
}));

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete notification
 * @access  Private
 */
router.delete('/:id', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            recipient_id: req.user?.id
        });

        if (!notification) {
            sendNotFound(res, 'Notification not found');
            return;
        }

        sendSuccess(res, null, 'Notification deleted');
    } catch (error) {
        sendError(res, 'Failed to delete notification', 500);
    }
}));

/**
 * @route   POST /api/notifications
 * @desc    Internal endpoint to create notification (For testing/Admin)
 * @access  Private (Admin)
 */
router.post('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Only admin should manually create notifications via API
    if (req.user?.role !== 'admin') {
        sendError(res, 'Access denied', 403);
        return;
    }

    try {
        const { recipient_id, title, message, type } = req.body;

        const notification = await Notification.create({
            recipient_id,
            title,
            message,
            type: type || 'info'
        });

        sendSuccess(res, (notification as any).toPublicJSON(), 'Notification created');
    } catch (error) {
        sendError(res, 'Failed to create notification', 500);
    }
}));

export default router;
