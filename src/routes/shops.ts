import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError, sendCreated, sendNotFound } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// Temporary in-memory storage for shops (replace with database model later)
interface Shop {
  id: number;
  shopName: string;
  description: string;
  province: string;
  district: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

let shops: Shop[] = [];
let nextShopId = 1; // Auto-incrementing ID counter

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
 * @route   POST /api/addshops/addshop
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

    // Use auto-incrementing integer ID
    const shopId = nextShopId++;

    const newShop: Shop = {
      id: shopId,
      shopName,
      description,
      province,
      district,
      ownerName,
      ownerEmail,
      ownerPhone,
      createdBy: req.user?.id || '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    shops.push(newShop);

    sendCreated(res, newShop, 'Shop created successfully');
  } catch (error: any) {
    console.error('Error creating shop:', error);
    sendError(res, 'Failed to create shop', 500);
  }
}));

/**
 * @route   GET /api/addshops
 * @desc    Get all shops (Admin sees all, Shop Manager sees only shops created by admin)
 * @access  Private (Admin, Shop Manager)
 */
router.get('/', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const filteredShops = shops;

    // Shop managers can only see shops (all shops are created by admin, so they see all)
    // If you want to filter by specific criteria, add logic here
    
    sendSuccess(res, filteredShops, 'Shops retrieved successfully');
  } catch (error: any) {
    console.error('Error retrieving shops:', error);
    sendError(res, 'Failed to retrieve shops', 500);
  }
}));

/**
 * @route   GET /api/addshops/:id
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
    
    const shop = shops.find(s => s.id === shopId);

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
 * @route   PUT /api/addshops/:id
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
    
    const shopIndex = shops.findIndex(s => s.id === shopId);

    if (shopIndex === -1) {
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
    const updatedShop = {
      ...shops[shopIndex],
      ...(shopName && { shopName }),
      ...(description && { description }),
      ...(province && { province }),
      ...(district && { district }),
      ...(ownerName && { ownerName }),
      ...(ownerEmail && { ownerEmail }),
      ...(ownerPhone && { ownerPhone }),
      updatedAt: new Date()
    };

    shops[shopIndex] = updatedShop;

    sendSuccess(res, updatedShop, 'Shop updated successfully');
  } catch (error: any) {
    console.error('Error updating shop:', error);
    sendError(res, 'Failed to update shop', 500);
  }
}));

/**
 * @route   DELETE /api/addshops/:id
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
    
    const shopIndex = shops.findIndex(s => s.id === shopId);

    if (shopIndex === -1) {
      sendNotFound(res, 'Shop not found');
      return;
    }

    const deletedShop = shops[shopIndex];
    shops.splice(shopIndex, 1);

    sendSuccess(res, deletedShop, 'Shop deleted successfully');
  } catch (error: any) {
    console.error('Error deleting shop:', error);
    sendError(res, 'Failed to delete shop', 500);
  }
}));

console.log('🏪 Shop management routes module loaded');

export default router;
