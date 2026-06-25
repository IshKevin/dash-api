import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { sendSuccess, sendCreated, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

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

  if (!product_id || !quantity || quantity < 1) {
    return sendError(res, 'product_id and a positive quantity are required', 400 as any);
  }

  const product = await prisma.product.findUnique({ where: { id: product_id } });
  if (!product) {
    return sendNotFound(res, 'Product not found');
  }
  if (product.status !== 'available') {
    return sendError(res, 'Product is not available', 400 as any);
  }
  if (product.quantity < quantity) {
    return sendError(res, `Insufficient stock. Only ${product.quantity} units available`, 400 as any);
  }

  const cart = await prisma.cart.upsert({
    where: { user_id },
    create: { user_id },
    update: {},
    select: { id: true },
  });

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
router.post('/checkout', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user_id = req.user!.id;
  const { payment_method, shipping_address, notes, customer_id } = req.body;

  if (!shipping_address) {
    return sendError(res, 'shipping_address is required', 400 as any);
  }
  if (!customer_id) {
    return sendError(res, 'customer_id is required', 400 as any);
  }

  const cart = await prisma.cart.findUnique({
    where: { user_id },
    include: cartInclude,
  });

  if (!cart || cart.items.length === 0) {
    return sendError(res, 'Cart is empty', 400 as any);
  }

  // Verify all products are available with sufficient stock
  for (const item of cart.items) {
    if (item.product.status !== 'available') {
      return sendError(res, `Product "${item.product.name}" is no longer available`, 400 as any);
    }
    if (item.product.quantity < item.quantity) {
      return sendError(
        res,
        `Insufficient stock for "${item.product.name}". Only ${item.product.quantity} units available`,
        400 as any
      );
    }
  }

  const subtotal = cart.items.reduce((sum, item) => sum + item.quantity * item.product.price, 0);
  const total = subtotal;
  const order_number = 'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        order_number,
        customer_id,
        subtotal,
        total_amount: total,
        status: 'pending',
        payment_method: payment_method || 'cash',
        shipping_address,
        notes: notes || null,
      },
    });

    await tx.orderItem.createMany({
      data: cart.items.map((item) => ({
        order_id: newOrder.id,
        product_id: item.product_id,
        product_name: item.product.name,
        unit_price: item.product.price,
        quantity: item.quantity,
        total_price: item.quantity * item.product.price,
      })),
    });

    for (const item of cart.items) {
      await tx.product.update({
        where: { id: item.product_id },
        data: { quantity: { decrement: item.quantity } },
      });
    }

    await tx.cartItem.deleteMany({ where: { cart_id: cart.id } });

    return tx.order.findUnique({
      where: { id: newOrder.id },
      include: { items: true },
    });
  });

  return sendCreated(res, { order }, 'Order placed successfully');
}));

export default router;
