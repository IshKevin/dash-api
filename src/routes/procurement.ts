import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize, adminOnly } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { requireManagedShop } from '../utils/shopScope';

const router = Router();

/**
 * Loads a purchase order; for shop managers enforces that it belongs to their shop.
 * Sends 403/404 and returns null on failure.
 */
async function loadScopedPO(req: AuthenticatedRequest, res: Response, id: string, include?: any): Promise<any | null> {
  const shopId = await requireManagedShop(req, res);
  if (shopId === undefined) return null;
  const po: any = await prisma.purchaseOrder.findUnique({ where: { id }, include });
  if (!po) {
    sendNotFound(res, 'Purchase order not found');
    return null;
  }
  if (shopId && po.shop_id !== shopId) {
    sendError(res, 'Access denied: this purchase order belongs to another shop', 403);
    return null;
  }
  return po;
}

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

    const shopId = await requireManagedShop(req, res);
    if (shopId === undefined) return;

    const where: Record<string, any> = {};
    if (status) where.status = status;
    if (supplier_id) where.supplier_id = supplier_id;
    if (shopId) where.shop_id = shopId;
    else if (req.query.shop_id) where.shop_id = req.query.shop_id;

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

    const shopId = await requireManagedShop(req, res);
    if (shopId === undefined) return;

    if (!supplier_id || !items || !Array.isArray(items) || items.length === 0) {
      return sendError(res, 'supplier_id and items array are required', 400 as any);
    }
    for (const item of items) {
      if (!item?.product_name || !(Number(item.quantity_ordered) > 0) || !(Number(item.unit_price) >= 0)) {
        return sendError(res, 'Each item needs product_name, a positive quantity_ordered and a non-negative unit_price', 400 as any);
      }
    }

    const supplier = await prisma.supplier.findUnique({ where: { id: supplier_id } });
    if (!supplier) {
      return sendNotFound(res, 'Supplier not found');
    }

    // Shop the goods are for: the manager's own shop; admins may name one (or none).
    const targetShopId = shopId ?? (req.body.shop_id || null);
    if (targetShopId && !(await prisma.shop.findUnique({ where: { id: targetShopId }, select: { id: true } }))) {
      return sendError(res, 'shop_id does not refer to an existing shop', 400 as any);
    }
    // Linked products must belong to that shop (when a shop is set).
    const linkedIds = items.map((i: any) => i.product_id).filter(Boolean);
    if (linkedIds.length) {
      const products = await prisma.product.findMany({ where: { id: { in: linkedIds } }, select: { id: true, supplier_id: true } });
      if (products.length !== new Set(linkedIds).size) return sendError(res, 'One or more product_id values do not exist', 400 as any);
      if (targetShopId && products.some((p) => p.supplier_id !== targetShopId)) {
        return sendError(res, 'Linked products must belong to the purchasing shop', 403 as any);
      }
    }

    const po_number = 'PO-' + Date.now();

    const itemsWithTotals = items.map((item: any) => {
      const total_price = Number(item.quantity_ordered) * Number(item.unit_price);
      return { ...item, total_price };
    });

    const total_amount = itemsWithTotals.reduce((sum: number, item: any) => sum + item.total_price, 0);

    const purchaseOrder = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          po_number,
          supplier_id,
          shop_id: targetShopId,
          total_amount,
          expected_date: expected_date ? new Date(expected_date) : undefined,
          notes: notes ?? undefined,
          created_by: req.user?.id ?? undefined,
          items: {
            create: itemsWithTotals.map((item: any) => ({
              product_name: item.product_name,
              product_id: item.product_id ?? undefined,
              quantity_ordered: Number(item.quantity_ordered),
              unit_price: Number(item.unit_price),
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

    const purchaseOrder = await loadScopedPO(req, res, id, {
      items: true,
      supplier: true,
      receipts: { include: { items: true } },
    });
    if (!purchaseOrder) return;

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

    const purchaseOrder = await loadScopedPO(req, res, id);
    if (!purchaseOrder) return;

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

    const purchaseOrder = await loadScopedPO(req, res, id);
    if (!purchaseOrder) return;

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

    const purchaseOrder = await loadScopedPO(req, res, id);
    if (!purchaseOrder) return;

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
  authorize('admin', 'shop_manager'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const purchaseOrder = await loadScopedPO(req, res, id);
    if (!purchaseOrder) return;

    if (purchaseOrder.status === 'fully_received' || purchaseOrder.status === 'cancelled') {
      return sendError(res, `Cannot cancel a ${purchaseOrder.status.replace('_', ' ')} purchase order`, 400 as any);
    }
    // Shop managers may only withdraw their own PO before it is approved.
    if (req.user?.role === 'shop_manager' && !['draft', 'submitted'].includes(purchaseOrder.status)) {
      return sendError(res, 'Only draft or submitted purchase orders can be cancelled by a shop manager', 403 as any);
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

    const purchaseOrder = await loadScopedPO(req, res, id, { items: true });
    if (!purchaseOrder) return;

    if (!['approved', 'ordered', 'partially_received'].includes(purchaseOrder.status)) {
      return sendError(res, 'Purchase order must be approved, ordered or partially received to receive goods', 400 as any);
    }

    // Match each receipt line to a PO line and refuse over-receipt.
    const remaining = new Map<string, number>(
      purchaseOrder.items.map((pi: any) => [pi.id, pi.quantity_ordered - pi.quantity_received])
    );
    const lines: Array<{ item: any; poItem: any; productId: string | null; quantity: number }> = [];
    for (const item of items) {
      const quantity = Number(item?.quantity);
      if (!(quantity > 0)) return sendError(res, 'Each received item needs a positive quantity', 400 as any);
      const poItem = purchaseOrder.items.find(
        (pi: any) => (item.product_id && pi.product_id === item.product_id) || (item.product_name && pi.product_name === item.product_name)
      );
      if (!poItem) {
        return sendError(res, `Item "${item.product_name || item.product_id}" is not on this purchase order`, 400 as any);
      }
      const left = remaining.get(poItem.id)!;
      if (quantity > left + 1e-9) {
        return sendError(res, `Cannot receive ${quantity} of "${poItem.product_name}": only ${left} outstanding`, 400 as any);
      }
      remaining.set(poItem.id, left - quantity);
      lines.push({ item, poItem, productId: item.product_id || poItem.product_id || null, quantity });
    }

    // Stock can only be added to products of the purchasing shop.
    const productIds = lines.map((l) => l.productId).filter(Boolean) as string[];
    if (productIds.length) {
      const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, supplier_id: true } });
      if (products.length !== new Set(productIds).size) return sendError(res, 'One or more product_id values do not exist', 400 as any);
      if (purchaseOrder.shop_id && products.some((p) => p.supplier_id !== purchaseOrder.shop_id)) {
        return sendError(res, 'Received products must belong to the purchasing shop', 403 as any);
      }
    }

    const receipt_number = 'GR-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

    const goodsReceipt = await prisma.$transaction(async (tx) => {
      // Guard against concurrent receipts against a PO that just became fully received/cancelled.
      const fresh = await tx.purchaseOrder.findUnique({ where: { id }, select: { status: true } });
      if (!fresh || !['approved', 'ordered', 'partially_received'].includes(fresh.status)) {
        throw Object.assign(new Error('Purchase order can no longer receive goods'), { statusCode: 409 });
      }

      const receipt = await tx.goodsReceipt.create({
        data: {
          receipt_number,
          purchase_order_id: id,
          received_by: req.user?.id ?? undefined,
          notes: notes ?? undefined,
          items: {
            create: lines.map(({ item, poItem, productId, quantity }) => ({
              product_name: item.product_name || poItem.product_name,
              product_id: productId ?? undefined,
              quantity,
              unit_price: item.unit_price !== undefined ? Number(item.unit_price) : poItem.unit_price,
              notes: item.notes ?? undefined,
            })),
          },
        },
        include: { items: true },
      });

      for (const { poItem, productId, quantity } of lines) {
        const updatedPoItem = await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: { quantity_received: { increment: quantity } },
        });
        if (updatedPoItem.quantity_received > updatedPoItem.quantity_ordered + 1e-9) {
          throw Object.assign(new Error(`Over-receipt of "${poItem.product_name}"`), { statusCode: 409 });
        }

        if (productId) {
          const qty = Math.round(quantity);
          const product = await tx.product.update({
            where: { id: productId },
            data: { quantity: { increment: qty } },
          });
          if (product.status === 'out_of_stock' && product.quantity > 0) {
            await tx.product.update({ where: { id: productId }, data: { status: 'available' } });
          }
          const sup = await tx.supplier.findUnique({ where: { id: product.supplier_id }, select: { is_shop_supplier: true } });
          await tx.stockHistory.create({
            data: {
              product_id: productId,
              shop_id: sup?.is_shop_supplier ? product.supplier_id : (purchaseOrder.shop_id ?? null),
              previous_quantity: product.quantity - qty,
              new_quantity: product.quantity,
              change_amount: qty,
              reason: 'restock',
              notes: `Goods receipt ${receipt_number} (PO ${purchaseOrder.po_number})`,
              created_by: req.user?.id,
            },
          });
        }
      }

      // Fully received only when every line is fully received.
      const updatedPoItems = await tx.purchaseOrderItem.findMany({ where: { purchase_order_id: id } });
      const done = updatedPoItems.every((pi) => pi.quantity_received + 1e-9 >= pi.quantity_ordered);

      await tx.purchaseOrder.update({
        where: { id },
        data: { status: done ? 'fully_received' : 'partially_received', ...(done && { received_date: new Date() }) },
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

    const purchaseOrder = await loadScopedPO(req, res, id);
    if (!purchaseOrder) return;

    const receipts = await prisma.goodsReceipt.findMany({
      where: { purchase_order_id: id },
      include: { items: true },
      orderBy: { received_date: 'desc' },
    });

    return sendSuccess(res, receipts, 'Goods receipts retrieved successfully');
  })
);

export default router;
