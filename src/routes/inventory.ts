import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { validateIdParam, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { requireManagedShop } from '../utils/shopScope';

/** Products at or below their own min_stock (default 10) — or an explicit threshold when given. */
function isLowStock(p: { quantity: number; min_stock: number | null }, threshold?: number) {
  return p.quantity > 0 && p.quantity <= (threshold ?? p.min_stock ?? 10);
}

const router = Router();

// GET /api/inventory
router.get('/', authenticate, authorize('admin', 'shop_manager'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const shopId = await requireManagedShop(req, res);
  if (shopId === undefined) return;
  const where: any = {};
  if (shopId) where.supplier_id = shopId;

  const [products, total] = await Promise.all([
    prisma.product.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.product.count({ where }),
  ]);

  sendPaginatedResponse(res, products, total, page, limit, 'Inventory retrieved successfully');
}));

// GET /api/inventory/low-stock
router.get('/low-stock', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Each product's own min_stock is the threshold unless ?threshold= overrides it.
  const threshold = parseInt(req.query.threshold as string) || undefined;
  const shopId = await requireManagedShop(req, res);
  if (shopId === undefined) return;
  const where: any = { quantity: { gt: 0 }, status: 'available' };

  if (shopId) {
    where.supplier_id = shopId;
  } else if (req.query.shopId) {
    where.supplier_id = req.query.shopId;
  }

  const products = await prisma.product.findMany({ where, orderBy: { quantity: 'asc' } });

  sendSuccess(res, products.filter((p) => isLowStock(p, threshold)), 'Low stock items retrieved');
}));

// GET /api/inventory/out-of-stock
router.get('/out-of-stock', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const shopId = await requireManagedShop(req, res);
  if (shopId === undefined) return;
  const where: any = { OR: [{ quantity: 0 }, { status: 'out_of_stock' }] };
  if (shopId) where.supplier_id = shopId;

  const products = await prisma.product.findMany({
    where,
    orderBy: { updated_at: 'desc' },
  });

  sendSuccess(res, products, 'Out of stock items retrieved');
}));

// GET /api/inventory/summary — must be defined BEFORE /:id to avoid route shadowing
router.get('/summary', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const shopId = await requireManagedShop(req, res);
  if (shopId === undefined) return;
  const scoped = (extra: any = {}) => (shopId ? { ...extra, supplier_id: shopId } : extra);

  const [total, available, outOfStock, discontinued, active] = await Promise.all([
    prisma.product.count({ where: scoped() }),
    prisma.product.count({ where: scoped({ status: 'available' }) }),
    prisma.product.count({ where: scoped({ status: 'out_of_stock' }) }),
    prisma.product.count({ where: scoped({ status: 'discontinued' }) }),
    prisma.product.findMany({
      where: scoped({ status: { not: 'discontinued' } }),
      select: { quantity: true, min_stock: true, price: true, status: true },
    }),
  ]);
  const lowStock = active.filter((p) => p.status === 'available' && isLowStock(p)).length;
  const totalValueSum = active.reduce((sum, p) => sum + p.price * p.quantity, 0);

  sendSuccess(res, {
    total_products: total,
    available: available,
    out_of_stock: outOfStock,
    low_stock: lowStock,
    discontinued: discontinued,
    total_value: totalValueSum,
  }, 'Inventory summary retrieved successfully');
}));

// POST /api/inventory
router.post('/', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    name, category, description, price, quantity, unit, supplier_id,
    variety, min_stock, cost, source_type, brand, images, specifications,
    harvest_date, expiry_date,
  } = req.body;

  const shopId = await requireManagedShop(req, res);
  if (shopId === undefined) return;
  // Shop managers always create into their own shop (supplier_id defaults to it).
  const resolvedSupplierId = shopId ? (supplier_id || shopId) : supplier_id;

  if (!name || !category || price === undefined || !unit || !resolvedSupplierId) {
    sendError(res, 'name, category, price, unit, and supplier_id are required', 400);
    return;
  }

  if (shopId && resolvedSupplierId !== shopId) {
    sendError(res, 'supplier_id must be your own shop', 403);
    return;
  }
  if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 0)) {
    sendError(res, 'quantity must be a non-negative integer', 400);
    return;
  }
  const supplier = await prisma.supplier.findUnique({ where: { id: resolvedSupplierId }, select: { id: true, is_shop_supplier: true } });
  if (!supplier) {
    sendError(res, 'supplier_id does not refer to an existing supplier or shop', 400);
    return;
  }

  const product = await prisma.product.create({
    data: {
      name, category: (category === 'pest-management' ? 'pest_management' : category) as any, description, price, quantity: quantity || 0, unit: unit as any,
      supplier_id: resolvedSupplierId, variety, min_stock: min_stock ?? 10, cost, source_type: source_type || 'manual',
      brand, images: images || [], specifications,
      harvest_date: harvest_date ? new Date(harvest_date) : undefined,
      expiry_date: expiry_date ? new Date(expiry_date) : undefined,
      status: (quantity || 0) > 0 ? 'available' : 'out_of_stock',
    },
  });

  if (product.quantity > 0) {
    await prisma.stockHistory.create({
      data: {
        product_id: product.id,
        shop_id: supplier.is_shop_supplier ? supplier.id : null,
        previous_quantity: 0,
        new_quantity: product.quantity,
        change_amount: product.quantity,
        reason: 'restock',
        notes: 'Initial stock',
        created_by: req.user?.id,
      },
    });
  }

  sendSuccess(res, product, 'Inventory item created successfully');
}));

// GET /api/inventory/:id
router.get('/:id', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });

  if (!product) {
    sendNotFound(res, 'Product not found');
    return;
  }
  const shopId = await requireManagedShop(req, res);
  if (shopId === undefined) return;
  if (shopId && product.supplier_id !== shopId) {
    sendError(res, 'Access denied', 403);
    return;
  }

  sendSuccess(res, product, 'Product retrieved successfully');
}));

// PUT /api/inventory/:id
router.put('/:id', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    name, category, description, price, quantity, unit, supplier_id,
    variety, min_stock, cost, source_type, brand, images, specifications,
    harvest_date, expiry_date,
  } = req.body;

  const updateData: any = {
    name, description, price, unit: unit as any, supplier_id,
    variety, min_stock, cost, source_type, brand, images, specifications,
  };
  if (category) updateData.category = (category === 'pest-management' ? 'pest_management' : category) as any;
  if (quantity !== undefined) {
    if (!Number.isInteger(quantity) || quantity < 0) {
      sendError(res, 'quantity must be a non-negative integer', 400);
      return;
    }
    updateData.quantity = quantity;
    updateData.status = quantity > 0 ? 'available' : 'out_of_stock';
  }
  if (harvest_date) updateData.harvest_date = new Date(harvest_date);
  if (expiry_date) updateData.expiry_date = new Date(expiry_date);
  // shop_managers cannot move a product to a shop they don't manage
  if (req.user?.role === 'shop_manager') delete updateData.supplier_id;

  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendNotFound(res, 'Product not found');
    return;
  }
  const shopId = await requireManagedShop(req, res);
  if (shopId === undefined) return;
  if (shopId && existing.supplier_id !== shopId) {
    sendError(res, 'Access denied', 403);
    return;
  }

  if (updateData.supplier_id && !(await prisma.supplier.findUnique({ where: { id: updateData.supplier_id }, select: { id: true } }))) {
    sendError(res, 'supplier_id does not refer to an existing supplier or shop', 400);
    return;
  }

  const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({ where: { id: req.params.id }, data: updateData });
    if (quantity !== undefined && quantity !== existing.quantity) {
      const sup = await tx.supplier.findUnique({ where: { id: updated.supplier_id }, select: { is_shop_supplier: true } });
      await tx.stockHistory.create({
        data: {
          product_id: updated.id,
          shop_id: sup?.is_shop_supplier ? updated.supplier_id : null,
          previous_quantity: existing.quantity,
          new_quantity: quantity,
          change_amount: quantity - existing.quantity,
          reason: 'adjustment',
          notes: 'Inventory edit',
          created_by: req.user?.id,
        },
      });
    }
    return updated;
  });

  sendSuccess(res, product, 'Inventory item updated successfully');
}));

// DELETE /api/inventory/:id
router.delete('/:id', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendNotFound(res, 'Product not found');
    return;
  }
  const shopId = await requireManagedShop(req, res);
  if (shopId === undefined) return;
  if (shopId && existing.supplier_id !== shopId) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: { status: 'discontinued' },
  }).catch(() => null);

  if (!product) {
    sendNotFound(res, 'Product not found');
    return;
  }

  sendSuccess(res, null, 'Inventory item deleted successfully');
}));

// PUT /api/inventory/:id/restock
router.put('/:id/restock', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { quantity, notes } = req.body;
  const productId = req.params.id;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    sendError(res, 'Restock quantity must be a positive integer', 400);
    return;
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    sendNotFound(res, 'Product not found');
    return;
  }
  const shopId = await requireManagedShop(req, res);
  if (shopId === undefined) return;
  if (shopId && product.supplier_id !== shopId) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Atomic increment (no lost updates under concurrent sales/restocks).
    const p = await tx.product.update({
      where: { id: productId },
      data: { quantity: { increment: quantity }, ...(product.status === 'out_of_stock' ? { status: 'available' as const } : {}) },
    });
    const sup = await tx.supplier.findUnique({ where: { id: p.supplier_id }, select: { is_shop_supplier: true } });
    await tx.stockHistory.create({
      data: {
        product_id: productId,
        shop_id: sup?.is_shop_supplier ? p.supplier_id : null,
        previous_quantity: p.quantity - quantity,
        new_quantity: p.quantity,
        change_amount: quantity,
        reason: 'restock',
        notes: notes || 'Manual restock',
        created_by: req.user?.id,
      },
    });
    return p;
  });

  sendSuccess(res, updated, 'Product restocked successfully');
}));

// GET /api/inventory/:id/history
router.get('/:id/history', authenticate, authorize('admin', 'shop_manager'), validateIdParam, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id }, select: { supplier_id: true } });
  if (!product) {
    sendNotFound(res, 'Product not found');
    return;
  }
  const shopId = await requireManagedShop(req, res);
  if (shopId === undefined) return;
  if (shopId && product.supplier_id !== shopId) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const [history, total] = await Promise.all([
    prisma.stockHistory.findMany({
      where: { product_id: req.params.id },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.stockHistory.count({ where: { product_id: req.params.id } }),
  ]);

  sendPaginatedResponse(res, history, total, page, limit, 'Stock history retrieved successfully');
}));

export default router;
