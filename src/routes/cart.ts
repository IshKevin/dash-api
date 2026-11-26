import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { sendSuccess, sendCreated, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { resolveBuyer, placeOrderTx } from '../utils/commerce';

const router = Router();

const cartInclude = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          price: true,
          quantity: true,
          status: true,
          images: true,
        },
      },
    },
  },
};

function calculateCartTotals(cart: any) {
  const total = cart.items.reduce((sum: number, item: any) => {
    return sum + item.quantity * item.product.price;
  }, 0);
  const item_count = cart.items.reduce((sum: number, item: any) => sum + item.quantity, 0);
  return { total, item_count };
}

// GET /api/cart
router.get('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user_id = req.user!.id;

  const cart = await prisma.cart.upsert({
    where: { user_id },
    create: { user_id },
    update: {},
    include: cartInclude,
  });

  const { total, item_count } = calculateCartTotals(cart);

  return sendSuccess(res, { cart, total, item_count }, 'Cart retrieved successfully');
}));

// POST /api/cart/items
router.post('/items', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user_id = req.user!.id;
  const { product_id, quantity } = req.body;

  if (!product_id || !Number.isInteger(quantity) || quantity < 1) {
    return sendError(res, 'product_id and a positive integer quantity are required', 400 as any);
  }

  const product = await prisma.product.findUnique({ where: { id: product_id } });
  if (!product) {
    return sendNotFound(res, 'Product not found');
  }
  if (product.status !== 'available') {
    return sendError(res, 'Product is not available', 400 as any);
  }

  const cart = await prisma.cart.upsert({
    where: { user_id },
    create: { user_id },
    update: {},
    select: { id: true },
  });

  // Stock must cover what is already in the cart plus what is being added.
  const existingItem = await prisma.cartItem.findUnique({
    where: { cart_id_product_id: { cart_id: cart.id, product_id } },
    select: { quantity: true },
  });
  const alreadyInCart = existingItem?.quantity ?? 0;
  if (alreadyInCart + quantity > product.quantity) {
    return sendError(
      res,
      `Insufficient stock. Only ${product.quantity} units available` + (alreadyInCart ? ` (${alreadyInCart} already in your cart)` : ''),
      400 as any
    );
  }

  await prisma.cartItem.upsert({
    where: { cart_id_product_id: { cart_id: cart.id, product_id } },
    update: { quantity: { increment: quantity } },
    create: { cart_id: cart.id, product_id, quantity },
  });

  const updatedCart = await prisma.cart.findUnique({
    where: { id: cart.id },
    include: cartInclude,
  });

  const { total, item_count } = calculateCartTotals(updatedCart);

  return sendCreated(res, { cart: updatedCart, total, item_count }, 'Item added to cart');
}));

// PUT /api/cart/items/:productId
router.put('/items/:productId', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user_id = req.user!.id;
  const { productId } = req.params;
  const { quantity } = req.body;

  if (quantity === undefined || quantity === null) {
    return sendError(res, 'quantity is required', 400 as any);
  }

  const cart = await prisma.cart.findUnique({ where: { user_id }, select: { id: true } });
  if (!cart) {
    return sendNotFound(res, 'Cart not found');
  }

  const item = await prisma.cartItem.findUnique({
    where: { cart_id_product_id: { cart_id: cart.id, product_id: productId } },
  });
  if (!item) {
    return sendNotFound(res, 'Item not found in cart');
  }

  if (quantity > 0) {
    if (!Number.isInteger(quantity)) {
      return sendError(res, 'quantity must be an integer', 400 as any);
    }
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { quantity: true, status: true } });
    if (!product || product.status !== 'available') {
      return sendError(res, 'Product is not available', 400 as any);
    }
    if (quantity > product.quantity) {
      return sendError(res, `Insufficient stock. Only ${product.quantity} units available`, 400 as any);
    }
  }

  if (quantity <= 0) {
    await prisma.cartItem.delete({
      where: { cart_id_product_id: { cart_id: cart.id, product_id: productId } },
    });
  } else {
    await prisma.cartItem.update({
      where: { cart_id_product_id: { cart_id: cart.id, product_id: productId } },
      data: { quantity },
    });
  }

  const updatedCart = await prisma.cart.findUnique({
    where: { id: cart.id },
    include: cartInclude,
  });

  const { total, item_count } = calculateCartTotals(updatedCart);

  return sendSuccess(res, { cart: updatedCart, total, item_count }, 'Cart item updated');
}));

// DELETE /api/cart/items/:productId
router.delete('/items/:productId', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user_id = req.user!.id;
  const { productId } = req.params;

  const cart = await prisma.cart.findUnique({ where: { user_id }, select: { id: true } });
  if (!cart) {
    return sendNotFound(res, 'Cart not found');
  }

  await prisma.cartItem.deleteMany({
    where: { cart_id: cart.id, product_id: productId },
  });

  return sendSuccess(res, null, 'Item removed from cart');
}));

// DELETE /api/cart
router.delete('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user_id = req.user!.id;

  const cart = await prisma.cart.findUnique({ where: { user_id }, select: { id: true } });
  if (!cart) {
    return sendSuccess(res, null, 'Cart is already empty');
  }

  await prisma.cartItem.deleteMany({ where: { cart_id: cart.id } });

  return sendSuccess(res, null, 'Cart cleared successfully');
}));

// POST /api/cart/checkout
// Body: { shipping_address (required), payment_method?, notes?, customer_id?, farmer_id? }
//  - customer_id omitted → the order is placed for the caller's own Customer record (found or created).
//  - farmer_id (agents/admins) → placed for that farmer's Customer; the caller is recorded as Order.placed_by.
router.post('/checkout', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user_id = req.user!.id;
  const { payment_method, shipping_address, billing_address, notes } = req.body;

  if (!shipping_address || (typeof shipping_address === 'string' && !shipping_address.trim())) {
    return sendError(res, 'shipping_address is required', 400 as any);
  }

  const buyer = await resolveBuyer(req, req.body);

  // Orders store the address as {full_name, phone, street_address, …}, which
  // is what shops read. A plain-text address (the farmer cart sends one) is
  // wrapped with the recipient's name, phone and district so shops can deliver.
  let shippingAddress = shipping_address;
  if (typeof shipping_address === 'string') {
    const recipientId = req.user!.role !== 'farmer' && typeof req.body.farmer_id === 'string' ? req.body.farmer_id : user_id;
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { full_name: true, phone: true, farmer_profile: { select: { province: true, district: true, sector: true } } },
    });
    const p = recipient?.farmer_profile;
    shippingAddress = {
      full_name: recipient?.full_name ?? '',
      phone: recipient?.phone ?? '',
      street_address: shipping_address.trim(),
      city: p?.sector || p?.district || '',
      district: p?.district ?? '',
      province: p?.province ?? '',
      country: 'Rwanda',
    };
  }

  const cart = await prisma.cart.findUnique({
    where: { user_id },
    include: cartInclude,
  });

  if (!cart || cart.items.length === 0) {
    return sendError(res, 'Cart is empty', 400 as any);
  }

  // Stock is re-validated and decremented atomically inside the transaction.
  const order = await prisma.$transaction(async (tx) => {
    const created = await placeOrderTx(tx, {
      buyer,
      lines: cart.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
      shipping_address: shippingAddress,
      billing_address: billing_address ?? shippingAddress,
      payment_method,
      notes: notes || null,
      taxRate: 0,
      actorId: user_id,
    });
    await tx.cartItem.deleteMany({ where: { cart_id: cart.id } });
    return created;
  });

  return sendCreated(res, { order }, 'Order placed successfully');
}));

export default router;
