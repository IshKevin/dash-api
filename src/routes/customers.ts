import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { validateIdParam, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { getManagedShopId, requireManagedShop } from '../utils/shopScope';

const router = Router();

// GET /api/customers
router.get('/', authenticate, authorize('admin', 'shop_manager'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const where: any = {};

  const managedShopId = await requireManagedShop(req, res);
  if (managedShopId === undefined) return;
  if (managedShopId) {
    where.shop_id = managedShopId;
  } else if (req.query.shop_id) {
    where.shop_id = req.query.shop_id;
  }
  if (req.query.status) where.status = req.query.status;

  if (req.query.search) {
    const s = req.query.search as string;
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.customer.count({ where }),
  ]);

  sendPaginatedResponse(res, customers, total, page, limit, 'Customers retrieved successfully');
}));

// GET /api/customers/:id
router.get('/:id', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });

  if (!customer) {
    sendNotFound(res, 'Customer not found');
    return;
  }

  if (req.user?.role === 'shop_manager' && customer.shop_id !== (await getManagedShopId(req))) {
    sendError(res, 'Access denied', 403);
    return;
  }

  sendSuccess(res, customer, 'Customer retrieved successfully');
}));

// POST /api/customers
router.post('/', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    name, first_name, last_name, email, phone, address, shop_id, status,
    type, company, address_details, preferences, tags, notes,
  } = req.body;

  const resolvedName = name || [first_name, last_name].filter(Boolean).join(' ');

  if (!resolvedName || !email || !phone) {
    sendError(res, 'Name (or first/last name), email, and phone are required', 400);
    return;
  }

  const managedShopId = await requireManagedShop(req, res);
  if (managedShopId === undefined) return;
  const resolvedShopId = managedShopId ?? (shop_id || null);

  // Email is unique per shop (the same person may be a customer of several shops,
  // and also has a platform-level record with shop_id = null created at checkout).
  const existing = await prisma.customer.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, shop_id: resolvedShopId },
  });
  if (existing) {
    sendError(res, 'A customer with this email already exists for this shop', 409);
    return;
  }

  const customer = await prisma.customer.create({
    data: {
      name: resolvedName, email: email.toLowerCase(), phone, address, shop_id: resolvedShopId, status: (status || 'active') as any,
      first_name, last_name, type: type || 'individual', company, address_details, preferences,
      tags: tags || [], notes,
    },
  });

  sendCreated(res, customer, 'Customer created successfully');
}));

// PUT /api/customers/:id
router.put('/:id', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.customer.findUnique({ where: { id: req.params.id }, select: { shop_id: true } });
  const allowedFields = [
    'phone', 'address', 'status', 'type', 'company', 'address_details', 'preferences', 'tags', 'notes',
  ];
  if (!existing) {
    sendNotFound(res, 'Customer not found');
    return;
  }
  if (req.user?.role === 'shop_manager' && existing.shop_id !== (await getManagedShopId(req))) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const { email, name, first_name, last_name, shop_id } = req.body;
  // Whitelisted fields only; order statistics (total_orders/total_spent/last_order_date) are server-maintained.
  const updateData: any = { first_name, last_name };
  for (const f of allowedFields) if (req.body[f] !== undefined) updateData[f] = req.body[f];
  // shop_managers cannot move a customer to a shop they don't manage
  if (shop_id !== undefined && req.user?.role !== 'shop_manager') {
    updateData.shop_id = shop_id;
  }

  if (name) {
    updateData.name = name;
  } else if (first_name || last_name) {
    updateData.name = [first_name, last_name].filter(Boolean).join(' ');
  }

  if (email) {
    const targetShopId = updateData.shop_id !== undefined ? updateData.shop_id : existing.shop_id;
    const conflict = await prisma.customer.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, shop_id: targetShopId, id: { not: req.params.id } },
    });
    if (conflict) {
      sendError(res, 'A customer with this email already exists for this shop', 409);
      return;
    }
    updateData.email = email.toLowerCase();
  }

  const customer = await prisma.customer.update({
    where: { id: req.params.id },
    data: updateData,
  }).catch(() => null);

  if (!customer) {
    sendNotFound(res, 'Customer not found');
    return;
  }

  sendSuccess(res, customer, 'Customer updated successfully');
}));

// DELETE /api/customers/:id
router.delete('/:id', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id }, select: { _count: { select: { orders: true } } } });
  if (!customer) {
    sendNotFound(res, 'Customer not found');
    return;
  }
  if (customer._count.orders > 0) {
    sendError(res, `Customer has ${customer._count.orders} order(s); deactivate the customer instead (status: inactive)`, 409);
    return;
  }
  await prisma.customer.delete({ where: { id: req.params.id } });

  sendSuccess(res, null, 'Customer deleted successfully');
}));

// GET /api/customers/:id/orders
router.get('/:id/orders', authenticate, authorize('admin', 'shop_manager'), validateIdParam, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const targetCustomer = await prisma.customer.findUnique({ where: { id: req.params.id }, select: { shop_id: true } });
  if (!targetCustomer) {
    sendNotFound(res, 'Customer not found');
    return;
  }
  if (req.user?.role === 'shop_manager' && targetCustomer.shop_id !== (await getManagedShopId(req))) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { customer_id: req.params.id },
      include: { items: true },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.order.count({ where: { customer_id: req.params.id } }),
  ]);

  sendPaginatedResponse(res, orders, total, page, limit, 'Customer orders retrieved successfully');
}));

// GET /api/customers/:id/statistics
router.get('/:id/statistics', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });

  if (!customer) {
    sendNotFound(res, 'Customer not found');
    return;
  }
  if (req.user?.role === 'shop_manager' && customer.shop_id !== (await getManagedShopId(req))) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const orders = await prisma.order.findMany({ where: { customer_id: req.params.id }, include: { items: true } });

  const totalOrders = orders.length;
  const totalSpent = orders.reduce((sum, o) => sum + o.total_amount, 0);
  const averageOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
  const lastOrder = orders.sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0];

  // Aggregate favorite products
  const productMap: Record<string, { product_id: string; product_name: string; total_quantity: number }> = {};
  for (const order of orders) {
    for (const item of order.items) {
      if (!productMap[item.product_id]) {
        productMap[item.product_id] = { product_id: item.product_id, product_name: item.product_name, total_quantity: 0 };
      }
      productMap[item.product_id].total_quantity += item.quantity;
    }
  }
  const favoriteProducts = Object.values(productMap)
    .sort((a, b) => b.total_quantity - a.total_quantity)
    .slice(0, 5);

  sendSuccess(res, {
    total_orders: totalOrders,
    total_spent: totalSpent,
    average_order_value: averageOrderValue,
    last_order_date: lastOrder?.created_at || null,
    favorite_products: favoriteProducts,
  }, 'Customer statistics retrieved successfully');
}));

export default router;
