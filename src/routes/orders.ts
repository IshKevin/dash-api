import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { validateIdParam, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

function generateOrderNumber(): string {
  const timestamp = Date.now().toString();
  const suffix = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `ORD-${timestamp}-${suffix}`;
}

function formatOrder(order: any) {
  const { items, ...rest } = order;
  return { ...rest, id: order.id, items };
}

// GET /api/orders
router.get('/', authenticate, authorize('admin', 'shop_manager'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const where: any = {};

  if (req.query.customer_id) where.customer_id = req.query.customer_id;
  if (req.query.status) where.status = req.query.status;
  if (req.query.payment_status) where.payment_status = req.query.payment_status;

  if (req.query.date_from || req.query.date_to) {
    where.order_date = {};
    if (req.query.date_from) where.order_date.gte = new Date(req.query.date_from as string);
    if (req.query.date_to) where.order_date.lte = new Date(req.query.date_to as string);
  }

  if (req.query.amount_min || req.query.amount_max) {
    where.total_amount = {};
    if (req.query.amount_min) where.total_amount.gte = parseFloat(req.query.amount_min as string);
    if (req.query.amount_max) where.total_amount.lte = parseFloat(req.query.amount_max as string);
  }

  if (req.query.search) {
    where.order_number = { contains: req.query.search as string, mode: 'insensitive' };
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where, include: { items: true }, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' },
    }),
    prisma.order.count({ where }),
  ]);

  sendPaginatedResponse(res, orders.map(formatOrder), total, page, limit, 'Orders retrieved successfully');
}));

// GET /api/orders/user/:userId
router.get('/user/:userId', authenticate, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.params.userId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  if (req.user?.role !== 'admin' && req.user?.role !== 'shop_manager' && req.user?.id !== userId) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const where: any = { customer_id: userId };
  if (req.query.status) where.status = req.query.status;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where, include: { items: true }, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' },
    }),
    prisma.order.count({ where }),
  ]);

  sendPaginatedResponse(res, orders.map(formatOrder), total, page, limit, 'Orders retrieved successfully');
}));

// GET /api/orders/:id
router.get('/:id', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true },
  });

  if (!order) {
    sendNotFound(res, 'Order not found');
    return;
  }

  if (req.user?.role !== 'admin' && req.user?.role !== 'shop_manager' && req.user?.id !== order.customer_id) {
    sendError(res, 'Access denied', 403);
    return;
  }

  sendSuccess(res, formatOrder(order), 'Order retrieved successfully');
}));

// POST /api/orders
router.post('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { items, shipping_address, billing_address, payment_method, notes } = req.body;
  const customerId = req.user?.id as string;

  if (!items || !Array.isArray(items) || items.length === 0) {
    sendError(res, 'Order must contain at least one item', 400);
    return;
  }

  if (!shipping_address) {
    sendError(res, 'Shipping address is required', 400);
    return;
  }

  // Validate all items and compute totals before opening the transaction
  let subtotal = 0;
  const processedItems: any[] = [];

  for (const item of items) {
    if (!item.product_id || !Number.isInteger(item.quantity) || item.quantity < 1) {
      sendError(res, 'Each item must have a valid product_id and a positive integer quantity', 400);
      return;
    }

    const product = await prisma.product.findUnique({ where: { id: item.product_id } });

    if (!product) {
      sendError(res, `Product with ID ${item.product_id} not found`, 404);
      return;
    }

    if (product.status !== 'available' || product.quantity < item.quantity) {
      sendError(res, `Insufficient stock for product "${product.name}"`, 400);
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
    });
  }

  const taxAmount = subtotal * 0.18; // Rwanda VAT 18%
  const shippingCost = 0;
  const discountAmount = 0;
  const totalAmount = subtotal + taxAmount + shippingCost - discountAmount;

  // Atomic: create order + deduct stock in a single transaction to prevent race conditions
  const order = await prisma.$transaction(async (tx) => {
    // Re-check stock inside the transaction to guard against concurrent orders
    for (const item of processedItems) {
      const current = await tx.product.findUnique({
        where: { id: item.product_id },
        select: { quantity: true, status: true, name: true },
      });

      if (!current || current.status !== 'available' || current.quantity < item.quantity) {
        throw new Error(`Insufficient stock for product "${item.product_name}"`);
      }

      await tx.product.update({
        where: { id: item.product_id },
        data: { quantity: { decrement: item.quantity } },
      });
    }

    return tx.order.create({
      data: {
        order_number: generateOrderNumber(),
        customer_id: customerId,
        subtotal,
        tax_amount: taxAmount,
        shipping_cost: shippingCost,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        payment_method: (payment_method || 'cash') as any,
        shipping_address,
        billing_address: billing_address || shipping_address,
        notes,
        order_date: new Date(),
        items: { create: processedItems },
      },
      include: { items: true },
    });
  });

  sendCreated(res, formatOrder(order), 'Order created successfully');
}));

// PUT /api/orders/:id
router.put('/:id', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { items, ...updateData } = req.body;

  const order = await prisma.order.update({
    where: { id: req.params.id },
    data: updateData,
    include: { items: true },
  }).catch(() => null);

  if (!order) {
    sendNotFound(res, 'Order not found');
    return;
  }

  sendSuccess(res, formatOrder(order), 'Order updated successfully');
}));

// PUT /api/orders/:id/status
router.put('/:id/status', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];

  if (!validStatuses.includes(status)) {
    sendError(res, 'Invalid status value', 400);
    return;
  }

  const data: any = { status };
  if (status === 'delivered') data.delivered_date = new Date();

  const order = await prisma.order.update({
    where: { id: req.params.id },
    data,
    include: { items: true },
  }).catch(() => null);

  if (!order) {
    sendNotFound(res, 'Order not found');
    return;
  }

  sendSuccess(res, formatOrder(order), 'Order status updated successfully');
}));

// DELETE /api/orders/:id
router.delete('/:id', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });

  if (!order) {
    sendNotFound(res, 'Order not found');
    return;
  }

  if (['confirmed', 'processing', 'shipped', 'delivered'].includes(order.status)) {
    sendError(res, 'Cannot delete confirmed or processing orders', 400);
    return;
  }

  await prisma.order.delete({ where: { id: req.params.id } });

  sendSuccess(res, null, 'Order deleted successfully');
}));

export default router;
