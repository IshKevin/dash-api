import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import Log from '../models/Log';
import User from '../models/User';

const router = Router();

/**
 * @route   GET /api/monitoring/usage
 * @desc    Get system usage statistics
 * @access  Private (Admin only)
 */
router.get('/usage', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const period = req.query.period || '24h'; // 24h, 7d, 30d
        let dateFilter = new Date();

        if (period === '7d') {
            dateFilter.setDate(dateFilter.getDate() - 7);
        } else if (period === '30d') {
            dateFilter.setDate(dateFilter.getDate() - 30);
        } else {
            dateFilter.setHours(dateFilter.getHours() - 24);
        }

        // Aggregate logs for request volume
        const requestVolume = await Log.aggregate([
            {
                $match: {
                    timestamp: { $gte: dateFilter },
                    message: { $regex: '^Request:' }
                }
            },
            {
                $group: {
                    _id: { $hour: "$timestamp" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        // Active Users (distinct userIds in logs)
        const activeUsers = await Log.distinct('meta.userId', {
            timestamp: { $gte: dateFilter },
            'meta.userId': { $ne: 'anonymous' }
        });

        // Request distribution by Role
        const roleDistribution = await Log.aggregate([
            {
                $match: {
                    timestamp: { $gte: dateFilter },
                    message: { $regex: '^Request:' }
                }
            },
            {
                $group: {
                    _id: "$meta.role",
                    count: { $sum: 1 }
                }
            }
        ]);

        sendSuccess(res, {
            period,
            totalRequests: requestVolume.reduce((acc, curr) => acc + curr.count, 0),
            activeUserCount: activeUsers.length,
            requestVolume,
            roleDistribution
        }, 'Usage stats retrieved');

    } catch (error: any) {
        console.error('Monitoring usage error:', error);
        sendError(res, 'Failed to retrieve usage stats', 500);
    }
}));

/**
 * @route   GET /api/monitoring/activity
 * @desc    Get recent system activity feed
 * @access  Private (Admin only)
 */
router.get('/activity', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;

        const activities = await Log.find({
            message: { $regex: '^Request:' },
            'meta.userId': { $ne: 'anonymous' }
        })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();

        // Enrich with user names if needed, but for now just returning log data
        // We could do a Promise.all to fetch User details if specific info is needed beyond what's logged

        const enrichedActivities = await Promise.all(activities.map(async (log: any) => {
            const user = await User.findById(log.meta.userId).select('full_name email role');
            return {
                ...log,
                user: user ? user.toObject() : null
            };
        }));

        sendSuccess(res, enrichedActivities, 'Activity feed retrieved');

    } catch (error: any) {
        console.error('Monitoring activity error:', error);
        sendError(res, 'Failed to retrieve activity feed', 500);
    }
}));

export default router;
