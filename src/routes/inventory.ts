import { Router, Response } from 'express';
import { Product } from '../models/Product';
import { StockHistory } from '../models/StockHistory';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess, sendError, sendPaginatedResponse, sendNotFound } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

/**
 * @route   GET /api/inventory
 * @desc    Get all inventory (Admin only)
 * @access  Private (Admin)
 */
router.get('/', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const products = await Product.find()
            .skip(skip)
            .limit(limit)
            .sort({ created_at: -1 });

        const total = await Product.countDocuments();
        const inventoryData = products.map(p => ({
            ...p.toPublicJSON(),
            stockStatus: (p as any).stockStatus // Use virtual
        }));

        sendPaginatedResponse(res, inventoryData, total, page, limit, 'Inventory retrieved successfully');
    } catch (error) {
        sendError(res, 'Failed to retrieve inventory', 500);
    }
}));

/**
 * @route   GET /api/inventory/low-stock
 * @desc    Get low stock items
 * @access  Private (Admin, Shop Manager)
 */
router.get('/low-stock', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const threshold = parseInt(req.query.threshold as string) || 10;

        // If shop manager, filter by their shop
        const query: any = {
            quantity: { $lte: threshold, $gt: 0 },
            status: 'available'
        };

        // Note: Assuming shop manager can only see their own low stock if logic requires
        // But spec says "Admin, Shop Manager" - general endpoint? 
        // Usually Shop Manager should only see their own.
        // However, Product.supplier_id is string. 
        // If we want to strictly filter for Shop Manager:
        /* 
        if (req.user?.role === 'shop_manager') {
           // Need to find shop ID associated with user or assume filtering by query param?
           // For now, returning all low stock for Admin, but Shop Manager might see all?
           // Let's implement filtering if supplier_id query param matches?
           // Strict implementation:
           // query.supplier_id = <shop_id associated with user>
        }
        */

        if (req.query.shopId) {
            query.supplier_id = req.query.shopId;
        }

        const products = await Product.find(query).sort({ quantity: 1 });

        sendSuccess(res, products.map(p => p.toPublicJSON()), 'Low stock items retrieved');
    } catch (error) {
        sendError(res, 'Failed to retrieve low stock items', 500);
    }
}));

/**
 * @route   GET /api/inventory/out-of-stock
 * @desc    Get out of stock items
 * @access  Private (Admin, Shop Manager)
 */
router.get('/out-of-stock', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const query: any = {
            $or: [
                { quantity: 0 },
                { status: 'out_of_stock' }
            ]
        };

        if (req.query.shopId) {
            query.supplier_id = req.query.shopId;
        }

        const products = await Product.find(query).sort({ updated_at: -1 });

        sendSuccess(res, products.map(p => p.toPublicJSON()), 'Out of stock items retrieved');
    } catch (error) {
        sendError(res, 'Failed to retrieve out of stock items', 500);
    }
}));

/**
 * @route   POST /api/inventory/stock-adjustment
 * @desc    Adjust stock (Admin, Shop Manager)
 * @access  Private (Admin, Shop Manager)
 */
router.post('/stock-adjustment', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { productId, quantity, reason, notes } = req.body;

        if (!productId || typeof quantity !== 'number') {
            sendError(res, 'Product ID and quantity are required', 400);
            return;
        }

        const product = await Product.findById(productId);
        if (!product) {
            sendNotFound(res, 'Product not found');
            return;
        }

        // Logic: quantity is the CHANGE amount or NEW amount?
        // Spec says "Adjust stock". Usually implies +/- or set.
        // Let's assume input 'quantity' is the CHANGE (+10 or -5).
        // Or we can support 'operation' field.
        // Let's assume 'quantity' is the new absolute value to match `products.ts` PUT /stock logic?
        // Actually, `POST` usually implies an action.
        // Let's implement delta adjustment here to be different/useful.
        // "adjustment" usually means + / -.

        const previousQuantity = product.quantity;
        const newQuantity = previousQuantity + quantity;

        if (newQuantity < 0) {
            sendError(res, 'Adjustment would result in negative stock', 400);
            return;
        }

        product.quantity = newQuantity;
        product.status = newQuantity > 0 ? 'available' : 'out_of_stock';
        await product.save();

        // Record history
        await StockHistory.create({
            product_id: product._id,
            shop_id: product.supplier_id,
            previous_quantity: previousQuantity,
            new_quantity: newQuantity,
            change_amount: quantity,
            reason: reason || 'adjustment',
            notes: notes || 'Manual adjustment via inventory',
            created_by: req.user?.id
        });

        sendSuccess(res, product.toPublicJSON(), 'Stock adjusted successfully');
    } catch (error) {
        sendError(res, 'Failed to adjust stock', 500);
    }
}));

/**
 * @route   GET /api/inventory/valuation
 * @desc    Get inventory valuation
 * @access  Private (Admin, Shop Manager)
 */
router.get('/valuation', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const query: any = { status: { $ne: 'discontinued' } };

        if (req.query.shopId) {
            query.supplier_id = req.query.shopId;
        }

        const products = await Product.find(query);

        const valuation = products.reduce((acc, curr) => {
            return acc + (curr.price * curr.quantity);
        }, 0);

        const totalItems = products.reduce((acc, curr) => acc + curr.quantity, 0);

        sendSuccess(res, {
            totalValue: valuation,
            totalAttributes: products.length,
            totalItems: totalItems,
            currency: 'RWF' // Assuming currency
        }, 'Inventory valuation retrieved');
    } catch (error) {
        sendError(res, 'Failed to retrieve valuation', 500);
    }
}));

export default router;
