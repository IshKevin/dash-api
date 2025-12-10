import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError, sendCreated, sendNotFound, sendPaginatedResponse } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import Shop from '../models/Shop';
import Product from '../models/Product';
import Order from '../models/Order';

const router = Router();

// Validation middleware for shop creation
const validateShopCreation = [
  body('shopName')
    .notEmpty()
    .withMessage('Shop name is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('Shop name must be between 2 and 200 characters')
    .trim(),

  body('description')
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters')
    .trim(),

  body('province')
    .notEmpty()
    .withMessage('Province is required')
    .trim(),

  body('district')
    .notEmpty()
    .withMessage('District is required')
    .trim(),

  body('ownerName')
    .notEmpty()
    .withMessage('Owner name is required')
    .isLength({ min: 2 })
    .withMessage('Owner name must be at least 2 characters')
    .trim(),

  body('ownerEmail')
    .notEmpty()
    .withMessage('Owner email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('ownerPhone')
    .notEmpty()
    .withMessage('Owner phone is required')
    .matches(/^\+?[\d\s\-\(\)]{10,15}$/)
    .withMessage('Phone number must be a valid format with 10-15 digits'),

  (req: any, res: Response, next: Function): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
      return;
    }
    next();
  }
];

// Validation middleware for shop update
const validateShopUpdate = [
  body('shopName')
    .optional()
    .isLength({ min: 2, max: 200 })
    .withMessage('Shop name must be between 2 and 200 characters')
    .trim(),

  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters')
    .trim(),

  body('province')
    .optional()
    .trim(),

  body('district')
    .optional()
    .trim(),

  body('ownerName')
    .optional()
    .isLength({ min: 2 })
    .withMessage('Owner name must be at least 2 characters')
    .trim(),

  body('ownerEmail')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('ownerPhone')
    .optional()
    .matches(/^\+?[\d\s\-\(\)]{10,15}$/)
    .withMessage('Phone number must be a valid format with 10-15 digits'),

  (req: any, res: Response, next: Function): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
      return;
    }
    next();
  }
];

/**
 * @route   POST /api/shops/addshop
 * @desc    Create a new shop (Admin only)
 * @access  Private (Admin only)
 */
router.post('/addshop', authenticate, authorize('admin'), validateShopCreation, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      shopName,
      description,
      province,
      district,
      ownerName,
      ownerEmail,
      ownerPhone
    } = req.body;

    // Get the next auto-incrementing ID
    const shopId = await (Shop as any).getNextId();

    const newShop = new Shop({
      id: shopId,
      shopName,
      description,
      province,
      district,
      ownerName,
      ownerEmail,
      ownerPhone,
      createdBy: req.user?.id
    });

    await newShop.save();

    sendCreated(res, newShop.toObject(), 'Shop created successfully');
  } catch (error: any) {
    console.error('Error creating shop:', error);
    sendError(res, 'Failed to create shop', 500);
  }
}));

/**
 * @route   GET /api/shops
 * @desc    Get all shops (Admin sees all, Shop Manager sees only shops created by admin)
 * @access  Private (Admin, Shop Manager)
 */
router.get('/', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const shops = await Shop.find().sort({ id: 1 }).populate('createdBy', 'full_name email');

    // Shop managers can only see shops (all shops are created by admin, so they see all)
    // If you want to filter by specific criteria, add logic here

    sendSuccess(res, shops, 'Shops retrieved successfully');
  } catch (error: any) {
    console.error('Error retrieving shops:', error);
    sendError(res, 'Failed to retrieve shops', 500);
  }
}));

/**
 * @route   GET /api/shops/:id
 * @desc    Get a single shop by ID
 * @access  Private (Admin, Shop Manager)
 */
router.get('/:id', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const shopId = parseInt(req.params.id || '0', 10);

    if (isNaN(shopId)) {
      sendError(res, 'Invalid shop ID', 400);
      return;
    }

    const shop = await Shop.findOne({ id: shopId }).populate('createdBy', 'full_name email');

    if (!shop) {
      sendNotFound(res, 'Shop not found');
      return;
    }

    sendSuccess(res, shop, 'Shop retrieved successfully');
  } catch (error: any) {
    console.error('Error retrieving shop:', error);
    sendError(res, 'Failed to retrieve shop', 500);
  }
}));

/**
 * @route   PUT /api/shops/:id
 * @desc    Update a shop (Admin and Shop Manager can update)
 * @access  Private (Admin, Shop Manager)
 */
router.put('/:id', authenticate, authorize('admin', 'shop_manager'), validateShopUpdate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const shopId = parseInt(req.params.id || '0', 10);

    if (isNaN(shopId)) {
      sendError(res, 'Invalid shop ID', 400);
      return;
    }

    const shop = await Shop.findOne({ id: shopId });

    if (!shop) {
      sendNotFound(res, 'Shop not found');
      return;
    }

    const {
      shopName,
      description,
      province,
      district,
      ownerName,
      ownerEmail,
      ownerPhone
    } = req.body;

    // Update shop details
    if (shopName) shop.shopName = shopName;
    if (description) shop.description = description;
    if (province) shop.province = province;
    if (district) shop.district = district;
    if (ownerName) shop.ownerName = ownerName;
    if (ownerEmail) shop.ownerEmail = ownerEmail;
    if (ownerPhone) shop.ownerPhone = ownerPhone;

    await shop.save();

    sendSuccess(res, shop.toObject(), 'Shop updated successfully');
  } catch (error: any) {
    console.error('Error updating shop:', error);
    sendError(res, 'Failed to update shop', 500);
  }
}));

/**
 * @route   DELETE /api/shops/:id
 * @desc    Delete a shop (Admin and Shop Manager can delete)
 * @access  Private (Admin, Shop Manager)
 */
router.delete('/:id', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const shopId = parseInt(req.params.id || '0', 10);

    if (isNaN(shopId)) {
      sendError(res, 'Invalid shop ID', 400);
      return;
    }

    const shop = await Shop.findOne({ id: shopId });

    if (!shop) {
      sendNotFound(res, 'Shop not found');
      return;
    }

    const deletedShop = shop.toObject();
    await Shop.deleteOne({ id: shopId });

    sendSuccess(res, deletedShop, 'Shop deleted successfully');
  } catch (error: any) {
    console.error('Error deleting shop:', error);
    sendError(res, 'Failed to delete shop', 500);
  }
}));

// ==========================================
// New Endpoints: Inventory, Orders, Analytics
// ==========================================

/**
 * @route   GET /api/shops/:id/inventory
 * @desc    Get shop inventory (Products belonging to this shop)
 * @access  Private (Admin, Shop Manager)
 */
router.get('/:id/inventory', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const shopId = parseInt(req.params.id || '0', 10);

    if (isNaN(shopId)) {
      sendError(res, 'Invalid shop ID', 400);
      return;
    }

    const shop = await Shop.findOne({ id: shopId });
    if (!shop) {
      sendNotFound(res, 'Shop not found');
      return;
    }

    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Find products where supplier_id matches shop ID (as string)
    // Note: Assuming supplier_id in Product model refers to Shop ID
    const query = { supplier_id: shopId.toString() };

    const products = await Product.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 });

    const total = await Product.countDocuments(query);
    const productData = products.map(p => p.toPublicJSON());

    sendPaginatedResponse(res, productData, total, page, limit, 'Shop inventory retrieved successfully');
  } catch (error: any) {
    console.error('Error retrieving shop inventory:', error);
    sendError(res, 'Failed to retrieve shop inventory', 500);
  }
}));

/**
 * @route   GET /api/shops/:id/orders
 * @desc    Get orders containing products from this shop
 * @access  Private (Admin, Shop Manager)
 */
router.get('/:id/orders', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const shopId = parseInt(req.params.id || '0', 10);

    if (isNaN(shopId)) {
      sendError(res, 'Invalid shop ID', 400);
      return;
    }

    // 1. Get all products for this shop
    const shopProducts = await Product.find({ supplier_id: shopId.toString() }).select('_id');
    const productIds = shopProducts.map(p => p._id.toString());

    if (productIds.length === 0) {
      sendPaginatedResponse(res, [], 0, 1, 20, 'No products found for this shop, so no orders.');
      return;
    }

    // 2. Find orders that contain any of these products
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const query = { 'items.product_id': { $in: productIds } };

    const orders = await Order.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 });

    const total = await Order.countDocuments(query);
    const orderData = orders.map(o => o.toPublicJSON());

    sendPaginatedResponse(res, orderData, total, page, limit, 'Shop orders retrieved successfully');
  } catch (error: any) {
    console.error('Error retrieving shop orders:', error);
    sendError(res, 'Failed to retrieve shop orders', 500);
  }
}));

/**
 * @route   GET /api/shops/:id/analytics
 * @desc    Get shop analytics (Sales, Revenue, etc.)
 * @access  Private (Admin, Shop Manager)
 */
router.get('/:id/analytics', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const shopId = parseInt(req.params.id || '0', 10);

    if (isNaN(shopId)) {
      sendError(res, 'Invalid shop ID', 400);
      return;
    }

    // 1. Get products
    const shopProducts = await Product.find({ supplier_id: shopId.toString() });
    const productIds = shopProducts.map(p => p._id.toString());

    // 2. Get orders with these products
    const orders = await Order.find({
      'items.product_id': { $in: productIds },
      status: { $nin: ['cancelled', 'returned'] } // Only count valid orders
    });

    // 3. Calculate metrics
    let totalRevenue = 0;
    let totalSales = 0;

    // Iterate through orders and sum up only the items belonging to this shop
    orders.forEach(order => {
      order.items.forEach(item => {
        if (productIds.includes(item.product_id)) {
          totalRevenue += item.total_price;
          totalSales += item.quantity;
        }
      });
    });

    const analytics = {
      totalProducts: shopProducts.length,
      totalOrders: orders.length,
      totalSales,
      totalRevenue,
      lowStockProducts: shopProducts.filter(p => p.quantity <= 10).length,
      outOfStockProducts: shopProducts.filter(p => p.quantity === 0).length
    };

    sendSuccess(res, analytics, 'Shop analytics retrieved successfully');
  } catch (error: any) {
    console.error('Error retrieving shop analytics:', error);
    sendError(res, 'Failed to retrieve shop analytics', 500);
  }
}));

console.log('🏪 Shop management routes module loaded');

export default router;
