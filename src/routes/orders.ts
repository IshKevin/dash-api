import { Router, Response } from 'express';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { 
  validateIdParam, 
  validateOrderCreation,
  validatePagination
} from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { CreateOrderRequest, UpdateOrderRequest, OrderStatusUpdateRequest, IOrderItem } from '../types/order';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

/**
 * @route   GET /api/orders
 * @desc    Get all orders
 * @access  Private (Admin and shop managers)
 */
router.get('/', authenticate, authorize('admin', 'shop_manager'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Build filter object
    const filter: any = {};
    
    // Add customer filter if provided
    if (req.query.customer_id) {
      filter.customer_id = req.query.customer_id;
    }
    
    // Add status filter if provided
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    // Add payment status filter if provided
    if (req.query.payment_status) {
      filter.payment_status = req.query.payment_status;
    }
    
    // Add date range filters if provided
    if (req.query.date_from || req.query.date_to) {
      filter.order_date = {};
      if (req.query.date_from) {
        filter.order_date.$gte = new Date(req.query.date_from as string);
      }
      if (req.query.date_to) {
        filter.order_date.$lte = new Date(req.query.date_to as string);
      }
    }
    
    // Add amount range filters if provided
    if (req.query.amount_min || req.query.amount_max) {
      filter.total_amount = {};
      if (req.query.amount_min) {
        filter.total_amount.$gte = parseFloat(req.query.amount_min as string);
      }
      if (req.query.amount_max) {
        filter.total_amount.$lte = parseFloat(req.query.amount_max as string);
      }
    }
    
    // Add search filter if provided
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search as string, 'i');
      filter.$or = [
        { order_number: searchRegex },
      ];
    }
    
    // Get orders with pagination
    const orders = await Order.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 });
    
    // Get total count for pagination
    const total = await Order.countDocuments(filter);
    
    // Transform orders to public JSON
    const orderData = orders.map(order => order.toPublicJSON());
    
    sendPaginatedResponse(res, orderData, total, page, limit, 'Orders retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve orders', 500);
    return;
  }
}));

/**
 * @route   GET /api/orders/:id
 * @desc    Get order by ID
 * @access  Private (Admin, shop managers, and order owner)
 */
router.get('/:id', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderId = req.params.id;
    
    const order = await Order.findById(orderId);
    if (!order) {
      sendNotFound(res, 'Order not found');
      return;
    }
    
    // Check permissions
    if (req.user?.role !== 'admin' && req.user?.role !== 'shop_manager' && req.user?.id !== order.customer_id) {
      sendError(res, 'Access denied', 403);
      return;
    }

    sendSuccess(res, order.toPublicJSON(), 'Order retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve order', 500);
    return;
  }
}));

/**
 * @route   POST /api/orders
 * @desc    Create new order
 * @access  Private (All authenticated users)
 */
router.post('/', authenticate, validateOrderCreation, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderData: CreateOrderRequest = req.body;
    
    // Extract customer_id from authenticated user instead of request body
    const customerId = req.user?.id as string;
    
    // Validate required fields
    if (!orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
      sendError(res, 'Order must contain at least one item', 400);
      return;
    }

    if (!orderData.shipping_address) {
      sendError(res, 'Shipping address is required', 400);
      return;
    }

    // Calculate order totals and create order object
    let subtotal = 0;
    const processedItems: IOrderItem[] = [];

    // Process each item and calculate totals
    for (const item of orderData.items) {
      const product = await Product.findById(item.product_id);
      
      if (!product) {
        sendError(res, `Product with ID ${item.product_id} not found`, 404);
        return;
      }

      if (!product.isInStock() || product.quantity < item.quantity) {
        sendError(res, `Insufficient stock for product ${product.name}`, 400);
        return;
      }

      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;

      processedItems.push({
        product_id: item.product_id,
        product_name: product.name,
        quantity: item.quantity,
        unit_price: product.price,
        total_price: itemTotal,
     specifications: item.specifications || {}
      });
    }

    // Calculate taxes and shipping (you can customize this logic)
    const taxRate = 0.1; // 10% tax
    const taxAmount = subtotal * taxRate;
    const shippingCost = 10; // Fixed shipping cost for now
    const discountAmount = 0; // Apply discount logic here if needed
    const totalAmount = subtotal + taxAmount + shippingCost - discountAmount;

    // Create order with customer_id from auth context
    const newOrder = new Order({
      customer_id: customerId, // Use customer ID from authentication
      items: processedItems,
      subtotal,
      tax_amount: taxAmount,
      shipping_cost: shippingCost,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      payment_method: orderData.payment_method,
      shipping_address: orderData.shipping_address,
      billing_address: orderData.billing_address || orderData.shipping_address,
      notes: orderData.notes,
      order_date: new Date()
    });

    const savedOrder = await newOrder.save();

    // Update product quantities
    for (const item of orderData.items) {
      await Product.findByIdAndUpdate(
        item.product_id,
        { $inc: { quantity: -item.quantity } }
      );
    }

    sendCreated(res, savedOrder.toPublicJSON(), 'Order created successfully');
    return;
  } catch (error: any) {
    console.error('Create order error:', error);
    sendError(res, 'Failed to create order', 500);
    return;
  }
}));

/**
 * @route   PUT /api/orders/:id
 * @desc    Update order (admin and shop managers only)
 * @access  Private (Admin and shop managers)
 */
router.put('/:id', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderId = req.params.id;
    const updateData: UpdateOrderRequest = req.body;
    
    // Update order
    const order = await Order.findByIdAndUpdate(
      orderId,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!order) {
      sendNotFound(res, 'Order not found');
      return;
    }

    sendSuccess(res, order.toPublicJSON(), 'Order updated successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to update order', 500);
    return;
  }
}));

/**
 * @route   DELETE /api/orders/:id
 * @desc    Delete order (admin only)
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderId = req.params.id;
    
    // Find order
    const order = await Order.findById(orderId);
    if (!order) {
      sendNotFound(res, 'Order not found');
      return;
    }
    
    // Prevent deletion of confirmed or processing orders
    if (['confirmed', 'processing', 'shipped', 'delivered'].includes(order.status)) {
      sendError(res, 'Cannot delete confirmed or processing orders', 400);
      return;
    }
    
    // Delete order
    await Order.findByIdAndDelete(orderId);

    sendSuccess(res, null, 'Order deleted successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to delete order', 500);
    return;
  }
}));

/**
 * @route   PUT /api/orders/:id/status
 * @desc    Update order status (admin and shop managers only)
 * @access  Private (Admin and shop managers)
 */
router.put('/:id/status', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderId = req.params.id;
    const { status }: OrderStatusUpdateRequest = req.body;
    
    // Validate status
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
    if (!validStatuses.includes(status)) {
      sendError(res, 'Invalid status value', 400);
      return;
    }
    
    // Find order
    const order = await Order.findById(orderId);
    if (!order) {
      sendNotFound(res, 'Order not found');
      return;
    }
    
    // Update order status
    order.status = status;
    
    // Auto-set delivered date
    if (status === 'delivered' && !order.delivered_date) {
      order.delivered_date = new Date();
    }
    
    await order.save();

    sendSuccess(res, order.toPublicJSON(), 'Order status updated successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to update order status', 500);
    return;
  }
}));

/**
 * @route   GET /api/orders/user/:userId
 * @desc    Get orders for a specific user
 * @access  Private (Admin, shop managers, and the user themselves)
 */
router.get('/user/:userId', authenticate, validateIdParam, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.params.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Check permissions
    if (req.user?.role !== 'admin' && req.user?.role !== 'shop_manager' && req.user?.id !== userId) {
      sendError(res, 'Access denied', 403);
      return;
    }
    
    // Build filter
    const filter: any = { customer_id: userId };
    
    // Add status filter if provided
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    // Get orders with pagination
    const orders = await Order.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 });
    
    // Get total count for pagination
    const total = await Order.countDocuments(filter);
    
    // Transform orders to public JSON
    const orderData = orders.map(order => order.toPublicJSON());
    
    sendPaginatedResponse(res, orderData, total, page, limit, 'Orders retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve orders', 500);
    return;
  }
}));

export default router;