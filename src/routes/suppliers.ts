import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError, sendPaginatedResponse } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import Supplier from '../models/Supplier';
import Product from '../models/Product';
import Order from '../models/Order';

const router = Router();

/**
 * @route   GET /api/suppliers
 * @desc    Get all suppliers with pagination and filters
 * @access  Private (Admin, Shop Manager)
 */
router.get('/', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            province, 
            district, 
            status, 
            search 
        } = req.query;

        const query: any = {};
        
        if (province) query['address.province'] = province;
        if (district) query['address.district'] = district;
        if (status) query.status = status;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { contact_person: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const suppliers = await Supplier.find(query)
            .sort({ created_at: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        const total = await Supplier.countDocuments(query);

        return sendPaginatedResponse(res, suppliers, total, Number(page), Number(limit), 'Suppliers retrieved successfully');
    } catch (error: any) {
        console.error('Get suppliers error:', error);
        return sendError(res, 'Failed to retrieve suppliers', 500);
    }
}));

/**
 * @route   GET /api/suppliers/:id
 * @desc    Get supplier by ID
 * @access  Private (Admin, Shop Manager)
 */
router.get('/:id', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const supplier = await Supplier.findById(req.params.id);
        
        if (!supplier) {
            return sendError(res, 'Supplier not found', 404);
        }

        return sendSuccess(res, supplier, 'Supplier retrieved successfully');
    } catch (error: any) {
        console.error('Get supplier error:', error);
        return sendError(res, 'Failed to retrieve supplier', 500);
    }
}));

/**
 * @route   POST /api/suppliers
 * @desc    Create new supplier
 * @access  Private (Admin only)
 */
router.post('/', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const supplierData = req.body;

        // Check if supplier with email already exists
        const existingSupplier = await Supplier.findOne({ email: supplierData.email });
        if (existingSupplier) {
            return sendError(res, 'Supplier with this email already exists', 409);
        }

        const supplier = new Supplier(supplierData);
        await supplier.save();

        return sendSuccess(res, supplier, 'Supplier created successfully', 201);
    } catch (error: any) {
        console.error('Create supplier error:', error);
        if (error.name === 'ValidationError') {
            return sendError(res, error.message, 400);
        }
        return sendError(res, 'Failed to create supplier', 500);
    }
}));

/**
 * @route   PUT /api/suppliers/:id
 * @desc    Update supplier
 * @access  Private (Admin only)
 */
router.put('/:id', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const supplierData = req.body;

        const supplier = await Supplier.findById(req.params.id);
        if (!supplier) {
            return sendError(res, 'Supplier not found', 404);
        }

        // Check if email is being changed and if it already exists
        if (supplierData.email && supplierData.email !== supplier.email) {
            const existingSupplier = await Supplier.findOne({ 
                email: supplierData.email, 
                _id: { $ne: req.params.id } 
            });
            if (existingSupplier) {
                return sendError(res, 'Supplier with this email already exists', 409);
            }
        }

        const updatedSupplier = await Supplier.findByIdAndUpdate(
            req.params.id,
            supplierData,
            { new: true, runValidators: true }
        );

        return sendSuccess(res, updatedSupplier, 'Supplier updated successfully');
    } catch (error: any) {
        console.error('Update supplier error:', error);
        if (error.name === 'ValidationError') {
            return sendError(res, error.message, 400);
        }
        return sendError(res, 'Failed to update supplier', 500);
    }
}));

/**
 * @route   DELETE /api/suppliers/:id
 * @desc    Delete supplier
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const supplier = await Supplier.findById(req.params.id);
        if (!supplier) {
            return sendError(res, 'Supplier not found', 404);
        }

        await Supplier.findByIdAndDelete(req.params.id);
        return sendSuccess(res, null, 'Supplier deleted successfully');
    } catch (error: any) {
        console.error('Delete supplier error:', error);
        return sendError(res, 'Failed to delete supplier', 500);
    }
}));

/**
 * @route   GET /api/suppliers/:id/products
 * @desc    Get products from specific supplier
 * @access  Private (Admin, Shop Manager)
 */
router.get('/:id/products', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        const products = await Product.find({ supplier_id: req.params.id })
            .sort({ created_at: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        const total = await Product.countDocuments({ supplier_id: req.params.id });

        return sendPaginatedResponse(res, products, total, Number(page), Number(limit), 'Supplier products retrieved successfully');
    } catch (error: any) {
        console.error('Get supplier products error:', error);
        return sendError(res, 'Failed to retrieve supplier products', 500);
    }
}));

/**
 * @route   GET /api/suppliers/:id/orders
 * @desc    Get orders from specific supplier
 * @access  Private (Admin, Shop Manager)
 */
router.get('/:id/orders', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        // Find orders that contain products from this supplier
        const orders = await Order.aggregate([
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product_id',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            {
                $match: {
                    'productDetails.supplier_id': req.params.id
                }
            },
            { $sort: { created_at: -1 } },
            { $skip: (Number(page) - 1) * Number(limit) },
            { $limit: Number(limit) }
        ]);

        const totalCount = await Order.aggregate([
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product_id',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            {
                $match: {
                    'productDetails.supplier_id': req.params.id
                }
            },
            { $count: 'total' }
        ]);

        const total = totalCount.length > 0 ? totalCount[0].total : 0;

        return sendPaginatedResponse(res, orders, total, Number(page), Number(limit), 'Supplier orders retrieved successfully');
    } catch (error: any) {
        console.error('Get supplier orders error:', error);
        return sendError(res, 'Failed to retrieve supplier orders', 500);
    }
}));

/**
 * @route   GET /api/suppliers/by-location
 * @desc    Get suppliers by location
 * @access  Private (Admin, Shop Manager)
 */
router.get('/by-location', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { province, district } = req.query;

        if (!province) {
            return sendError(res, 'Province is required', 400);
        }

        const query: any = { 'address.province': province };
        if (district) {
            query['address.district'] = district;
        }

        const suppliers = await Supplier.find(query).sort({ name: 1 });

        return sendSuccess(res, suppliers, 'Suppliers by location retrieved successfully');
    } catch (error: any) {
        console.error('Get suppliers by location error:', error);
        return sendError(res, 'Failed to retrieve suppliers by location', 500);
    }
}));

export default router;