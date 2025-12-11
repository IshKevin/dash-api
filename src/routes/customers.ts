import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError, sendPaginatedResponse } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import Customer from '../models/Customer';
import Order from '../models/Order';

const router = Router();

/**
 * @route   GET /api/customers
 * @desc    Get all customers with pagination and filters
 * @access  Private (Admin, Shop Manager)
 */
router.get('/', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            shop_id, 
            status, 
            search 
        } = req.query;

        const query: any = {};
        
        if (shop_id) query.shop_id = shop_id;
        if (status) query.status = status;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        const customers = await Customer.find(query)
            .populate('shop_id', 'shopName')
            .sort({ created_at: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        const total = await Customer.countDocuments(query);

        return sendPaginatedResponse(res, customers, total, Number(page), Number(limit), 'Customers retrieved successfully');
    } catch (error: any) {
        console.error('Get customers error:', error);
        return sendError(res, 'Failed to retrieve customers', 500);
    }
}));

/**
 * @route   GET /api/customers/:id
 * @desc    Get customer by ID
 * @access  Private (Admin, Shop Manager)
 */
router.get('/:id', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const customer = await Customer.findById(req.params.id).populate('shop_id', 'shopName');
        
        if (!customer) {
            return sendError(res, 'Customer not found', 404);
        }

        return sendSuccess(res, customer, 'Customer retrieved successfully');
    } catch (error: any) {
        console.error('Get customer error:', error);
        return sendError(res, 'Failed to retrieve customer', 500);
    }
}));

/**
 * @route   POST /api/customers
 * @desc    Create new customer
 * @access  Private (Admin, Shop Manager)
 */
router.post('/', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { name, email, phone, shop_id, address } = req.body;

        // Check if customer with email already exists
        const existingCustomer = await Customer.findOne({ email });
        if (existingCustomer) {
            return sendError(res, 'Customer with this email already exists', 409);
        }

        const customer = new Customer({
            name,
            email,
            phone,
            shop_id,
            address
        });

        await customer.save();
        await customer.populate('shop_id', 'shopName');

        return sendSuccess(res, customer, 'Customer created successfully', 201);
    } catch (error: any) {
        console.error('Create customer error:', error);
        if (error.name === 'ValidationError') {
            return sendError(res, error.message, 400);
        }
        return sendError(res, 'Failed to create customer', 500);
    }
}));

/**
 * @route   PUT /api/customers/:id
 * @desc    Update customer
 * @access  Private (Admin, Shop Manager)
 */
router.put('/:id', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { name, email, phone, shop_id, address, status } = req.body;

        const customer = await Customer.findById(req.params.id);
        if (!customer) {
            return sendError(res, 'Customer not found', 404);
        }

        // Check if email is being changed and if it already exists
        if (email && email !== customer.email) {
            const existingCustomer = await Customer.findOne({ email, _id: { $ne: req.params.id } });
            if (existingCustomer) {
                return sendError(res, 'Customer with this email already exists', 409);
            }
        }

        const updatedCustomer = await Customer.findByIdAndUpdate(
            req.params.id,
            { name, email, phone, shop_id, address, status },
            { new: true, runValidators: true }
        ).populate('shop_id', 'shopName');

        return sendSuccess(res, updatedCustomer, 'Customer updated successfully');
    } catch (error: any) {
        console.error('Update customer error:', error);
        if (error.name === 'ValidationError') {
            return sendError(res, error.message, 400);
        }
        return sendError(res, 'Failed to update customer', 500);
    }
}));

/**
 * @route   DELETE /api/customers/:id
 * @desc    Delete customer
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const customer = await Customer.findById(req.params.id);
        if (!customer) {
            return sendError(res, 'Customer not found', 404);
        }

        await Customer.findByIdAndDelete(req.params.id);
        return sendSuccess(res, null, 'Customer deleted successfully');
    } catch (error: any) {
        console.error('Delete customer error:', error);
        return sendError(res, 'Failed to delete customer', 500);
    }
}));

/**
 * @route   GET /api/customers/:id/orders
 * @desc    Get customer orders
 * @access  Private (Admin, Shop Manager)
 */
router.get('/:id/orders', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { page = 1, limit = 10 } = req.query;

        const orders = await Order.find({ customer_id: req.params.id })
            .sort({ created_at: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        const total = await Order.countDocuments({ customer_id: req.params.id });

        return sendPaginatedResponse(res, orders, total, Number(page), Number(limit), 'Customer orders retrieved successfully');
    } catch (error: any) {
        console.error('Get customer orders error:', error);
        return sendError(res, 'Failed to retrieve customer orders', 500);
    }
}));

/**
 * @route   GET /api/customers/:id/statistics
 * @desc    Get customer statistics
 * @access  Private (Admin, Shop Manager)
 */
router.get('/:id/statistics', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const customer = await Customer.findById(req.params.id);
        if (!customer) {
            return sendError(res, 'Customer not found', 404);
        }

        // Get favorite products (most ordered)
        const favoriteProducts = await Order.aggregate([
            { $match: { customer_id: customer._id } },
            { $unwind: '$items' },
            { 
                $group: {
                    _id: '$items.product_id',
                    total_quantity: { $sum: '$items.quantity' },
                    product_name: { $first: '$items.product_name' }
                }
            },
            { $sort: { total_quantity: -1 } },
            { $limit: 5 }
        ]);

        const statistics = {
            total_orders: customer.total_orders,
            total_spent: customer.total_spent,
            average_order_value: customer.getAverageOrderValue(),
            last_order_date: customer.last_order_date,
            favorite_products: favoriteProducts
        };

        return sendSuccess(res, statistics, 'Customer statistics retrieved successfully');
    } catch (error: any) {
        console.error('Get customer statistics error:', error);
        return sendError(res, 'Failed to retrieve customer statistics', 500);
    }
}));

/**
 * @route   GET /api/customers/search
 * @desc    Search customers
 * @access  Private (Admin, Shop Manager)
 */
router.get('/search', authenticate, authorize('admin', 'shop_manager'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { q, page = 1, limit = 20 } = req.query;

        if (!q) {
            return sendError(res, 'Search query is required', 400);
        }

        const query = {
            $or: [
                { name: { $regex: q, $options: 'i' } },
                { email: { $regex: q, $options: 'i' } },
                { phone: { $regex: q, $options: 'i' } }
            ]
        };

        const customers = await Customer.find(query)
            .populate('shop_id', 'shopName')
            .sort({ created_at: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        const total = await Customer.countDocuments(query);

        return sendPaginatedResponse(res, customers, total, Number(page), Number(limit), 'Customer search completed');
    } catch (error: any) {
        console.error('Search customers error:', error);
        return sendError(res, 'Failed to search customers', 500);
    }
}));

export default router;