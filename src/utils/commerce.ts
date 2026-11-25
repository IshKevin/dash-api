import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from '../types/auth';

type Tx = Prisma.TransactionClient;

/** Error carrying an HTTP status; the global errorHandler maps `statusCode` to the response. */
export class CommerceError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
  }
}

export const FINAL_ORDER_STATUSES = ['cancelled', 'returned'] as const;
export const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'] as const;
const STAFF_ROLES = ['admin', 'shop_manager'];

export function isStaff(req: AuthenticatedRequest) {
  return STAFF_ROLES.includes(req.user?.role as string);
}

export function generateOrderNumber(): string {
  return `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

/** StockHistory.shop_id: the shop owning the product (shop suppliers share the shop's id). */
async function shopIdForProduct(tx: Tx, supplierId: string): Promise<string | null> {
  const s = await tx.supplier.findUnique({ where: { id: supplierId }, select: { is_shop_supplier: true } });
  return s?.is_shop_supplier ? supplierId : null;
}

// ─── Buyer resolution ────────────────────────────────────────────────────────

interface BuyerIdentity { email: string; name: string; phone: string }

export interface ResolvedBuyer {
  /** Explicit, pre-validated customer id… */
  customerId?: string;
  /** …or the identity whose Customer is found-or-created inside the order transaction. */
  identity?: BuyerIdentity;
  placedBy: string | null;
  note: string | null;
}

/**
 * Works out who an order is for:
 *  - `farmer_id` (agents/admins only): the farmer's own Customer record; the caller is recorded as `placed_by`.
 *  - `customer_id`: staff may use any customer; other roles only a customer whose email matches their own.
 *  - neither: the caller's own Customer record (found or created from their account).
 */
export async function resolveBuyer(req: AuthenticatedRequest, body: any): Promise<ResolvedBuyer> {
  const { customer_id, farmer_id } = body || {};
  const role = req.user!.role;

  if (farmer_id) {
    if (role !== 'agent' && role !== 'admin') {
      throw new CommerceError('Only agents and admins can order on behalf of a farmer', 403);
    }
    const farmer = await prisma.user.findFirst({
      where: { id: String(farmer_id), role: 'farmer' },
      select: { email: true, full_name: true, phone: true },
    });
    if (!farmer) throw new CommerceError('farmer_id must refer to an existing farmer', 400);
    const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { full_name: true } });
    return {
      identity: { email: farmer.email, name: farmer.full_name, phone: farmer.phone || '' },
      placedBy: req.user!.id,
      note: `Placed by ${role} ${me?.full_name || req.user!.email} on behalf of farmer ${farmer.full_name}`,
    };
  }

  if (customer_id) {
    const customer = await prisma.customer.findUnique({ where: { id: String(customer_id) }, select: { id: true, email: true } });
    if (STAFF_ROLES.includes(role)) {
      if (!customer) throw new CommerceError('Customer not found', 404);
    } else if (!customer || customer.email.toLowerCase() !== req.user!.email.toLowerCase()) {
      throw new CommerceError('customer_id must refer to a customer record matching your own account email', 403);
    }
    return { customerId: customer!.id, placedBy: null, note: null };
  }

  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true, full_name: true, phone: true } });
  if (!me) throw new CommerceError('User not found', 404);
  return { identity: { email: me.email, name: me.full_name, phone: me.phone || '' }, placedBy: null, note: null };
}

/** Finds (or creates) the platform-level Customer (shop_id = null) for an email, race-safely. */
export async function findOrCreateCustomer(tx: Tx, identity: BuyerIdentity): Promise<string> {
  const email = identity.email.toLowerCase();
  // Serialise concurrent find-or-create for the same email within this transaction.
  await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${'customer:' + email}))) AS l`;
  const existing = await tx.customer.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, shop_id: null },
    orderBy: { created_at: 'asc' },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.customer.create({
    data: {
      name: identity.name,
      email,
      phone: identity.phone,
      shop_id: null,
      type: 'individual',
      notes: 'Created automatically at checkout',
    },
    select: { id: true },
  });
  return created.id;
}

// ─── Order placement ─────────────────────────────────────────────────────────

export interface PlaceOrderInput {
  buyer: ResolvedBuyer;
  lines: Array<{ product_id: string; quantity: number }>;
  shipping_address: any;
  billing_address?: any;
  payment_method?: string;
  notes?: string | null;
  taxRate?: number;
  actorId: string;
}

/**
 * Creates an order inside `tx`: validates products, decrements stock atomically
 * (conditional update, so concurrent orders cannot oversell), writes StockHistory
 * ('sale') per line and updates the customer's order statistics.
 */
export async function placeOrderTx(tx: Tx, input: PlaceOrderInput) {
  // Merge duplicate lines for the same product
  const qtyByProduct = new Map<string, number>();
  for (const l of input.lines) {
    if (!l.product_id || !Number.isInteger(l.quantity) || l.quantity < 1) {
      throw new CommerceError('Each item must have a valid product_id and a positive integer quantity', 400);
    }
    qtyByProduct.set(l.product_id, (qtyByProduct.get(l.product_id) || 0) + l.quantity);
  }

  const customerId = input.buyer.customerId ?? (await findOrCreateCustomer(tx, input.buyer.identity!));
  const order_number = generateOrderNumber();

  const products = await tx.product.findMany({ where: { id: { in: [...qtyByProduct.keys()] } } });
  const byId = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  const items: any[] = [];
  for (const [productId, quantity] of qtyByProduct) {
    const product = byId.get(productId);
    if (!product) throw new CommerceError(`Product with ID ${productId} not found`, 404);
    if (product.status !== 'available') throw new CommerceError(`Product "${product.name}" is no longer available`, 400);

    // Atomic, conditional decrement: fails (count 0) if stock is insufficient right now.
    const dec = await tx.product.updateMany({
      where: { id: productId, status: 'available', quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (dec.count === 0) {
      const current = await tx.product.findUnique({ where: { id: productId }, select: { quantity: true } });
      throw new CommerceError(`Insufficient stock for "${product.name}". Only ${current?.quantity ?? 0} units available`, 400);
    }
    const after = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { quantity: true } });
    if (after.quantity === 0) {
      await tx.product.update({ where: { id: productId }, data: { status: 'out_of_stock' } });
    }
    await tx.stockHistory.create({
      data: {
        product_id: productId,
        shop_id: await shopIdForProduct(tx, product.supplier_id),
        previous_quantity: after.quantity + quantity,
        new_quantity: after.quantity,
        change_amount: -quantity,
        reason: 'sale',
        notes: `Order ${order_number}`,
        created_by: input.actorId,
      },
    });

    const total_price = product.price * quantity;
    subtotal += total_price;
    items.push({ product_id: productId, product_name: product.name, unit_price: product.price, quantity, total_price });
  }

  const taxAmount = subtotal * (input.taxRate ?? 0);
  const totalAmount = subtotal + taxAmount;
  const notes = [input.buyer.note, input.notes].filter(Boolean).join(' — ') || null;

  const order = await tx.order.create({
    data: {
      order_number,
      customer_id: customerId,
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      status: 'pending',
      payment_method: (input.payment_method || 'cash') as any,
      shipping_address: input.shipping_address,
      billing_address: input.billing_address ?? input.shipping_address,
      notes,
      placed_by: input.buyer.placedBy,
      order_date: new Date(),
      items: { create: items },
    },
    include: { items: true },
  });

  await tx.customer.update({
    where: { id: customerId },
    data: { total_orders: { increment: 1 }, total_spent: { increment: totalAmount }, last_order_date: order.order_date },
  });

  return order;
}

// ─── Status changes (cancel / return restore stock) ─────────────────────────

/**
 * Changes an order's status inside `tx`. Moving to cancelled/returned restores
 * stock (StockHistory 'return') and reverses the customer's statistics exactly
 * once: the conditional update guarantees a concurrent second cancel is a no-op
 * error, and orders already cancelled/returned cannot change status again.
 */
export async function changeOrderStatusTx(tx: Tx, orderId: string, status: string, actorId: string) {
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) throw new CommerceError('Invalid status value', 400);

  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new CommerceError('Order not found', 404);
  if (order.status === status) return order;
  if ((FINAL_ORDER_STATUSES as readonly string[]).includes(order.status)) {
    throw new CommerceError(`Order is already ${order.status}; its status can no longer be changed`, 400);
  }

  const data: any = { status };
  if (status === 'delivered') data.delivered_date = new Date();

  const changed = await tx.order.updateMany({
    where: { id: orderId, status: { notIn: [...FINAL_ORDER_STATUSES] } },
    data,
  });
  if (changed.count === 0) throw new CommerceError('Order status was changed concurrently; reload and retry', 409);

  if ((FINAL_ORDER_STATUSES as readonly string[]).includes(status)) {
    for (const item of order.items) {
      const product = await tx.product.update({
        where: { id: item.product_id },
        data: { quantity: { increment: item.quantity } },
      });
      if (product.status === 'out_of_stock' && product.quantity > 0) {
        await tx.product.update({ where: { id: product.id }, data: { status: 'available' } });
      }
      await tx.stockHistory.create({
        data: {
          product_id: product.id,
          shop_id: await shopIdForProduct(tx, product.supplier_id),
          previous_quantity: product.quantity - item.quantity,
          new_quantity: product.quantity,
          change_amount: item.quantity,
          reason: 'return',
          notes: `Order ${order.order_number} ${status}`,
          created_by: actorId,
        },
      });
    }
    const customer = await tx.customer.findUnique({ where: { id: order.customer_id }, select: { total_orders: true, total_spent: true } });
    if (customer) {
      await tx.customer.update({
        where: { id: order.customer_id },
        data: {
          total_orders: Math.max(0, customer.total_orders - 1),
          total_spent: Math.max(0, customer.total_spent - order.total_amount),
        },
      });
    }
  }

  return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
}

/** True if the order contains at least one product belonging to the shop. */
export async function orderTouchesShop(orderId: string, shopId: string): Promise<boolean> {
  const n = await prisma.orderItem.count({ where: { order_id: orderId, product: { supplier_id: shopId } } });
  return n > 0;
}
