import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/responses';
import { env } from '../config/environment';

const router = Router();

// GET /api/welcome
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const [userCount, productCount, orderCount] = await Promise.all([
    prisma.user.count({ where: { status: 'active' } }),
    prisma.product.count({ where: { status: 'available' } }),
    prisma.order.count(),
  ]).catch(() => [0, 0, 0]);

  sendSuccess(res, {
    message: 'Welcome to Dashboard Avocado Agricultural Management System',
    description: 'A comprehensive backend API for managing agricultural operations, farmer profiles, product inventory, and order processing.',
    stats: {
      users: userCount,
      products: productCount,
      orders: orderCount,
      uptime: Math.floor(process.uptime()),
      version: env.APP_VERSION || '1.0.0',
      environment: env.NODE_ENV,
    },
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      products: '/api/products',
      orders: '/api/orders',
      shops: '/api/shops',
      analytics: '/api/analytics',
      profile_access: '/api/profile-access',
      health: '/health',
    },
    features: [
      'User Authentication & Authorization',
      'Farmer & Agent Profile Management',
      'Product Inventory Management',
      'Order Processing System',
      'QR Code Profile Access',
      'Bulk User Import',
      'Real-time Analytics',
      'Notification System',
      'Comprehensive Logging',
    ],
  }, 'Welcome to Dashboard Avocado Backend API');
}));

// GET /api/welcome/stats
router.get('/stats', asyncHandler(async (_req: Request, res: Response) => {
  const [
    totalUsers, activeUsers, farmerCount, agentCount, adminCount,
    totalProducts, availableProducts, totalOrders, pendingOrders,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'active' } }),
    prisma.user.count({ where: { role: 'farmer', status: 'active' } }),
    prisma.user.count({ where: { role: 'agent', status: 'active' } }),
    prisma.user.count({ where: { role: 'admin', status: 'active' } }),
    prisma.product.count(),
    prisma.product.count({ where: { status: 'available' } }),
    prisma.order.count(),
    prisma.order.count({ where: { status: 'pending' } }),
  ]).catch(() => Array(9).fill(0));

  const mem = process.memoryUsage();

  sendSuccess(res, {
    users: { total: totalUsers, active: activeUsers, farmers: farmerCount, agents: agentCount, admins: adminCount },
    products: { total: totalProducts, available: availableProducts },
    orders: { total: totalOrders, pending: pendingOrders },
    system: {
      uptime: Math.floor(process.uptime()),
      memory: {
        used: Math.round(mem.heapUsed / 1024 / 1024),
        total: Math.round(mem.heapTotal / 1024 / 1024),
        percentage: Math.round((mem.heapUsed / mem.heapTotal) * 100),
      },
      version: env.APP_VERSION || '1.0.0',
      environment: env.NODE_ENV,
      node_version: process.version,
    },
  }, 'System statistics retrieved successfully');
}));

export default router;
