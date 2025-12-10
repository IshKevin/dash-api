import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import Log from '../models/Log';

const router = Router();

/**
 * @route   GET /api/logs
 * @desc    Get system logs
 * @access  Private (Admin only)
 */
router.get('/', authenticate, authorize('admin', 'admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { level, limit = 100, page = 1 } = req.query;

        const query: any = {};
        if (level) {
            query.level = level;
        }

        const logs = await Log.find(query)
            .sort({ timestamp: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        const total = await Log.countDocuments(query);

        sendSuccess(res, {
            logs,
            pagination: {
                total,
                page: Number(page),
                pages: Math.ceil(total / Number(limit))
            }
        }, 'Logs retrieved successfully');
    } catch (error: any) {
        console.error('Get logs error:', error);
        sendError(res, 'Failed to retrieve logs', 500);
    }
}));

export default router;
