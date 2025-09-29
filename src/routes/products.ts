import { Router, Request, Response } from 'express';
import { Product } from '../models/Product';
import {
  validateIdParam,
  validateProductCreation,
  validatePagination,
} from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { CreateProductRequest, UpdateProductRequest, StockUpdateRequest } from '../types/product';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// Valid categories for the e-commerce app
const VALID_CATEGORIES = ['irrigation', 'harvesting', 'containers', 'pest-management'];

// Middleware to validate category
const validateCategory = (req: Request, res: Response, next: Function): void => {
  const category = req.query.category as string;
  if (category && !VALID_CATEGORIES.includes(category.toLowerCase())) {
    sendError(res, `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`, 400);
    return;
  }
  next();
};

/**
 * @route   GET /api/products
 * @desc    Get all products with filters and pagination
 * @access  Public
 */
router.get(
  '/',
  validatePagination,
  validateCategory,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      // Build filter object
      const filter: any = { status: { $ne: 'discontinued' } };

      // Add category filter if provided
      if (req.query.category) {
        filter.category = req.query.category;
      }

      // Add supplier filter if provided
      if (req.query.supplier_id) {
        filter.supplier_id = req.query.supplier_id;
      }

      // Add status filter if provided (override default)
      if (req.query.status) {
        filter.status = req.query.status;
      }

      // Add price range filters if provided
      if (req.query.price_min || req.query.price_max) {
        filter.price = {};
        if (req.query.price_min) {
          filter.price.$gte = parseFloat(req.query.price_min as string);
        }
        if (req.query.price_max) {
          filter.price.$lte = parseFloat(req.query.price_max as string);
        }
      }

      // Add in_stock filter
      if (req.query.in_stock === 'true') {
        filter.quantity = { $gt: 0 };
        filter.status = 'available';
      } else if (req.query.in_stock === 'false') {
        filter.$or = [{ quantity: 0 }, { status: 'out_of_stock' }];
      }

      // Add search filter if provided
      if (req.query.search) {
        const searchRegex = new RegExp(req.query.search as string, 'i');
        filter.$or = [
          { name: searchRegex },
          { description: searchRegex },
          { brand: searchRegex },
        ];
      }

      // Get products with pagination
      const products = await Product.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 });

      // Get total count for pagination
      const total = await Product.countDocuments(filter);

      // Transform products to public JSON
      const productData = products.map((product) => product.toPublicJSON());

      sendPaginatedResponse(res, productData, total, page, limit, 'Products retrieved successfully');
      return;
    } catch (error) {
      sendError(res, 'Failed to retrieve products', 500);
      return;
    }
  })
);

/**
 * @route   GET /api/products/:id
 * @desc    Get product by ID
 * @access  Public
 */
router.get(
  '/:id',
  validateIdParam,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const productId = req.params.id;

      const product = await Product.findById(productId);
      if (!product) {
        sendNotFound(res, 'Product not found');
        return;
      }

      sendSuccess(res, product.toPublicJSON(), 'Product retrieved successfully');
      return;
    } catch (error) {
      sendError(res, 'Failed to retrieve product', 500);
      return;
    }
  })
);

/**
 * @route   POST /api/products
 * @desc    Create new product (admin and shop managers only)
 * @access  Private (Admin and shop managers)
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'shop_manager'),
  validateProductCreation,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const productData: CreateProductRequest = req.body;

      // Check for duplicate product name
      const existingProduct = await Product.findOne({ name: productData.name });
      if (existingProduct) {
        sendError(res, 'Product name already exists', 400);
        return;
      }

      // Create product
      const product = new Product(productData);
      await product.save();

      sendCreated(res, product.toPublicJSON(), 'Product created successfully');
      return;
    } catch (error) {
      sendError(res, 'Failed to create product', 500);
      return;
    }
  })
);

/**
 * @route   PUT /api/products/:id
 * @desc    Update product (admin and shop managers only)
 * @access  Private (Admin and shop managers)
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'shop_manager'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const productId = req.params.id;
      const updateData: UpdateProductRequest = req.body;

      // Check for duplicate name (if updated)
      if (updateData.name) {
        const existingProduct = await Product.findOne({
          name: updateData.name,
          _id: { $ne: productId },
        });
        if (existingProduct) {
          sendError(res, 'Product name already exists', 400);
          return;
        }
      }

      // Update product
      const product = await Product.findByIdAndUpdate(productId, updateData, {
        new: true,
        runValidators: true,
      });

      if (!product) {
        sendNotFound(res, 'Product not found');
        return;
      }

      sendSuccess(res, product.toPublicJSON(), 'Product updated successfully');
      return;
    } catch (error) {
      sendError(res, 'Failed to update product', 500);
      return;
    }
  })
);

/**
 * @route   DELETE /api/products/:id
 * @desc    Delete product (admin only)
 * @access  Private (Admin only)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const productId = req.params.id;

      // Instead of deleting, mark as discontinued
      const product = await Product.findByIdAndUpdate(
        productId,
        { status: 'discontinued' },
        { new: true }
      );

      if (!product) {
        sendNotFound(res, 'Product not found');
        return;
      }

      sendSuccess(res, product.toPublicJSON(), 'Product discontinued successfully');
      return;
    } catch (error) {
      sendError(res, 'Failed to discontinue product', 500);
      return;
    }
  })
);

/**
 * @route   PUT /api/products/:id/stock
 * @desc    Update product stock (admin and shop managers only)
 * @access  Private (Admin and shop managers)
 */
router.put(
  '/:id/stock',
  authenticate,
  authorize('admin', 'shop_manager'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const productId = req.params.id;
      const { quantity }: StockUpdateRequest = req.body;

      // Validate quantity
      if (!Number.isInteger(quantity) || quantity < 0) {
        sendError(res, 'Quantity must be a non-negative integer', 400);
        return;
      }

      // Update product stock
      const product = await Product.findByIdAndUpdate(
        productId,
        {
          quantity,
          status: quantity > 0 ? 'available' : 'out_of_stock',
        },
        { new: true, runValidators: true }
      );

      if (!product) {
        sendNotFound(res, 'Product not found');
        return;
      }

      sendSuccess(res, product.toPublicJSON(), 'Product stock updated successfully');
      return;
    } catch (error) {
      sendError(res, 'Failed to update product stock', 500);
      return;
    }
  })
);

export default router;