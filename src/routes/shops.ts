import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError, sendCreated, sendNotFound, sendPaginatedResponse } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// ─── Validation helpers ───────────────────────────────────────────────────────

const validateShopCreation = [
  body('shopName')
    .notEmpty().withMessage('Shop name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Shop name must be between 2 and 200 characters')
    .trim(),
  body('description')
    .notEmpty().withMessage('Description is required')
    .isLength({ max: 1000 }).withMessage('Description must not exceed 1000 characters')
    .trim(),
  body('province').notEmpty().withMessage('Province is required').trim(),
  body('district').notEmpty().withMessage('District is required').trim(),
  body('ownerName')
    .notEmpty().withMessage('Owner name is required')
    .isLength({ min: 2 }).withMessage('Owner name must be at least 2 characters')
    .trim(),
  body('ownerEmail')
    .notEmpty().withMessage('Owner email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('ownerPhone')
    .notEmpty().withMessage('Owner phone is required')
    .matches(/^\+?[\d\s\-\(\)]{10,15}$/).withMessage('Phone number must be a valid format with 10-15 digits'),
  (req: any, res: Response, next: Function): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
      return;
    }
    next();
  }
];

const validateShopUpdate = [
  body('shopName').optional().isLength({ min: 2, max: 200 }).withMessage('Shop name must be between 2 and 200 characters').trim(),
  body('description').optional().isLength({ max: 1000 }).withMessage('Description must not exceed 1000 characters').trim(),
  body('province').optional().trim(),
  body('district').optional().trim(),
  body('ownerName').optional().isLength({ min: 2 }).withMessage('Owner name must be at least 2 characters').trim(),
  body('ownerEmail').optional().isEmail().withMessage('Please provide a valid email address').normalizeEmail(),
  body('ownerPhone').optional().matches(/^\+?[\d\s\-\(\)]{10,15}$/).withMessage('Phone number must be a valid format with 10-15 digits'),
  (req: any, res: Response, next: Function): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
      return;
    }
    next();
  }
];

// ─── Helper: parse shop_number from URL param ─────────────────────────────────

function parseShopNumber(param: string | undefined): number | null {
  const n = parseInt(param || '', 10);
  return isNaN(n) ? null : n;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * @route   POST /api/shops/addshop
 * @desc    Create a new shop (Admin only)
 * @access  Private (Admin only)
 */
router.post('/addshop', authenticate, authorize('admin'), validateShopCreation, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { shopName, description, province, district, ownerName, ownerEmail, ownerPhone } = req.body;

  const shop = await prisma.shop.create({
    data: {
      shopName,
      description,
      province,
      district,
      ownerName,
      ownerEmail,
      ownerPhone,
      created_by: req.user!.id,
    },
    include: { creator: { select: { full_name: true, email: true } } },
  });

  sendCreated(res, shop, 'Shop created successfully');
}));

/**
 * @route   GET /api/shops
 * @desc    Get all shops
 * @access  Private (Admin, Shop Manager)
 */
router.get('/', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const shops = await prisma.shop.findMany({
    orderBy: { shop_number: 'asc' },
    include: { creator: { select: { full_name: true, email: true } } },
  });

  sendSuccess(res, shops, 'Shops retrieved successfully');
}));

/**
 * @route   GET /api/shops/:id
 * @desc    Get a single shop by shop_number
 * @access  Private (Admin, Shop Manager)
 */
router.get('/:id', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const shopNumber = parseShopNumber(req.params.id);
  if (shopNumber === null) {
    sendError(res, 'Invalid shop ID', 400);
    return;
  }

  const shop = await prisma.shop.findUnique({
    where: { shop_number: shopNumber },
    include: { creator: { select: { full_name: true, email: true } } },
  });

  if (!shop) {
    sendNotFound(res, 'Shop not found');
    return;
  }

  sendSuccess(res, shop, 'Shop retrieved successfully');
}));

/**
 * @route   PUT /api/shops/:id
 * @desc    Update a shop by shop_number
 * @access  Private (Admin, Shop Manager)
 */
router.put('/:id', authenticate, authorize('admin', 'shop_manager'), validateShopUpdate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const shopNumber = parseShopNumber(req.params.id);
  if (shopNumber === null) {
    sendError(res, 'Invalid shop ID', 400);
    return;
  }

  const existing = await prisma.shop.findUnique({ where: { shop_number: shopNumber } });
  if (!existing) {
    sendNotFound(res, 'Shop not found');
    return;
  }

  const { shopName, description, province, district, ownerName, ownerEmail, ownerPhone } = req.body;

  const updated = await prisma.shop.update({
    where: { shop_number: shopNumber },
    data: {
      ...(shopName    !== undefined && { shopName }),
      ...(description !== undefined && { description }),
      ...(province    !== undefined && { province }),
      ...(district    !== undefined && { district }),
      ...(ownerName   !== undefined && { ownerName }),
      ...(ownerEmail  !== undefined && { ownerEmail }),
      ...(ownerPhone  !== undefined && { ownerPhone }),
    },
    include: { creator: { select: { full_name: true, email: true } } },
  });

  sendSuccess(res, updated, 'Shop updated successfully');
}));

/**
 * @route   DELETE /api/shops/:id
 * @desc    Delete a shop by shop_number
 * @access  Private (Admin, Shop Manager)
 */
router.delete('/:id', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const shopNumber = parseShopNumber(req.params.id);
  if (shopNumber === null) {
    sendError(res, 'Invalid shop ID', 400);
    return;
  }

  const existing = await prisma.shop.findUnique({ where: { shop_number: shopNumber } });
  if (!existing) {
    sendNotFound(res, 'Shop not found');
    return;
  }

  await prisma.shop.delete({ where: { shop_number: shopNumber } });

  sendSuccess(res, existing, 'Shop deleted successfully');
}));

// ─── Sub-routes: inventory, orders, analytics ────────────────────────────────

/**
 * @route   GET /api/shops/:id/inventory
 * @desc    Get shop inventory (Products belonging to this shop's supplier record)
 * @access  Private (Admin, Shop Manager)
 */
router.get('/:id/inventory', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const shopNumber = parseShopNumber(req.params.id);
  if (shopNumber === null) {
    sendError(res, 'Invalid shop ID', 400);
    return;
  }

  const shop = await prisma.shop.findUnique({ where: { shop_number: shopNumber } });
  if (!shop) {
    sendNotFound(res, 'Shop not found');
    return;
  }

  const page  = parseInt(req.query.page  as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  // Products are linked to Supplier records. The shop's CUID id is used as the supplier_id.
  const where = { supplier_id: shop.id };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.product.count({ where }),
  ]);

  sendPaginatedResponse(res, products, total, page, limit, 'Shop inventory retrieved successfully');
}));

/**
 * @route   GET /api/shops/:id/orders
 * @desc    Get orders containing products from this shop
 * @access  Private (Admin, Shop Manager)
 */
router.get('/:id/orders', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const shopNumber = parseShopNumber(req.params.id);
  if (shopNumber === null) {
    sendError(res, 'Invalid shop ID', 400);
    return;
  }

  const shop = await prisma.shop.findUnique({ where: { shop_number: shopNumber } });
  if (!shop) {
    sendNotFound(res, 'Shop not found');
    return;
  }

  // Collect all product IDs for this shop
  const shopProducts = await prisma.product.findMany({
    where: { supplier_id: shop.id },
    select: { id: true },
  });

  if (shopProducts.length === 0) {
    sendPaginatedResponse(res, [], 0, 1, 20, 'No products found for this shop, so no orders.');
    return;
  }

  const productIds = shopProducts.map(p => p.id);

  const page  = parseInt(req.query.page  as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const where = { items: { some: { product_id: { in: productIds } } } };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { items: true },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.order.count({ where }),
  ]);

  sendPaginatedResponse(res, orders, total, page, limit, 'Shop orders retrieved successfully');
}));

/**
 * @route   GET /api/shops/:id/analytics
 * @desc    Get shop analytics (revenue, sales, stock)
 * @access  Private (Admin, Shop Manager)
 */
router.get('/:id/analytics', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const shopNumber = parseShopNumber(req.params.id);
  if (shopNumber === null) {
    sendError(res, 'Invalid shop ID', 400);
    return;
  }

  const shop = await prisma.shop.findUnique({ where: { shop_number: shopNumber } });
  if (!shop) {
    sendNotFound(res, 'Shop not found');
    return;
  }

  // Fetch all products for the shop
  const shopProducts = await prisma.product.findMany({
    where: { supplier_id: shop.id },
    select: { id: true, quantity: true },
  });

  const productIds = shopProducts.map(p => p.id);

  // Fetch non-cancelled/returned orders containing any of these products
  const orders = await prisma.order.findMany({
    where: {
      status: { notIn: ['cancelled', 'returned'] },
      items: { some: { product_id: { in: productIds } } },
    },
    include: { items: { where: { product_id: { in: productIds } } } },
  });

  let totalRevenue = 0;
  let totalSales   = 0;

  for (const order of orders) {
    for (const item of order.items) {
      totalRevenue += item.total_price;
      totalSales   += item.quantity;
    }
  }

  const analytics = {
    totalProducts:     shopProducts.length,
    totalOrders:       orders.length,
    totalSales,
    totalRevenue,
    lowStockProducts:  shopProducts.filter(p => p.quantity > 0 && p.quantity <= 10).length,
    outOfStockProducts: shopProducts.filter(p => p.quantity === 0).length,
  };

  sendSuccess(res, analytics, 'Shop analytics retrieved successfully');
}));

export default router;
