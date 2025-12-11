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
router.get('/', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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

/**
 * @route   GET /api/logs/export
 * @desc    Export logs to CSV/Excel format
 * @access  Private (Admin only)
 */
router.get('/export', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { level, start_date, end_date, format = 'csv' } = req.query;

        const query: any = {};
        if (level) query.level = level;
        if (start_date || end_date) {
            query.timestamp = {};
            if (start_date) query.timestamp.$gte = new Date(start_date as string);
            if (end_date) query.timestamp.$lte = new Date(end_date as string);
        }

        const logs = await Log.find(query).sort({ timestamp: -1 });

        if (format === 'csv') {
            const csvHeader = 'Timestamp,Level,Message,Meta\n';
            const csvData = logs.map(log => {
                const meta = log.meta ? JSON.stringify(log.meta).replace(/"/g, '""') : '';
                return `"${log.timestamp}","${log.level}","${log.message.replace(/"/g, '""')}","${meta}"`;
            }).join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="logs_${new Date().toISOString().split('T')[0]}.csv"`);
            return res.send(csvHeader + csvData);
        } else {
            // For Excel format, you would typically use a library like xlsx
            return sendError(res, 'Excel export not implemented yet', 500);
        }
    } catch (error: any) {
        console.error('Export logs error:', error);
        return sendError(res, 'Failed to export logs', 500);
    }
}));

/**
 * @route   DELETE /api/logs/cleanup
 * @desc    Clean up old log entries
 * @access  Private (Admin only)
 */
router.delete('/cleanup', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { older_than_days = 30 } = req.body;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - Number(older_than_days));

        const result = await Log.deleteMany({
            timestamp: { $lt: cutoffDate }
        });

        sendSuccess(res, {
            deleted_count: result.deletedCount
        }, 'Old logs cleaned successfully');
    } catch (error: any) {
        console.error('Cleanup logs error:', error);
        sendError(res, 'Failed to cleanup logs', 500);
    }
}));

/**
 * @route   GET /api/logs/statistics
 * @desc    Get log statistics and counts
 * @access  Private (Admin only)
 */
router.get('/statistics', authenticate, authorize('admin'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const [totalCount, errorCount, warnCount, infoCount, debugCount, todayCount, last7DaysCount] = await Promise.all([
            Log.countDocuments(),
            Log.countDocuments({ level: 'error' }),
            Log.countDocuments({ level: 'warn' }),
            Log.countDocuments({ level: 'info' }),
            Log.countDocuments({ level: 'debug' }),
            Log.countDocuments({ timestamp: { $gte: today } }),
            Log.countDocuments({ timestamp: { $gte: sevenDaysAgo } })
        ]);

        sendSuccess(res, {
            total_count: totalCount,
            error_count: errorCount,
            warn_count: warnCount,
            info_count: infoCount,
            debug_count: debugCount,
            today_count: todayCount,
            last_7_days: last7DaysCount
        }, 'Log statistics retrieved successfully');
    } catch (error: any) {
        console.error('Get log statistics error:', error);
        sendError(res, 'Failed to retrieve log statistics', 500);
    }
}));

export default router;
