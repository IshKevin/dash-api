import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import Log from '../models/Log';
import User from '../models/User';
import Product from '../models/Product';
import Order from '../models/Order';
import AccessKey from '../models/AccessKey';
import mongoose from 'mongoose';
import os from 'os';
import { env } from '../config/environment';

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

/**
 * @route   GET /api/monitoring/health
 * @desc    Comprehensive health check
 * @access  Public
 */
router.get('/health', asyncHandler(async (_req: Request, res: Response) => {
    try {
        const healthChecks = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: env.APP_VERSION,
            environment: env.NODE_ENV,
            uptime: Math.floor(process.uptime()),
            checks: {
                database: { status: 'unknown', response_time: 0 },
                memory: { status: 'unknown', usage: 0, percentage: 0 },
                disk: { status: 'unknown', free: 0, total: 0 },
                services: { status: 'unknown', details: {} }
            }
        };

        // Database health check
        const dbStart = Date.now();
        try {
            await mongoose.connection.db.admin().ping();
            const dbTime = Date.now() - dbStart;
            healthChecks.checks.database = {
                status: dbTime < 1000 ? 'healthy' : 'slow',
                response_time: dbTime
            };
        } catch (error) {
            healthChecks.checks.database = {
                status: 'unhealthy',
                response_time: Date.now() - dbStart
            } as any;
            healthChecks.status = 'unhealthy';
        }

        // Memory health check
        const memUsage = process.memoryUsage();
        const memPercentage = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
        healthChecks.checks.memory = {
            status: memPercentage < 80 ? 'healthy' : memPercentage < 90 ? 'warning' : 'critical',
            usage: Math.round(memUsage.heapUsed / 1024 / 1024),
            percentage: memPercentage
        } as any;

        // Disk health check
        try {
            const free = os.freemem();
            const total = os.totalmem();
            const diskPercentage = Math.round(((total - free) / total) * 100);
            
            healthChecks.checks.disk = {
                status: diskPercentage < 80 ? 'healthy' : diskPercentage < 90 ? 'warning' : 'critical',
                free: Math.round(free / 1024 / 1024 / 1024),
                total: Math.round(total / 1024 / 1024 / 1024)
            } as any;
        } catch (error) {
            healthChecks.checks.disk = {
                status: 'unknown'
            } as any;
        }

        // Service health checks
        try {
            const [userCount, productCount, orderCount, accessKeyCount] = await Promise.all([
                User.countDocuments(),
                Product.countDocuments(),
                Order.countDocuments(),
                AccessKey.countDocuments()
            ]);

            healthChecks.checks.services = {
                status: 'healthy',
                details: {
                    users: userCount,
                    products: productCount,
                    orders: orderCount,
                    access_keys: accessKeyCount
                }
            };
        } catch (error) {
            healthChecks.checks.services = {
                status: 'degraded'
            } as any;
        }

        // Overall status determination
        const checkStatuses = Object.values(healthChecks.checks).map(check => check.status);
        if (checkStatuses.includes('unhealthy') || checkStatuses.includes('critical')) {
            healthChecks.status = 'unhealthy';
        } else if (checkStatuses.includes('warning') || checkStatuses.includes('degraded')) {
            healthChecks.status = 'degraded';
        }

        const statusCode = healthChecks.status === 'healthy' ? 200 : 
                          healthChecks.status === 'degraded' ? 200 : 503;

        res.status(statusCode);
        sendSuccess(res, healthChecks, `System is ${healthChecks.status}`);

    } catch (error: any) {
        console.error('Health check error:', error);
        res.status(503);
        sendError(res, 'Health check failed', 503);
    }
}));

/**
 * @route   GET /api/monitoring/metrics
 * @desc    Get detailed system metrics
 * @access  Private (Admin only)
 */
router.get('/metrics', authenticate, authorize('admin'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    try {
        const metrics = {
            timestamp: new Date().toISOString(),
            system: {
                uptime: Math.floor(process.uptime()),
                platform: os.platform(),
                arch: os.arch(),
                node_version: process.version,
                cpu_count: os.cpus().length,
                load_average: os.loadavg(),
                memory: {
                    total: Math.round(os.totalmem() / 1024 / 1024 / 1024),
                    free: Math.round(os.freemem() / 1024 / 1024 / 1024),
                    used: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024),
                    percentage: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)
                }
            },
            process: {
                pid: process.pid,
                memory: {
                    rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
                    heap_total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                    heap_used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    external: Math.round(process.memoryUsage().external / 1024 / 1024)
                },
                cpu_usage: process.cpuUsage()
            },
            database: {
                connection_state: mongoose.connection.readyState,
                collections: await mongoose.connection.db.listCollections().toArray()
            }
        };

        sendSuccess(res, metrics, 'System metrics retrieved');

    } catch (error: any) {
        console.error('Metrics error:', error);
        sendError(res, 'Failed to retrieve metrics', 500);
    }
}));

/**
 * @route   GET /api/monitoring/cleanup
 * @desc    Clean up expired access keys and old logs
 * @access  Private (Admin only)
 */
router.post('/cleanup', authenticate, authorize('admin'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [expiredKeys, oldLogs] = await Promise.all([
            AccessKey.deleteMany({ expires_at: { $lt: new Date() } }),
            Log.deleteMany({ timestamp: { $lt: thirtyDaysAgo } })
        ]);

        sendSuccess(res, {
            expired_access_keys_removed: expiredKeys.deletedCount,
            old_logs_removed: oldLogs.deletedCount,
            cleanup_date: new Date().toISOString()
        }, 'Cleanup completed successfully');

    } catch (error: any) {
        console.error('Cleanup error:', error);
        sendError(res, 'Failed to perform cleanup', 500);
    }
}));

export default router;
