import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { validateIdParam, validatePagination } from '../middleware/validation';

const router = Router();

function generateTxNumber(): string {
  return `TX-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
}

router.get('/', authenticate, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const where: any = {};

  if (req.user?.role !== 'admin') {
    where.OR = [{ payer_id: req.user?.id }, { payee_id: req.user?.id }];
  } else {
    if (req.query.payer_id) where.payer_id = req.query.payer_id;
    if (req.query.payee_id) where.payee_id = req.query.payee_id;
  }

  if (req.query.type) where.type = req.query.type;
  if (req.query.status) where.status = req.query.status;
  if (req.query.order_id) where.order_id = req.query.order_id;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        payer: { select: { full_name: true, email: true, role: true } },
        payee: { select: { full_name: true, email: true, role: true } },
      },
      skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' },
    }),
    prisma.transaction.count({ where }),
  ]);
  sendPaginatedResponse(res, transactions, total, page, limit, 'Transactions retrieved successfully');
}));

router.get('/summary', authenticate, authorize('admin'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const [byType, byStatus, total] = await Promise.all([
    prisma.transaction.groupBy({ by: ['type'], _count: true, _sum: { amount: true } }),
    prisma.transaction.groupBy({ by: ['status'], _count: true }),
    prisma.transaction.aggregate({ _sum: { amount: true, fees: true, net_amount: true }, _count: true }),
  ]);

  sendSuccess(res, {
    total: { count: total._count, amount: total._sum.amount || 0, fees: total._sum.fees || 0, net: total._sum.net_amount || 0 },
    byType: byType.map(t => ({ type: t.type, count: t._count, amount: t._sum.amount || 0 })),
    byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
  }, 'Transaction summary retrieved successfully');
}));

router.get('/:id', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tx = await prisma.transaction.findUnique({
    where: { id: req.params.id },
    include: {
      payer: { select: { full_name: true, email: true, role: true } },
      payee: { select: { full_name: true, email: true, role: true } },
    },
  });
  if (!tx) { sendNotFound(res, 'Transaction not found'); return; }

  if (req.user?.role !== 'admin' && tx.payer_id !== req.user?.id && tx.payee_id !== req.user?.id) {
    sendError(res, 'Access denied', 403); return;
  }
  sendSuccess(res, tx, 'Transaction retrieved successfully');
}));

router.post('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { order_id, service_request_id, payee_id, amount, currency, type, payment_method, reference_number, description, fees } = req.body;

  if (!payee_id || !amount || !type || !payment_method) {
    sendError(res, 'payee_id, amount, type, and payment_method are required', 400); return;
  }

  const feeAmount = fees || 0;
  const netAmount = amount - feeAmount;

  const tx = await prisma.transaction.create({
    data: {
      transaction_number: generateTxNumber(),
      order_id: order_id || null,
      service_request_id: service_request_id || null,
      payer_id: req.user!.id,
      payee_id, amount, currency: currency || 'RWF',
      type, payment_method, reference_number: reference_number || null,
      description: description || null, fees: feeAmount, net_amount: netAmount,
    },
    include: {
      payer: { select: { full_name: true, email: true } },
      payee: { select: { full_name: true, email: true } },
    },
  });
  sendCreated(res, tx, 'Transaction created successfully');
}));

router.put('/:id/status', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, processed_at } = req.body;
  const validStatuses = ['pending', 'completed', 'failed', 'cancelled', 'processing'];
  if (!validStatuses.includes(status)) { sendError(res, 'Invalid status', 400); return; }

  const tx = await prisma.transaction.update({
    where: { id: req.params.id },
    data: {
      status,
      processed_at: status === 'completed' ? (processed_at ? new Date(processed_at) : new Date()) : undefined,
    },
  }).catch(() => null);
  if (!tx) { sendNotFound(res, 'Transaction not found'); return; }
  sendSuccess(res, tx, 'Transaction status updated successfully');
}));

export default router;
