import { Router, Response } from 'express';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { ServiceRequest } from '../models/ServiceRequest';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

/**
 * @route   GET /api/analytics/dashboard
 * @desc    Get dashboard statistics
 * @access  Private (Admin and shop managers)
 */
router.get('/dashboard', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  try {
    // Calculate date ranges
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Get total users by role
    const userStats = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    
    const userCounts: Record<string, number> = {};
    userStats.forEach(stat => {
      userCounts[stat._id] = stat.count;
    });
    
    // Get recent orders (last 30 days)
    const recentOrders = await Order.find({ 
      created_at: { $gte: thirtyDaysAgo },
      status: { $ne: 'cancelled' }
    });
    
    // Calculate revenue
    const totalRevenue = recentOrders.reduce((sum, order) => sum + order.total_amount, 0);
    
    // Get top selling products
    const productSales: Record<string, { quantity: number; revenue: number }> = {};
    
    recentOrders.forEach(order => {
      order.items.forEach(item => {
        // Check if product_id exists and is not null/undefined
        if (item.product_id) {
          if (!productSales[item.product_id]) {
            productSales[item.product_id] = { quantity: 0, revenue: 0 };
          }
          // Use a temporary variable to avoid TypeScript errors
          const productEntry = productSales[item.product_id];
          if (productEntry) {
            productEntry.quantity += item.quantity;
            productEntry.revenue += item.total_price;
          }
        }
      });
    });
    
    // Get top 5 products by revenue
    const topProducts = Object.entries(productSales)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5);
    
    // Get service request stats
    const serviceRequestStats = await ServiceRequest.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    const serviceRequestCounts: Record<string, number> = {};
    serviceRequestStats.forEach(stat => {
      serviceRequestCounts[stat._id] = stat.count;
    });
    
    // Get recent users (last 7 days)
    const recentUsers = await User.countDocuments({ 
      created_at: { $gte: sevenDaysAgo }
    });
    
    // Prepare dashboard data
    const dashboardData = {
      users: {
        total: await User.countDocuments(),
        recent: recentUsers,
        byRole: userCounts
      },
      orders: {
        total: await Order.countDocuments(),
        recent: recentOrders.length,
        revenue: {
          total: totalRevenue,
          last30Days: totalRevenue
        }
      },
      products: {
        total: await Product.countDocuments({ status: { $ne: 'discontinued' } }),
        inStock: await Product.countDocuments({ status: 'available', quantity: { $gt: 0 } }),
        outOfStock: await Product.countDocuments({ 
          $or: [
            { quantity: 0 },
            { status: 'out_of_stock' }
          ]
        })
      },
      serviceRequests: {
        total: await ServiceRequest.countDocuments(),
        byStatus: serviceRequestCounts
      },
      topProducts: await Promise.all(topProducts.map(async ([productId, sales]) => {
        const product = await Product.findById(productId);
        return {
          id: productId,
          name: product?.name || 'Unknown Product',
          quantitySold: sales.quantity,
          revenue: sales.revenue
        };
      }))
    };

    sendSuccess(res, dashboardData, 'Dashboard statistics retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve dashboard statistics', 500);
    return;
  }
}));

/**
 * @route   GET /api/analytics/sales
 * @desc    Get sales analytics
 * @access  Private (Admin and shop managers)
 */
router.get('/sales', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get date range from query parameters
    const startDate = req.query.start_date ? new Date(req.query.start_date as string) : 
      new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000); // Default to 30 days ago
    const endDate = req.query.end_date ? new Date(req.query.end_date as string) : new Date();
    
    // Validate date range
    if (startDate > endDate) {
      sendError(res, 'Start date must be before end date', 400);
      return;
    }
    
    // Get orders in date range
    const orders = await Order.find({
      created_at: { $gte: startDate, $lte: endDate },
      status: { $ne: 'cancelled' }
    });
    
    // Calculate daily sales
    const dailySales: Record<string, { orders: number; revenue: number }> = {};
    
    orders.forEach(order => {
      const dateKey = order.created_at.toISOString().split('T')[0]; // YYYY-MM-DD
      // Check if dateKey exists before using it
      if (dateKey) {
        if (!dailySales[dateKey]) {
          dailySales[dateKey] = { orders: 0, revenue: 0 };
        }
        // Use a temporary variable to avoid TypeScript errors
        const dailyEntry = dailySales[dateKey];
        if (dailyEntry) {
          dailyEntry.orders += 1;
          dailyEntry.revenue += order.total_amount;
        }
      }
    });
    
    // Convert to array and sort by date
    const salesTrend = Object.entries(dailySales)
      .map(([date, stats]) => ({
        date,
        orders: stats.orders,
        revenue: stats.revenue
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Calculate totals
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + order.total_amount, 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    // Get top selling products
    const productSales: Record<string, { quantity: number; revenue: number }> = {};
    
    orders.forEach(order => {
      order.items.forEach(item => {
        // Check if product_id exists and is not null/undefined
        if (item.product_id) {
          if (!productSales[item.product_id]) {
            productSales[item.product_id] = { quantity: 0, revenue: 0 };
          }
          // Use a temporary variable to avoid TypeScript errors
          const productEntry = productSales[item.product_id];
          if (productEntry) {
            productEntry.quantity += item.quantity;
            productEntry.revenue += item.total_price;
          }
        }
      });
    });
    
    // Get top 10 products by revenue
    const topProducts = Object.entries(productSales)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10);
    
    const salesData = {
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      },
      totals: {
        orders: totalOrders,
        revenue: totalRevenue,
        averageOrderValue: averageOrderValue
      },
      trend: salesTrend,
      topProducts: await Promise.all(topProducts.map(async ([productId, sales]) => {
        const product = await Product.findById(productId);
        return {
          id: productId,
          name: product?.name || 'Unknown Product',
          quantitySold: sales.quantity,
          revenue: sales.revenue
        };
      }))
    };

    sendSuccess(res, salesData, 'Sales analytics retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve sales analytics', 500);
    return;
  }
}));

/**
 * @route   GET /api/analytics/products
 * @desc    Get product analytics
 * @access  Private (Admin and shop managers)
 */
router.get('/products', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get date range from query parameters
    const startDate = req.query.start_date ? new Date(req.query.start_date as string) : 
      new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000); // Default to 30 days ago
    const endDate = req.query.end_date ? new Date(req.query.end_date as string) : new Date();
    
    // Get orders in date range
    const orders = await Order.find({
      created_at: { $gte: startDate, $lte: endDate },
      status: { $ne: 'cancelled' }
    });
    
    // Calculate product sales
    const productSales: Record<string, { 
      quantity: number; 
      revenue: number; 
      orders: number;
      lastOrdered?: Date;
    }> = {};
    
    orders.forEach(order => {
      order.items.forEach(item => {
        // Check if product_id exists and is not null/undefined
        if (item.product_id) {
          if (!productSales[item.product_id]) {
            productSales[item.product_id] = { 
              quantity: 0, 
              revenue: 0, 
              orders: 0,
              lastOrdered: order.created_at
            };
          }
          // Use a temporary variable to avoid TypeScript errors
          const productEntry = productSales[item.product_id];
          if (productEntry) {
            productEntry.quantity += item.quantity;
            productEntry.revenue += item.total_price;
            productEntry.orders += 1;
            
            // Update last ordered date if this order is more recent
            if (!productEntry.lastOrdered || 
                (order.created_at && productEntry.lastOrdered && 
                order.created_at > productEntry.lastOrdered)) {
              productEntry.lastOrdered = order.created_at;
            }
          }
        }
      });
    });
    
    // Convert to array and sort by revenue
    const productAnalytics = Object.entries(productSales)
      .map(([productId, sales]) => ({
        productId,
        quantitySold: sales.quantity,
        revenue: sales.revenue,
        orders: sales.orders,
        lastOrdered: sales.lastOrdered
      }))
      .sort((a, b) => b.revenue - a.revenue);
    
    // Get product details
    const productData = await Promise.all(productAnalytics.map(async (item) => {
      const product = await Product.findById(item.productId);
      return {
        ...item,
        productName: product?.name || 'Unknown Product',
        category: product?.category || 'Unknown',
        currentStock: product?.quantity || 0,
        status: product?.status || 'unknown'
      };
    }));
    
    const analyticsData = {
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      },
      products: productData,
      summary: {
        totalProductsSold: productData.reduce((sum, p) => sum + p.quantitySold, 0),
        totalRevenue: productData.reduce((sum, p) => sum + p.revenue, 0),
        totalOrders: productData.reduce((sum, p) => sum + p.orders, 0)
      }
    };

    sendSuccess(res, analyticsData, 'Product analytics retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve product analytics', 500);
    return;
  }
}));

/**
 * @route   GET /api/analytics/users
 * @desc    Get user analytics (admin only)
 * @access  Private (Admin only)
 */
router.get('/users', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get date range from query parameters
    const startDate = req.query.start_date ? new Date(req.query.start_date as string) : 
      new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000); // Default to 30 days ago
    const endDate = req.query.end_date ? new Date(req.query.end_date as string) : new Date();
    
    // Get user registration stats
    const userRegistrations = await User.aggregate([
      {
        $match: {
          created_at: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$created_at" }
          },
          count: { $sum: 1 },
          byRole: { $push: "$role" }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Process registration data
    const registrationTrend = userRegistrations.map(day => {
      const roleCounts: Record<string, number> = {};
      day.byRole.forEach((role: string) => {
        roleCounts[role] = (roleCounts[role] || 0) + 1;
      });
      
      return {
        date: day._id,
        registrations: day.count,
        byRole: roleCounts
      };
    });
    
    // Get user activity stats (users with orders)
    const activeUsers = await Order.distinct('customer_id', {
      created_at: { $gte: startDate, $lte: endDate }
    });
    
    // Get role distribution
    const roleDistribution = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    
    const roleCounts: Record<string, number> = {};
    roleDistribution.forEach(role => {
      roleCounts[role._id] = role.count;
    });
    
    // Get status distribution
    const statusDistribution = await User.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    const statusCounts: Record<string, number> = {};
    statusDistribution.forEach(status => {
      statusCounts[status._id] = status.count;
    });
    
    const userData = {
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      },
      registrations: {
        trend: registrationTrend,
        total: registrationTrend.reduce((sum, day) => sum + day.registrations, 0)
      },
      activity: {
        activeUsers: activeUsers.length
      },
      demographics: {
        byRole: roleCounts,
        byStatus: statusCounts
      }
    };

    sendSuccess(res, userData, 'User analytics retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve user analytics', 500);
    return;
  }
}));

/**
 * @route   GET /api/analytics/orders/monthly
 * @desc    Get monthly order trends
 * @access  Private (Admin and shop managers)
 */
router.get('/orders/monthly', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get date range from query parameters (default to 12 months)
    const endDate = req.query.end_date ? new Date(req.query.end_date as string) : new Date();
    const startDate = req.query.start_date ? new Date(req.query.start_date as string) : 
      new Date(new Date().setMonth(endDate.getMonth() - 11));
    
    // Get monthly order stats
    const monthlyStats = await Order.aggregate([
      {
        $match: {
          created_at: { $gte: startDate, $lte: endDate },
          status: { $ne: 'cancelled' }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$created_at" },
            month: { $month: "$created_at" }
          },
          orders: { $sum: 1 },
          revenue: { $sum: "$total_amount" },
          avgOrderValue: { $avg: "$total_amount" }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 }
      }
    ]);
    
    // Format the data
    const monthlyTrends = monthlyStats.map((month: any) => ({
      period: `${month._id.year}-${month._id.month.toString().padStart(2, '0')}`,
      orders: month.orders,
      revenue: month.revenue,
      averageOrderValue: month.avgOrderValue
    }));
    
    // Calculate totals
    const totalOrders = monthlyTrends.reduce((sum: number, month: any) => sum + month.orders, 0);
    const totalRevenue = monthlyTrends.reduce((sum: number, month: any) => sum + month.revenue, 0);
    const overallAverage = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    const orderData = {
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      },
      trends: monthlyTrends,
      summary: {
        totalOrders,
        totalRevenue,
        overallAverageOrderValue: overallAverage
      }
    };

    sendSuccess(res, orderData, 'Monthly order trends retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve monthly order trends', 500);
    return;
  }
}));

export default router;