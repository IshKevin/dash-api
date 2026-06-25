import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize, adminOnly } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// GET /api/procurement - List PurchaseOrders with supplier relation
router.get(
  '/',
  authenticate,
  authorize('admin', 'shop_manager'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const { status, supplier_id } = req.query;

    const where: Record<string, any> = {};
    if (status) where.status = status;
    if (supplier_id) where.supplier_id = supplier_id;

    const [purchaseOrders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: { supplier: true },
        orderBy: { order_date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    return sendPaginatedResponse(res, purchaseOrders, total, page, limit, 'Purchase orders retrieved successfully');
  })
);

// POST /api/procurement - Create a new PurchaseOrder
router.post(
  '/',
  authenticate,
  authorize('admin', 'shop_manager'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { supplier_id, items, expected_date, notes } = req.body;

    if (!supplier_id || !items || !Array.isArray(items) || items.length === 0) {
      return sendError(res, 'supplier_id and items array are required', 400 as any);
    }

    const supplier = await prisma.supplier.findUnique({ where: { id: supplier_id } });
    if (!supplier) {
      return sendNotFound(res, 'Supplier not found');
    }

    const po_number = 'PO-' + Date.now();

    const itemsWithTotals = items.map((item: any) => {
      const total_price = item.quantity_ordered * item.unit_price;
      return { ...item, total_price };
    });

    const total_amount = itemsWithTotals.reduce((sum: number, item: any) => sum + item.total_price, 0);

    const purchaseOrder = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          po_number,
          supplier_id,
          total_amount,
          expected_date: expected_date ? new Date(expected_date) : undefined,
          notes: notes ?? undefined,
          created_by: req.user?.id ?? undefined,
          items: {
            create: itemsWithTotals.map((item: any) => ({
              product_name: item.product_name,
              product_id: item.product_id ?? undefined,
              quantity_ordered: item.quantity_ordered,
              unit_price: item.unit_price,
              total_price: item.total_price,
            })),
          },
        },
        include: {
          items: true,
          supplier: true,
        },
      });
      return po;
    });

    return sendCreated(res, purchaseOrder, 'Purchase order created successfully');
  })
);

// GET /api/procurement/:id - Get a PurchaseOrder with items, supplier, receipts
router.get(
  '/:id',
  authenticate,
  authorize('admin', 'shop_manager'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: true,
        supplier: true,
        receipts: {
          include: { items: true },
        },
      },
    });

    if (!purchaseOrder) {
      return sendNotFound(res, 'Purchase order not found');
    }

    return sendSuccess(res, purchaseOrder, 'Purchase order retrieved successfully');
  })
);

// PUT /api/procurement/:id - Update a PurchaseOrder (only if draft)
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'shop_manager'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { expected_date, notes } = req.body;

    const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!purchaseOrder) {
      return sendNotFound(res, 'Purchase order not found');
    }

    if (purchaseOrder.status !== 'draft') {
      return sendError(res, 'Purchase order cannot be modified after submission', 400 as any);
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        expected_date: expected_date !== undefined ? new Date(expected_date) : undefined,
        notes: notes !== undefined ? notes : undefined,
      },
      include: { items: true, supplier: true },
    });

    return sendSuccess(res, updated, 'Purchase order updated successfully');
  })
);

// PUT /api/procurement/:id/submit - Submit a PurchaseOrder (draft -> submitted)
router.put(
  '/:id/submit',
  authenticate,
  authorize('admin', 'shop_manager'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!purchaseOrder) {
      return sendNotFound(res, 'Purchase order not found');
    }

    if (purchaseOrder.status !== 'draft') {
      return sendError(res, 'Purchase order must be in draft status to submit', 400 as any);
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'submitted' },
      include: { items: true, supplier: true },
    });

    return sendSuccess(res, updated, 'Purchase order submitted successfully');
  })
);

// PUT /api/procurement/:id/approve - Approve a PurchaseOrder (submitted -> approved)
router.put(
  '/:id/approve',
  authenticate,
  adminOnly,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!purchaseOrder) {
      return sendNotFound(res, 'Purchase order not found');
    }

    if (purchaseOrder.status !== 'submitted') {
      return sendError(res, 'Purchase order must be in submitted status to approve', 400 as any);
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'approved',
        approved_by: req.user?.id ?? undefined,
      },
      include: { items: true, supplier: true },
    });

    return sendSuccess(res, updated, 'Purchase order approved successfully');
  })
);

// PUT /api/procurement/:id/cancel - Cancel a PurchaseOrder
router.put(
  '/:id/cancel',
  authenticate,
  adminOnly,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!purchaseOrder) {
      return sendNotFound(res, 'Purchase order not found');
    }

    if (purchaseOrder.status === 'fully_received') {
      return sendError(res, 'Cannot cancel a fully received purchase order', 400 as any);
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'cancelled' },
      include: { items: true, supplier: true },
    });

    return sendSuccess(res, updated, 'Purchase order cancelled successfully');
  })
);

// POST /api/procurement/:id/receive - Receive goods against a PurchaseOrder
router.post(
  '/:id/receive',
  authenticate,
  authorize('admin', 'shop_manager'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { notes, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return sendError(res, 'items array is required', 400 as any);
    }

    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!purchaseOrder) {
      return sendNotFound(res, 'Purchase order not found');
    }

    if (purchaseOrder.status !== 'approved' && purchaseOrder.status !== 'ordered') {
      return sendError(res, 'Purchase order must be approved or ordered to receive goods', 400 as any);
    }

    const receipt_number = 'GR-' + Date.now();

    const goodsReceipt = await prisma.$transaction(async (tx) => {
      // Create GoodsReceipt and GoodsReceiptItems
      const receipt = await tx.goodsReceipt.create({
        data: {
          receipt_number,
          purchase_order_id: id,
          received_by: req.user?.id ?? undefined,
          notes: notes ?? undefined,
          items: {
            create: items.map((item: any) => ({
              product_name: item.product_name,
              product_id: item.product_id ?? undefined,
              quantity: item.quantity,
              unit_price: item.unit_price,
              notes: item.notes ?? undefined,
            })),
          },
        },
        include: { items: true },
      });

      // Update product quantities for items with a product_id
      for (const item of items) {
        if (item.product_id) {
          await tx.product.update({
            where: { id: item.product_id },
            data: { quantity: { increment: item.quantity } },
          });
        }
      }

      // Update quantity_received on PO items and recalculate PO status
      for (const receiptItem of items) {
        const matchingPoItem = purchaseOrder.items.find(
          (pi) =>
            (receiptItem.product_id && pi.product_id === receiptItem.product_id) ||
            pi.product_name === receiptItem.product_name
        );
        if (matchingPoItem) {
          await tx.purchaseOrderItem.update({
            where: { id: matchingPoItem.id },
            data: {
              quantity_received: {
                increment: receiptItem.quantity,
              },
            },
          });
        }
      }

      // Reload PO items to check totals
      const updatedPoItems = await tx.purchaseOrderItem.findMany({
        where: { purchase_order_id: id },
      });

      const totalOrdered = updatedPoItems.reduce((sum, item) => sum + item.quantity_ordered, 0);
      const totalReceived = updatedPoItems.reduce((sum, item) => sum + item.quantity_received, 0);

      let newStatus: 'partially_received' | 'fully_received' = 'partially_received';
      if (totalReceived >= totalOrdered) {
        newStatus = 'fully_received';
      }

      await tx.purchaseOrder.update({
        where: { id },
        data: { status: newStatus },
      });

      return receipt;
    });

    return sendCreated(res, goodsReceipt, 'Goods receipt created successfully');
  })
);

// GET /api/procurement/:id/receipts - List GoodsReceipts for a PurchaseOrder
router.get(
  '/:id/receipts',
  authenticate,
  authorize('admin', 'shop_manager'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!purchaseOrder) {
      return sendNotFound(res, 'Purchase order not found');
    }

    const receipts = await prisma.goodsReceipt.findMany({
      where: { purchase_order_id: id },
      include: { items: true },
      orderBy: { received_date: 'desc' },
    });

    return sendSuccess(res, receipts, 'Goods receipts retrieved successfully');
  })
);

export default router;
