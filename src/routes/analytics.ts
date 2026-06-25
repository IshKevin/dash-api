import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { Prisma } from '@prisma/client';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0] as string;
}

function parseDateRange(req: AuthenticatedRequest, defaultDays = 30) {
  const endDate   = req.query.end_date   ? new Date(req.query.end_date   as string) : new Date();
  const startDate = req.query.start_date ? new Date(req.query.start_date as string)
    : new Date(endDate.getTime() - defaultDays * 24 * 60 * 60 * 1000);
  return { startDate, endDate };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * @route   GET /api/analytics/dashboard
 * @desc    Get dashboard statistics
 * @access  Private (Admin, Shop Manager)
 */
router.get('/dashboard', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const now           = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000);

  // User stats grouped by role
  const userByRole = await prisma.user.groupBy({
    by: ['role'],
    _count: { _all: true },
  });

  const userCounts: Record<string, number> = {};
  userByRole.forEach(r => { userCounts[r.role] = r._count._all; });

  // Recent orders (last 30 days, non-cancelled) with their items
  const [recentOrders, totalOrderCount, recentUserCount] = await Promise.all([
    prisma.order.findMany({
      where: { created_at: { gte: thirtyDaysAgo }, status: { not: 'cancelled' } },
      include: { items: true },
    }),
    prisma.order.count(),
    prisma.user.count({ where: { created_at: { gte: sevenDaysAgo } } }),
  ]);

  const totalRevenue = recentOrders.reduce((sum, o) => sum + o.total_amount, 0);

  // Aggregate product sales from order items
  const productSales: Record<string, { quantity: number; revenue: number }> = {};
  for (const order of recentOrders) {
    for (const item of order.items) {
      if (!productSales[item.product_id]) {
        productSales[item.product_id] = { quantity: 0, revenue: 0 };
      }
      const entry = productSales[item.product_id]!;
      entry.quantity += item.quantity;
      entry.revenue  += item.total_price;
    }
  }

  const topProductIds = Object.entries(productSales)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([id]) => id);

  // Service request stats grouped by status
  const srByStatus = await prisma.serviceRequest.groupBy({
    by: ['status'],
    _count: { _all: true },
  });

  const serviceRequestCounts: Record<string, number> = {};
  srByStatus.forEach(s => { serviceRequestCounts[s.status] = s._count._all; });

  // Product counts
  const [totalProducts, inStockProducts, outOfStockProducts, totalUsers, totalServiceRequests] = await Promise.all([
    prisma.product.count({ where: { status: { not: 'discontinued' } } }),
    prisma.product.count({ where: { status: 'available', quantity: { gt: 0 } } }),
    prisma.product.count({ where: { OR: [{ quantity: 0 }, { status: 'out_of_stock' }] } }),
    prisma.user.count(),
    prisma.serviceRequest.count(),
  ]);

  // Fetch top product names
  const topProductDetails = await prisma.product.findMany({
    where: { id: { in: topProductIds } },
    select: { id: true, name: true },
  });

  const productNameMap: Record<string, string> = {};
  topProductDetails.forEach(p => { productNameMap[p.id] = p.name; });

  const topProducts = topProductIds.map(id => ({
    id,
    name:         productNameMap[id] ?? 'Unknown Product',
    quantitySold: productSales[id]!.quantity,
    revenue:      productSales[id]!.revenue,
  }));

  const dashboardData = {
    users: {
      total:  totalUsers,
      recent: recentUserCount,
      byRole: userCounts,
    },
    orders: {
      total:  totalOrderCount,
      recent: recentOrders.length,
      revenue: {
        total:     totalRevenue,
        last30Days: totalRevenue,
      },
    },
    products: {
      total:       totalProducts,
      inStock:     inStockProducts,
      outOfStock:  outOfStockProducts,
    },
    serviceRequests: {
      total:    totalServiceRequests,
      byStatus: serviceRequestCounts,
    },
    topProducts,
  };

  sendSuccess(res, dashboardData, 'Dashboard statistics retrieved successfully');
}));

/**
 * @route   GET /api/analytics/sales
 * @desc    Get sales analytics with daily breakdown
 * @access  Private (Admin, Shop Manager)
 */
router.get('/sales', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { startDate, endDate } = parseDateRange(req);

  if (startDate > endDate) {
    sendError(res, 'Start date must be before end date', 400);
    return;
  }

  const orders = await prisma.order.findMany({
    where: {
      created_at: { gte: startDate, lte: endDate },
      status: { not: 'cancelled' },
    },
    include: { items: true },
  });

  // Daily sales aggregation
  const dailySales: Record<string, { orders: number; revenue: number }> = {};
  const productSales: Record<string, { quantity: number; revenue: number }> = {};

  for (const order of orders) {
    const dateKey = toDateStr(order.created_at);
    if (!dailySales[dateKey]) dailySales[dateKey] = { orders: 0, revenue: 0 };
    dailySales[dateKey]!.orders  += 1;
    dailySales[dateKey]!.revenue += order.total_amount;

    for (const item of order.items) {
      if (!productSales[item.product_id]) productSales[item.product_id] = { quantity: 0, revenue: 0 };
      productSales[item.product_id]!.quantity += item.quantity;
      productSales[item.product_id]!.revenue  += item.total_price;
    }
  }

  const salesTrend = Object.entries(dailySales)
    .map(([date, stats]) => ({ date, orders: stats.orders, revenue: stats.revenue }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const totalOrders   = orders.length;
  const totalRevenue  = orders.reduce((sum, o) => sum + o.total_amount, 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const topProductIds = Object.entries(productSales)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10)
    .map(([id]) => id);

  const topProductDetails = await prisma.product.findMany({
    where: { id: { in: topProductIds } },
    select: { id: true, name: true },
  });

  const productNameMap: Record<string, string> = {};
  topProductDetails.forEach(p => { productNameMap[p.id] = p.name; });

  const topProducts = topProductIds.map(id => ({
    id,
    name:         productNameMap[id] ?? 'Unknown Product',
    quantitySold: productSales[id]!.quantity,
    revenue:      productSales[id]!.revenue,
  }));

  const salesData = {
    period: { start: toDateStr(startDate), end: toDateStr(endDate) },
    totals: { orders: totalOrders, revenue: totalRevenue, averageOrderValue: avgOrderValue },
    trend: salesTrend,
    topProducts,
  };

  sendSuccess(res, salesData, 'Sales analytics retrieved successfully');
}));

/**
 * @route   GET /api/analytics/products
 * @desc    Get product analytics
 * @access  Private (Admin, Shop Manager)
 */
router.get('/products', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { startDate, endDate } = parseDateRange(req);

  const orders = await prisma.order.findMany({
    where: {
      created_at: { gte: startDate, lte: endDate },
      status: { not: 'cancelled' },
    },
    include: { items: true },
  });

  const productSales: Record<string, {
    quantity:    number;
    revenue:     number;
    orders:      number;
    lastOrdered: Date | undefined;
  }> = {};

  for (const order of orders) {
    for (const item of order.items) {
      if (!productSales[item.product_id]) {
        productSales[item.product_id] = { quantity: 0, revenue: 0, orders: 0, lastOrdered: undefined };
      }
      const entry = productSales[item.product_id]!;
      entry.quantity += item.quantity;
      entry.revenue  += item.total_price;
      entry.orders   += 1;
      if (!entry.lastOrdered || order.created_at > entry.lastOrdered) {
        entry.lastOrdered = order.created_at;
      }
    }
  }

  const sortedProductIds = Object.entries(productSales)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([id]) => id);

  const productDetails = await prisma.product.findMany({
    where: { id: { in: sortedProductIds } },
    select: { id: true, name: true, category: true, quantity: true, status: true },
  });

  const detailMap: Record<string, typeof productDetails[0]> = {};
  productDetails.forEach(p => { detailMap[p.id] = p; });

  const products = sortedProductIds.map(id => {
    const sales  = productSales[id]!;
    const detail = detailMap[id];
    return {
      productId:    id,
      productName:  detail?.name     ?? 'Unknown Product',
      category:     detail?.category ?? 'Unknown',
      currentStock: detail?.quantity ?? 0,
      status:       detail?.status   ?? 'unknown',
      quantitySold: sales.quantity,
      revenue:      sales.revenue,
      orders:       sales.orders,
      lastOrdered:  sales.lastOrdered,
    };
  });

  const analyticsData = {
    period:   { start: toDateStr(startDate), end: toDateStr(endDate) },
    products,
    summary: {
      totalProductsSold: products.reduce((s, p) => s + p.quantitySold, 0),
      totalRevenue:      products.reduce((s, p) => s + p.revenue,      0),
      totalOrders:       products.reduce((s, p) => s + p.orders,       0),
    },
  };

  sendSuccess(res, analyticsData, 'Product analytics retrieved successfully');
}));

/**
 * @route   GET /api/analytics/users
 * @desc    Get user analytics (admin only)
 * @access  Private (Admin only)
 */
router.get('/users', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { startDate, endDate } = parseDateRange(req);

  // Fetch users registered in the period
  const registeredUsers = await prisma.user.findMany({
    where: { created_at: { gte: startDate, lte: endDate } },
    select: { created_at: true, role: true },
    orderBy: { created_at: 'asc' },
  });

  // Build daily registration trend
  const dayMap: Record<string, { count: number; byRole: Record<string, number> }> = {};
  for (const u of registeredUsers) {
    const key = toDateStr(u.created_at);
    if (!dayMap[key]) dayMap[key] = { count: 0, byRole: {} };
    dayMap[key]!.count += 1;
    dayMap[key]!.byRole[u.role] = (dayMap[key]!.byRole[u.role] ?? 0) + 1;
  }

  const registrationTrend = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, registrations: data.count, byRole: data.byRole }));

  // Active users (customers who placed orders in the period)
  const activeCustomers = await prisma.order.findMany({
    where: { created_at: { gte: startDate, lte: endDate } },
    select: { customer_id: true },
    distinct: ['customer_id'],
  });

  // Role and status distributions
  const [roleGroups, statusGroups] = await Promise.all([
    prisma.user.groupBy({ by: ['role'],   _count: { _all: true } }),
    prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const byRole:   Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  roleGroups.forEach(r   => { byRole[r.role]     = r._count._all; });
  statusGroups.forEach(s => { byStatus[s.status] = s._count._all; });

  const userData = {
    period: { start: toDateStr(startDate), end: toDateStr(endDate) },
    registrations: {
      trend: registrationTrend,
      total: registeredUsers.length,
    },
    activity: {
      activeUsers: activeCustomers.length,
    },
    demographics: { byRole, byStatus },
  };

  sendSuccess(res, userData, 'User analytics retrieved successfully');
}));

/**
 * @route   GET /api/analytics/orders/monthly
 * @desc    Get monthly order trends
 * @access  Private (Admin, Shop Manager)
 */
router.get('/orders/monthly', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const endDate = req.query.end_date ? new Date(req.query.end_date as string) : new Date();
  const startDate = req.query.start_date
    ? new Date(req.query.start_date as string)
    : new Date(new Date(endDate).setMonth(endDate.getMonth() - 11));

  // Use $queryRaw for efficient monthly grouping
  type MonthlyRow = { year: bigint; month: bigint; orders: bigint; revenue: number; avg_order_value: number };

  const monthlyStats = await prisma.$queryRaw<MonthlyRow[]>(
    Prisma.sql`
      SELECT
        EXTRACT(YEAR  FROM created_at)::int AS year,
        EXTRACT(MONTH FROM created_at)::int AS month,
        COUNT(*)::int                        AS orders,
        SUM(total_amount)                    AS revenue,
        AVG(total_amount)                    AS avg_order_value
      FROM "Order"
      WHERE created_at >= ${startDate}
        AND created_at <= ${endDate}
        AND status <> 'cancelled'
      GROUP BY year, month
      ORDER BY year ASC, month ASC
    `
  );

  const monthlyTrends = monthlyStats.map(row => ({
    period:           `${Number(row.year)}-${String(Number(row.month)).padStart(2, '0')}`,
    orders:           Number(row.orders),
    revenue:          Number(row.revenue),
    averageOrderValue: Number(row.avg_order_value),
  }));

  const totalOrders  = monthlyTrends.reduce((s, m) => s + m.orders,  0);
  const totalRevenue = monthlyTrends.reduce((s, m) => s + m.revenue, 0);
  const overallAvg   = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const orderData = {
    period:  { start: toDateStr(startDate), end: toDateStr(endDate) },
    trends:  monthlyTrends,
    summary: { totalOrders, totalRevenue, overallAverageOrderValue: overallAvg },
  };

  sendSuccess(res, orderData, 'Monthly order trends retrieved successfully');
}));

export default router;
