import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { validateIdParam, validateProductCreation, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { ProductCategory } from '@prisma/client';
import { requireManagedShop } from '../utils/shopScope';

const router = Router();

/**
 * Shop managers: resolves their shop (403 if none), defaults body.supplier_id to it and
 * rejects any other supplier_id. Runs before validateProductCreation.
 */
async function scopeProductCreate(req: AuthenticatedRequest, res: Response, next: () => void) {
  try {
    const shopId = await requireManagedShop(req, res);
    if (shopId === undefined) return;
    if (shopId) {
      if (req.body.supplier_id && req.body.supplier_id !== shopId) {
        sendError(res, 'supplier_id must be your own shop', 403);
        return;
      }
      req.body.supplier_id = shopId;
    }
    next();
  } catch (e) {
    (next as any)(e);
  }
}

/** Loads the product and, for shop managers, checks it belongs to their shop. Sends 403/404 and returns null on failure. */
async function loadOwnedProduct(req: AuthenticatedRequest, res: Response, productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    sendNotFound(res, 'Product not found');
    return null;
  }
  const shopId = await requireManagedShop(req, res);
  if (shopId === undefined) return null;
  if (shopId && product.supplier_id !== shopId) {
    sendError(res, 'Access denied: this product belongs to another shop', 403);
    return null;
  }
  return product;
}

async function stockShopId(supplierId: string) {
  const s = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { is_shop_supplier: true } });
  return s?.is_shop_supplier ? supplierId : null;
}

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
router.post('/', authenticate, authorize('admin', 'shop_manager'), scopeProductCreate as any, validateProductCreation, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name, category, description, price, quantity, unit, supplier_id, brand, images, specifications } = req.body;

  if (!(await prisma.supplier.findUnique({ where: { id: supplier_id }, select: { id: true } }))) {
    sendError(res, 'supplier_id does not refer to an existing supplier or shop', 400);
    return;
  }

  // Names are unique per supplier/shop (two shops may both sell "NPK 17-17-17").
  const existing = await prisma.product.findFirst({ where: { name, supplier_id } });
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
        shop_id: await stockShopId(product.supplier_id),
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

// Fields editable via PUT /api/products/:id (anything else in the body is ignored).
const PRODUCT_EDITABLE_FIELDS = [
  'description', 'price', 'status', 'brand', 'images', 'specifications', 'variety',
  'min_stock', 'cost', 'source_type', 'sku',
] as const;

// PUT /api/products/:id
router.put('/:id', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const productId = req.params.id;
  const existingProduct = await loadOwnedProduct(req, res, productId);
  if (!existingProduct) return;

  const { name, category, unit, quantity, supplier_id, harvest_date, expiry_date } = req.body;

  if (name) {
    const existing = await prisma.product.findFirst({ where: { name, supplier_id: existingProduct.supplier_id, id: { not: productId } } });
    if (existing) {
      sendError(res, 'Product name already exists', 400);
      return;
    }
  }

  const updateData: any = {};
  for (const f of PRODUCT_EDITABLE_FIELDS) {
    if (req.body[f] !== undefined) updateData[f] = req.body[f];
  }
  if (name) updateData.name = name;
  if (category) updateData.category = toCategory(category);
  if (unit) updateData.unit = unit as any;
  if (harvest_date) updateData.harvest_date = new Date(harvest_date);
  if (expiry_date) updateData.expiry_date = new Date(expiry_date);
  // Only admins may move a product to another supplier/shop.
  if (supplier_id !== undefined && req.user?.role === 'admin') {
    if (!(await prisma.supplier.findUnique({ where: { id: supplier_id }, select: { id: true } }))) {
      sendError(res, 'supplier_id does not refer to an existing supplier or shop', 400);
      return;
    }
    updateData.supplier_id = supplier_id;
  }

  // Auto-update status based on quantity
  if (quantity !== undefined) {
    if (!Number.isInteger(quantity) || quantity < 0) {
      sendError(res, 'Quantity must be a non-negative integer', 400);
      return;
    }
    updateData.quantity = quantity;
    if (quantity <= 0) updateData.status = 'out_of_stock';
    else if (!updateData.status) updateData.status = 'available';
  }

  const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({ where: { id: productId }, data: updateData });
    if (quantity !== undefined && quantity !== existingProduct.quantity) {
      await tx.stockHistory.create({
        data: {
          product_id: productId,
          shop_id: await stockShopId(updated.supplier_id),
          previous_quantity: existingProduct.quantity,
          new_quantity: quantity,
          change_amount: quantity - existingProduct.quantity,
          reason: 'adjustment',
          notes: 'Product edit',
          created_by: req.user?.id,
        },
      });
    }
    return updated;
  });

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
router.put('/:id/stock', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const productId = req.params.id;
  const { quantity, reason = 'adjustment', notes } = req.body;

  if (!Number.isInteger(quantity) || quantity < 0) {
    sendError(res, 'Quantity must be a non-negative integer', 400);
    return;
  }

  const product = await loadOwnedProduct(req, res, productId);
  if (!product) return;

  const validReasons = ['restock', 'sale', 'adjustment', 'damage', 'return', 'other'];
  if (!validReasons.includes(reason)) {
    sendError(res, `reason must be one of: ${validReasons.join(', ')}`, 400);
    return;
  }

  const previousQuantity = product.quantity;
  const changeAmount = quantity - previousQuantity;

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { quantity, ...(product.status !== 'discontinued' && { status: quantity > 0 ? 'available' : 'out_of_stock' }) },
  });

  if (changeAmount !== 0) {
    await prisma.stockHistory.create({
      data: {
        product_id: productId,
        shop_id: await stockShopId(product.supplier_id),
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
router.get('/:id/stock-history', authenticate, authorize('admin', 'shop_manager'), validateIdParam, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const productId = req.params.id;
  if (!(await loadOwnedProduct(req, res, productId))) return;
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
