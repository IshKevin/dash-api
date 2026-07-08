import { Router, Response, Request } from 'express';
import { prisma } from '../lib/prisma';
import { validateIdParam, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// GET /api/suppliers
router.get('/', authenticate, authorize('admin', 'shop_manager'), validatePagination, asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const where: any = {};

  if (req.query.category) where.category = req.query.category as any;
  if (req.query.status) where.status = req.query.status as any;

  if (req.query.search) {
    const s = req.query.search as string;
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { contact_person: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.supplier.count({ where }),
  ]);

  sendPaginatedResponse(res, suppliers, total, page, limit, 'Suppliers retrieved successfully');
}));

// GET /api/suppliers/:id
router.get('/:id', authenticate, validateIdParam, asyncHandler(async (req: Request, res: Response) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: req.params.id },
    include: { products: true },
  });

  if (!supplier) {
    sendNotFound(res, 'Supplier not found');
    return;
  }

  sendSuccess(res, supplier, 'Supplier retrieved successfully');
}));

// POST /api/suppliers
router.post('/', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    name, category, contact_person, email, phone, website, address,
    business_license, tax_id, bank_details, status, rating, payment_terms,
    products_supplied, services_offered, delivery_areas, notes,
  } = req.body;

  if (!name || !category || !contact_person || !email || !phone || !address) {
    sendError(res, 'Name, category, contact person, email, phone, and address are required', 400);
    return;
  }

  const existing = await prisma.supplier.findFirst({ where: { email: email.toLowerCase() } });
  if (existing) {
    sendError(res, 'Supplier with this email already exists', 409);
    return;
  }

  const supplier = await prisma.supplier.create({
    data: {
      name, category: category as any, contact_person, email: email.toLowerCase(), phone, website,
      address, business_license, tax_id, bank_details,
      status: (status || 'pending_approval') as any,
      rating: rating || 0, payment_terms,
      products_supplied: products_supplied || [],
      services_offered: services_offered || [],
      delivery_areas: delivery_areas || [],
      notes,
    },
  });

  sendCreated(res, supplier, 'Supplier created successfully');
}));

// PUT /api/suppliers/bulk — must be defined BEFORE /:id to avoid route shadowing
router.put('/bulk', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { suppliers } = req.body;

  if (!Array.isArray(suppliers) || suppliers.length === 0) {
    sendError(res, 'suppliers must be a non-empty array', 400);
    return;
  }

  const results = await Promise.all(suppliers.map((supplier: any) => {
    if (!supplier.id) return null;
    const { id, email, category, status, ...rest } = supplier;
    const updateData: any = { ...rest };
    if (email) updateData.email = email.toLowerCase();
    if (category) updateData.category = category as any;
    if (status) updateData.status = status as any;

    return prisma.supplier.update({ where: { id }, data: updateData }).catch(() => null);
  }));

  const updated = results.filter(Boolean);
  sendSuccess(res, updated, `${updated.length} of ${suppliers.length} suppliers updated successfully`);
}));

// PUT /api/suppliers/:id
router.put('/:id', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { email, category, status, ...rest } = req.body;
  const updateData: any = { ...rest };

  if (email) {
    const conflict = await prisma.supplier.findFirst({
      where: { email: email.toLowerCase(), id: { not: req.params.id } },
    });
    if (conflict) {
      sendError(res, 'Supplier with this email already exists', 409);
      return;
    }
    updateData.email = email.toLowerCase();
  }
  if (category) updateData.category = category as any;
  if (status) updateData.status = status as any;

  const supplier = await prisma.supplier.update({
    where: { id: req.params.id },
    data: updateData,
  }).catch(() => null);

  if (!supplier) {
    sendNotFound(res, 'Supplier not found');
    return;
  }

  sendSuccess(res, supplier, 'Supplier updated successfully');
}));

// DELETE /api/suppliers/:id
router.delete('/:id', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const supplier = await prisma.supplier.delete({ where: { id: req.params.id } }).catch(() => null);

  if (!supplier) {
    sendNotFound(res, 'Supplier not found');
    return;
  }

  sendSuccess(res, null, 'Supplier deleted successfully');
}));

// GET /api/suppliers/:id/products
router.get('/:id/products', authenticate, authorize('admin', 'shop_manager'), validateIdParam, validatePagination, asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where: { supplier_id: req.params.id },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.product.count({ where: { supplier_id: req.params.id } }),
  ]);

  sendPaginatedResponse(res, products, total, page, limit, 'Supplier products retrieved successfully');
}));

// POST /api/suppliers/:id/evaluations  (authenticate, authorize admin/shop_manager)
router.post('/:id/evaluations', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const supplier = await prisma.supplier.findUnique({ where: { id: req.params.id } });
  if (!supplier) { sendNotFound(res, 'Supplier not found'); return; }

  const { overall_score, quality_score, delivery_score, price_score, service_score, notes } = req.body;
  if (!overall_score || overall_score < 1 || overall_score > 5) {
    sendError(res, 'overall_score must be between 1 and 5', 400);
    return;
  }

  const evaluation = await prisma.supplierEvaluation.create({
    data: {
      supplier_id: req.params.id,
      evaluator_id: req.user!.id,
      overall_score,
      quality_score,
      delivery_score,
      price_score,
      service_score,
      notes,
    },
  });

  // Recalculate supplier average rating
  const avgResult = await prisma.supplierEvaluation.aggregate({
    where: { supplier_id: req.params.id },
    _avg: { overall_score: true },
  });
  await prisma.supplier.update({
    where: { id: req.params.id },
    data: { rating: avgResult._avg.overall_score || 0 },
  });

  sendCreated(res, evaluation, 'Supplier evaluation submitted');
}));

// GET /api/suppliers/:id/evaluations  (authenticate, authorize admin/shop_manager)
router.get('/:id/evaluations', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const [evaluations, total] = await Promise.all([
    prisma.supplierEvaluation.findMany({
      where: { supplier_id: req.params.id },
      include: { evaluator: { select: { full_name: true, role: true } } },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.supplierEvaluation.count({ where: { supplier_id: req.params.id } }),
  ]);

  sendPaginatedResponse(res, evaluations, total, page, limit, 'Evaluations retrieved');
}));

// GET /api/suppliers/:id/history  (authenticate, authorize admin/shop_manager)
router.get('/:id/history', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const [purchaseOrders, evaluations] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { supplier_id: req.params.id },
      select: { id: true, po_number: true, status: true, total_amount: true, order_date: true },
      orderBy: { order_date: 'desc' },
      take: 20,
    }),
    prisma.supplierEvaluation.findMany({
      where: { supplier_id: req.params.id },
      select: { id: true, overall_score: true, created_at: true },
      orderBy: { created_at: 'desc' },
      take: 10,
    }),
  ]);

  const stats = await prisma.purchaseOrder.aggregate({
    where: { supplier_id: req.params.id, status: 'fully_received' },
    _sum: { total_amount: true },
    _count: { _all: true },
  });

  sendSuccess(res, { purchase_orders: purchaseOrders, evaluations, total_orders: stats._count._all, total_value: stats._sum.total_amount || 0 }, 'Supplier history retrieved');
}));

export default router;
