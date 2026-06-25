import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { validateIdParam, validateProductCreation, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { ProductCategory } from '@prisma/client';

const router = Router();

// Convert API "pest-management" string to Prisma enum value
function toCategory(cat: string): ProductCategory {
  if (cat === 'pest-management') return ProductCategory.pest_management;
  return cat as ProductCategory;
}

// Convert Prisma enum back to API string
function fromCategory(cat: string): string {
  if (cat === 'pest_management') return 'pest-management';
  return cat;
}

function formatProduct(p: any) {
  return { ...p, category: fromCategory(p.category) };
}

function buildProductWhere(req: Request): any {
  const where: any = {};

  if (req.query.status) {
    where.status = req.query.status;
  } else {
    where.status = { not: 'discontinued' };
  }

  if (req.query.category) {
    where.category = toCategory(req.query.category as string);
  }

  if (req.query.supplier_id) {
    where.supplier_id = req.query.supplier_id as string;
  }

  if (req.query.price_min || req.query.price_max) {
    where.price = {};
    if (req.query.price_min) where.price.gte = parseFloat(req.query.price_min as string);
    if (req.query.price_max) where.price.lte = parseFloat(req.query.price_max as string);
  }

  if (req.query.in_stock === 'true') {
    where.quantity = { gt: 0 };
    where.status = 'available';
  } else if (req.query.in_stock === 'false') {
    where.OR = [{ quantity: 0 }, { status: 'out_of_stock' }];
  }

  if (req.query.search) {
    const s = req.query.search as string;
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { description: { contains: s, mode: 'insensitive' } },
      { brand: { contains: s, mode: 'insensitive' } },
    ];
  }

  return where;
}

// GET /api/products
router.get('/', validatePagination, asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const where = buildProductWhere(req);

  const [products, total] = await Promise.all([
    prisma.product.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.product.count({ where }),
  ]);

  sendPaginatedResponse(res, products.map(formatProduct), total, page, limit, 'Products retrieved successfully');
}));

// GET /api/products/:id
router.get('/:id', validateIdParam, asyncHandler(async (req: Request, res: Response) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });

  if (!product) {
    sendNotFound(res, 'Product not found');
    return;
  }

  sendSuccess(res, formatProduct(product), 'Product retrieved successfully');
}));

// POST /api/products
router.post('/', authenticate, authorize('admin', 'shop_manager', 'agent'), validateProductCreation, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name, category, description, price, quantity, unit, supplier_id, brand, images, specifications } = req.body;

  const existing = await prisma.product.findFirst({ where: { name } });
  if (existing) {
    sendError(res, 'Product name already exists', 400);
    return;
  }

  const categoryCode = (category as string).substring(0, 3).toUpperCase();
  const nameCode = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '');
  const timestamp = Date.now().toString().slice(-6);
  const sku = `${categoryCode}-${nameCode}-${timestamp}`;

  const productStatus = quantity <= 0 ? 'out_of_stock' : 'available';

  const product = await prisma.product.create({
    data: {
      name,
      category: toCategory(category),
      description,
      price,
      quantity: quantity || 0,
      unit: unit as any,
      supplier_id,
      status: productStatus as any,
      brand,
      images: images || [],
      specifications: specifications || {},
      sku,
    },
  });

  // Record initial stock
  if (product.quantity > 0) {
    await prisma.stockHistory.create({
      data: {
        product_id: product.id,
        shop_id: product.supplier_id,
        previous_quantity: 0,
        new_quantity: product.quantity,
        change_amount: product.quantity,
        reason: 'restock',
        notes: 'Initial stock creation',
        created_by: req.user?.id,
      },
    });
  }

  sendCreated(res, formatProduct(product), 'Product created successfully');
}));

// PUT /api/products/:id
router.put('/:id', authenticate, authorize('admin', 'shop_manager', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const productId = req.params.id;
  const { name, category, ...rest } = req.body;

  if (name) {
    const existing = await prisma.product.findFirst({ where: { name, id: { not: productId } } });
    if (existing) {
      sendError(res, 'Product name already exists', 400);
      return;
    }
  }

  const updateData: any = { ...rest };
  if (name) updateData.name = name;
  if (category) updateData.category = toCategory(category);
  if (rest.unit) updateData.unit = rest.unit as any;

  // Auto-update status based on quantity
  if (rest.quantity !== undefined) {
    if (rest.quantity <= 0) updateData.status = 'out_of_stock';
    else if (!rest.status) updateData.status = 'available';
  }

  const product = await prisma.product.update({
    where: { id: productId },
    data: updateData,
  }).catch(() => null);

  if (!product) {
    sendNotFound(res, 'Product not found');
    return;
  }

  sendSuccess(res, formatProduct(product), 'Product updated successfully');
}));

// DELETE /api/products/:id (marks as discontinued)
router.delete('/:id', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: { status: 'discontinued' },
  }).catch(() => null);

  if (!product) {
    sendNotFound(res, 'Product not found');
    return;
  }

  sendSuccess(res, formatProduct(product), 'Product discontinued successfully');
}));

// PUT /api/products/:id/stock
router.put('/:id/stock', authenticate, authorize('admin', 'shop_manager', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const productId = req.params.id;
  const { quantity, reason = 'adjustment', notes } = req.body;

  if (!Number.isInteger(quantity) || quantity < 0) {
    sendError(res, 'Quantity must be a non-negative integer', 400);
    return;
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    sendNotFound(res, 'Product not found');
    return;
  }

  const previousQuantity = product.quantity;
  const changeAmount = quantity - previousQuantity;

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { quantity, status: quantity > 0 ? 'available' : 'out_of_stock' },
  });

  if (changeAmount !== 0) {
    await prisma.stockHistory.create({
      data: {
        product_id: productId,
        shop_id: product.supplier_id,
        previous_quantity: previousQuantity,
        new_quantity: quantity,
        change_amount: changeAmount,
        reason: reason as any,
        notes: notes || 'Manual stock update',
        created_by: req.user?.id,
      },
    });
  }

  sendSuccess(res, formatProduct(updated), 'Product stock updated successfully');
}));

// GET /api/products/:id/stock-history
router.get('/:id/stock-history', authenticate, authorize('admin', 'shop_manager'), validateIdParam, validatePagination, asyncHandler(async (req: Request, res: Response) => {
  const productId = req.params.id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const [history, total] = await Promise.all([
    prisma.stockHistory.findMany({
      where: { product_id: productId },
      include: { creator: { select: { full_name: true, email: true } } },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.stockHistory.count({ where: { product_id: productId } }),
  ]);

  sendPaginatedResponse(res, history, total, page, limit, 'Stock history retrieved successfully');
}));

export default router;
