import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { validateIdParam, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// GET /api/customers
router.get('/', authenticate, authorize('admin', 'shop_manager'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const where: any = {};

  if (req.query.shop_id) where.shop_id = req.query.shop_id;
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

  const existing = await prisma.customer.findFirst({ where: { email: email.toLowerCase() } });
  if (existing) {
    sendError(res, 'Customer with this email already exists', 409);
    return;
  }

  const customer = await prisma.customer.create({
    data: {
      name: resolvedName, email: email.toLowerCase(), phone, address, shop_id, status: (status || 'active') as any,
      first_name, last_name, type: type || 'individual', company, address_details, preferences,
      tags: tags || [], notes,
    },
  });

  sendCreated(res, customer, 'Customer created successfully');
}));

// PUT /api/customers/:id
router.put('/:id', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { email, name, first_name, last_name, ...rest } = req.body;
  const updateData: any = { ...rest, first_name, last_name };

  if (name) {
    updateData.name = name;
  } else if (first_name || last_name) {
    updateData.name = [first_name, last_name].filter(Boolean).join(' ');
  }

  if (email) {
    const conflict = await prisma.customer.findFirst({
      where: { email: email.toLowerCase(), id: { not: req.params.id } },
    });
    if (conflict) {
      sendError(res, 'Customer with this email already exists', 409);
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
  const customer = await prisma.customer.delete({ where: { id: req.params.id } }).catch(() => null);

  if (!customer) {
    sendNotFound(res, 'Customer not found');
    return;
  }

  sendSuccess(res, null, 'Customer deleted successfully');
}));

// GET /api/customers/:id/orders
router.get('/:id/orders', authenticate, authorize('admin', 'shop_manager'), validateIdParam, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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
