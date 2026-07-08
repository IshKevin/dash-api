import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { validateIdParam, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// GET /api/inventory
router.get('/', authenticate, authorize('admin', 'shop_manager'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const [products, total] = await Promise.all([
    prisma.product.findMany({ skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.product.count(),
  ]);

  sendPaginatedResponse(res, products, total, page, limit, 'Inventory retrieved successfully');
}));

// GET /api/inventory/low-stock
router.get('/low-stock', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const threshold = parseInt(req.query.threshold as string) || 10;
  const where: any = {
    quantity: { lte: threshold, gt: 0 },
    status: 'available',
  };

  if (req.query.shopId) where.supplier_id = req.query.shopId;

  const products = await prisma.product.findMany({ where, orderBy: { quantity: 'asc' } });

  sendSuccess(res, products, 'Low stock items retrieved');
}));

// GET /api/inventory/out-of-stock
router.get('/out-of-stock', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const products = await prisma.product.findMany({
    where: { OR: [{ quantity: 0 }, { status: 'out_of_stock' }] },
    orderBy: { updated_at: 'desc' },
  });

  sendSuccess(res, products, 'Out of stock items retrieved');
}));

// GET /api/inventory/summary — must be defined BEFORE /:id to avoid route shadowing
router.get('/summary', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const [total, available, outOfStock, lowStock, discontinued] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { status: 'available' } }),
    prisma.product.count({ where: { status: 'out_of_stock' } }),
    prisma.product.count({ where: { quantity: { lte: 10, gt: 0 }, status: 'available' } }),
    prisma.product.count({ where: { status: 'discontinued' } }),
  ]);

  const totalValue = await prisma.product.aggregate({
    _sum: { price: true, quantity: true },
    where: { status: { not: 'discontinued' } },
  });

  sendSuccess(res, {
    total_products: total,
    available: available,
    out_of_stock: outOfStock,
    low_stock: lowStock,
    discontinued: discontinued,
    total_value: (totalValue._sum.price || 0) * (totalValue._sum.quantity || 0),
  }, 'Inventory summary retrieved successfully');
}));

// POST /api/inventory
router.post('/', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    name, category, description, price, quantity, unit, supplier_id,
    variety, min_stock, cost, source_type, brand, images, specifications,
    harvest_date, expiry_date,
  } = req.body;

  if (!name || !category || price === undefined || !unit || !supplier_id) {
    sendError(res, 'name, category, price, unit, and supplier_id are required', 400);
    return;
  }

  const product = await prisma.product.create({
    data: {
      name, category: category as any, description, price, quantity: quantity || 0, unit: unit as any,
      supplier_id, variety, min_stock: min_stock ?? 10, cost, source_type: source_type || 'manual',
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
  if (category) updateData.category = category as any;
  if (quantity !== undefined) {
    updateData.quantity = quantity;
    updateData.status = quantity > 0 ? 'available' : 'out_of_stock';
  }
  if (harvest_date) updateData.harvest_date = new Date(harvest_date);
  if (expiry_date) updateData.expiry_date = new Date(expiry_date);

  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: updateData,
  }).catch(() => null);

  if (!product) {
    sendNotFound(res, 'Product not found');
    return;
  }

  sendSuccess(res, product, 'Inventory item updated successfully');
}));

// DELETE /api/inventory/:id
router.delete('/:id', authenticate, authorize('admin', 'shop_manager'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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

  const newQuantity = product.quantity + quantity;

  const [updated] = await Promise.all([
    prisma.product.update({
      where: { id: productId },
      data: { quantity: newQuantity, status: 'available' },
    }),
    prisma.stockHistory.create({
      data: {
        product_id: productId,
        previous_quantity: product.quantity,
        new_quantity: newQuantity,
        change_amount: quantity,
        reason: 'restock',
        notes: notes || 'Manual restock',
        created_by: req.user?.id,
      },
    }),
  ]);

  sendSuccess(res, updated, 'Product restocked successfully');
}));

// GET /api/inventory/:id/history
router.get('/:id/history', authenticate, authorize('admin', 'shop_manager'), validateIdParam, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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
