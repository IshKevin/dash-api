import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/responses';
import { env } from '../config/environment';
import User from '../models/User';
import Product from '../models/Product';
import Order from '../models/Order';

const router = Router();

/**
 * @route   GET /api/welcome
 * @desc    Welcome endpoint with system overview
 * @access  Public
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
    try {
        // Get basic system stats
        const [userCount, productCount, orderCount] = await Promise.all([
            User.countDocuments({ status: 'active' }),
            Product.countDocuments({ status: 'active' }),
            Order.countDocuments()
        ]);

        const stats = {
            users: userCount,
            products: productCount,
            orders: orderCount,
            uptime: Math.floor(process.uptime()),
            version: env.APP_VERSION,
            environment: env.NODE_ENV
        };

        sendSuccess(res, {
            message: 'Welcome to Dashboard Avocado Agricultural Management System',
            description: 'A comprehensive backend API for managing agricultural operations, farmer profiles, product inventory, and order processing.',
            stats,
            endpoints: {
                auth: '/api/auth',
                users: '/api/users',
                products: '/api/products',
                orders: '/api/orders',
                shops: '/api/shops',
                analytics: '/api/analytics',
                profile_access: '/api/profile-access',
                health: '/health',
                documentation: '/api-docs'
            },
            features: [
                'User Authentication & Authorization',
                'Farmer & Agent Profile Management',
                'Product Inventory Management',
                'Order Processing System',
                'QR Code Profile Access',
                'Bulk User Import',
                'Real-time Analytics',
                'File Upload & Storage',
                'Notification System',
                'Comprehensive Logging'
            ]
        }, 'Welcome to Dashboard Avocado Backend API');

    } catch (error: any) {
        console.error('Welcome endpoint error:', error);
        sendSuccess(res, {
            message: 'Welcome to Dashboard Avocado Agricultural Management System',
            version: env.APP_VERSION,
            status: 'operational'
        }, 'Welcome to Dashboard Avocado Backend API');
    }
}));

/**
 * @route   GET /api/welcome/stats
 * @desc    Get detailed system statistics
 * @access  Public
 */
router.get('/stats', asyncHandler(async (_req: Request, res: Response) => {
    try {
        const [
            totalUsers,
            activeUsers,
            farmerCount,
            agentCount,
            adminCount,
            totalProducts,
            activeProducts,
            totalOrders,
            pendingOrders,
            completedOrders
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ status: 'active' }),
            User.countDocuments({ role: 'farmer', status: 'active' }),
            User.countDocuments({ role: 'agent', status: 'active' }),
            User.countDocuments({ role: 'admin', status: 'active' }),
            Product.countDocuments(),
            Product.countDocuments({ status: 'active' }),
            Order.countDocuments(),
            Order.countDocuments({ status: 'pending' }),
            Order.countDocuments({ status: 'completed' })
        ]);

        const stats = {
            users: {
                total: totalUsers,
                active: activeUsers,
                farmers: farmerCount,
                agents: agentCount,
                admins: adminCount
            },
            products: {
                total: totalProducts,
                active: activeProducts
            },
            orders: {
                total: totalOrders,
                pending: pendingOrders,
                completed: completedOrders
            },
            system: {
                uptime: Math.floor(process.uptime()),
                memory: {
                    used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                    percentage: Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100)
                },
                version: env.APP_VERSION,
                environment: env.NODE_ENV,
                node_version: process.version
            }
        };

        sendSuccess(res, stats, 'System statistics retrieved successfully');

    } catch (error: any) {
        console.error('Stats endpoint error:', error);
        sendSuccess(res, {
            error: 'Unable to fetch detailed statistics',
            basic_stats: {
                uptime: Math.floor(process.uptime()),
                version: env.APP_VERSION,
                environment: env.NODE_ENV
            }
        }, 'Partial system statistics');
    }
}));

export default router;