import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { validateIdParam, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { getManagedShopId } from '../utils/shopScope';
import { resolveBuyer, placeOrderTx, changeOrderStatusTx, orderTouchesShop, FINAL_ORDER_STATUSES } from '../utils/commerce';

const router = Router();

/** Shop managers may only modify orders containing their own shop's products. Sends 403/404 and returns false otherwise. */
async function canManageOrder(req: AuthenticatedRequest, res: Response, orderId: string): Promise<boolean> {
  const exists = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!exists) {
    sendNotFound(res, 'Order not found');
    return false;
  }
  if (req.user?.role === 'shop_manager') {
    const shopId = await getManagedShopId(req);
    if (!shopId) {
      sendError(res, 'No shop is assigned to your account', 403);
      return false;
    }
    if (!(await orderTouchesShop(orderId, shopId))) {
      sendError(res, 'Access denied: this order contains none of your shop\'s products', 403);
      return false;
    }
  }
  return true;
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

// GET /api/orders/user/:userId — "my orders": orders whose Customer record belongs to
// the user (matched by account email), plus orders the user placed on someone's behalf.
router.get('/user/:userId', authenticate, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.params.userId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  if (req.user?.role !== 'admin' && req.user?.role !== 'shop_manager' && req.user?.id !== userId) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const where: any = user
    ? { OR: [{ customer: { email: { equals: user.email, mode: 'insensitive' } } }, { placed_by: userId }] }
    : { customer_id: userId }; // backwards compatibility: a Customer id passed by staff
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
    include: { items: true, customer: { select: { email: true } } },
  });

  if (!order) {
    sendNotFound(res, 'Order not found');
    return;
  }

  const ownsOrder = order.customer.email.toLowerCase() === req.user!.email.toLowerCase() || order.placed_by === req.user!.id;
  if (req.user?.role !== 'admin' && req.user?.role !== 'shop_manager' && !ownsOrder) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const { customer, ...rest } = order;
  sendSuccess(res, formatOrder(rest), 'Order retrieved successfully');
}));

// POST /api/orders
// Body: { items: [{product_id, quantity}], shipping_address, billing_address?, payment_method?, notes?, customer_id?, farmer_id? }
// customer_id is optional: when omitted the caller's own Customer record is used (found or created);
// agents/admins may pass farmer_id to order on behalf of a farmer.
router.post('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { items, shipping_address, billing_address, payment_method, notes } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    sendError(res, 'Order must contain at least one item', 400);
    return;
  }
  for (const item of items) {
    if (!item?.product_id || !Number.isInteger(item.quantity) || item.quantity < 1) {
      sendError(res, 'Each item must have a valid product_id and a positive integer quantity', 400);
      return;
    }
  }
  if (!shipping_address) {
    sendError(res, 'Shipping address is required', 400);
    return;
  }

  const buyer = await resolveBuyer(req, req.body);

  // Atomic: create order + conditional stock decrement + stock history + customer stats
  const order = await prisma.$transaction((tx) => placeOrderTx(tx, {
    buyer,
    lines: items.map((i: any) => ({ product_id: i.product_id, quantity: i.quantity })),
    shipping_address,
    billing_address,
    payment_method,
    notes,
    taxRate: 0.18, // Rwanda VAT 18%
    actorId: req.user!.id,
  }));

  sendCreated(res, formatOrder(order), 'Order created successfully');
}));

// Fields that may be edited via PUT /api/orders/:id (everything else is ignored).
const ORDER_EDITABLE_FIELDS = [
  'payment_status', 'payment_method', 'shipping_address', 'billing_address',
  'expected_delivery_date', 'tracking_number', 'notes',
] as const;

// PUT /api/orders/:id
router.put('/:id', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!(await canManageOrder(req, res, req.params.id))) return;

  const data: any = {};
  for (const f of ORDER_EDITABLE_FIELDS) {
    if (req.body[f] !== undefined) data[f] = req.body[f];
  }
  if (data.expected_delivery_date) data.expected_delivery_date = new Date(data.expected_delivery_date);

  const order = await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) await tx.order.update({ where: { id: req.params.id }, data });
    // Status changes go through the same path as PUT /:id/status (stock restore on cancel/return).
    if (req.body.status !== undefined) return changeOrderStatusTx(tx, req.params.id, req.body.status, req.user!.id);
    return tx.order.findUniqueOrThrow({ where: { id: req.params.id }, include: { items: true } });
  });

  sendSuccess(res, formatOrder(order), 'Order updated successfully');
}));

// PUT /api/orders/:id/status
// Moving to cancelled/returned restores stock once; cancelled/returned orders cannot change status again.
router.put('/:id/status', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!(await canManageOrder(req, res, req.params.id))) return;

  const order = await prisma.$transaction((tx) => changeOrderStatusTx(tx, req.params.id, req.body.status, req.user!.id));

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

  await prisma.$transaction(async (tx) => {
    // A pending order still holds stock: release it (and reverse customer stats) before deleting.
    if (!(FINAL_ORDER_STATUSES as readonly string[]).includes(order.status)) {
      await changeOrderStatusTx(tx, order.id, 'cancelled', req.user!.id);
    }
    await tx.transaction.updateMany({ where: { order_id: order.id }, data: { order_id: null } });
    await tx.order.delete({ where: { id: order.id } });
  });

  sendSuccess(res, null, 'Order deleted successfully');
}));

export default router;
