import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/responses';
import { env } from '../config/environment';

const router = Router();

/**
 * @route   GET /api-docs
 * @desc    API Documentation
 * @access  Public
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const documentation = {
        title: 'Dashboard Avocado Backend API Documentation',
        version: env.APP_VERSION,
        description: 'Comprehensive API for agricultural management system',
        base_url: `${req.protocol}://${req.get('host')}`,
        
        authentication: {
            type: 'JWT Bearer Token',
            header: 'Authorization: Bearer <token>',
            login_endpoint: '/api/auth/login',
            register_endpoint: '/api/auth/register'
        },

        endpoints: {
            welcome: {
                'GET /': 'Welcome message and system overview',
                'GET /api/welcome': 'Detailed welcome with statistics',
                'GET /api/welcome/stats': 'System statistics'
            },
            
            authentication: {
                'POST /api/auth/register': 'Register new user',
                'POST /api/auth/login': 'User login',
                'POST /api/auth/logout': 'User logout',
                'POST /api/auth/refresh': 'Refresh JWT token',
                'POST /api/auth/forgot-password': 'Request password reset',
                'POST /api/auth/reset-password': 'Reset password with token'
            },

            users: {
                'GET /api/users': 'Get all users (Admin only)',
                'GET /api/users/profile': 'Get current user profile',
                'PUT /api/users/profile': 'Update current user profile',
                'GET /api/users/:id': 'Get user by ID',
                'PUT /api/users/:id': 'Update user by ID (Admin only)',
                'DELETE /api/users/:id': 'Delete user by ID (Admin only)'
            },

            profile_access: {
                'POST /api/profile-access/bulk-import': 'Import users from Excel/JSON with access keys',
                'POST /api/profile-access/verify-access-key': 'Verify access key for profile editing',
                'PUT /api/profile-access/update-profile': 'Update profile using access key',
                'GET /api/profile-access/generate-qr/:userId': 'Generate QR code with access key',
                'GET /api/profile-access/qr/:userId': 'Generate QR code for user (legacy)',
                'GET /api/profile-access/scan/:token': 'Get user info by QR token (legacy)',
                'PUT /api/profile-access/scan/:token': 'Update user via QR token (legacy)'
            },

            products: {
                'GET /api/products': 'Get all products',
                'POST /api/products': 'Create new product',
                'GET /api/products/:id': 'Get product by ID',
                'PUT /api/products/:id': 'Update product',
                'DELETE /api/products/:id': 'Delete product'
            },

            orders: {
                'GET /api/orders': 'Get all orders',
                'POST /api/orders': 'Create new order',
                'GET /api/orders/:id': 'Get order by ID',
                'PUT /api/orders/:id': 'Update order',
                'DELETE /api/orders/:id': 'Delete order'
            },

            shops: {
                'GET /api/shops': 'Get all shops',
                'POST /api/shops': 'Create new shop',
                'GET /api/shops/:id': 'Get shop by ID',
                'PUT /api/shops/:id': 'Update shop',
                'DELETE /api/shops/:id': 'Delete shop'
            },

            analytics: {
                'GET /api/analytics/dashboard': 'Get dashboard analytics',
                'GET /api/analytics/users': 'Get user analytics',
                'GET /api/analytics/products': 'Get product analytics',
                'GET /api/analytics/orders': 'Get order analytics'
            },

            notifications: {
                'GET /api/notifications': 'Get user notifications',
                'POST /api/notifications': 'Create notification',
                'PUT /api/notifications/:id/read': 'Mark notification as read'
            },

            upload: {
                'POST /api/upload/image': 'Upload image to Cloudinary',
                'POST /api/upload/document': 'Upload document'
            },

            monitoring: {
                'GET /api/monitoring/health': 'System health check',
                'GET /api/monitoring/metrics': 'System metrics'
            }
        },

        data_models: {
            User: {
                fields: ['email', 'password', 'full_name', 'phone', 'role', 'status', 'profile'],
                roles: ['admin', 'agent', 'farmer', 'shop_manager'],
                status: ['active', 'inactive']
            },
            
            AccessKey: {
                fields: ['user_id', 'access_key', 'is_used', 'expires_at'],
                format: 'XXXX-XXXX-XXXX (12 characters)',
                expiry: '30 days default'
            },

            Product: {
                fields: ['name', 'description', 'price', 'category', 'stock_quantity', 'status'],
                categories: ['seeds', 'fertilizers', 'tools', 'pesticides'],
                status: ['active', 'inactive', 'out_of_stock']
            },

            Order: {
                fields: ['user_id', 'products', 'total_amount', 'status', 'delivery_address'],
                status: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']
            }
        },

        error_responses: {
            400: 'Bad Request - Invalid input data',
            401: 'Unauthorized - Authentication required',
            403: 'Forbidden - Insufficient permissions',
            404: 'Not Found - Resource not found',
            409: 'Conflict - Resource already exists',
            422: 'Unprocessable Entity - Validation errors',
            429: 'Too Many Requests - Rate limit exceeded',
            500: 'Internal Server Error - Server error'
        },

        response_format: {
            success: {
                success: true,
                message: 'Success message',
                data: 'Response data'
            },
            error: {
                success: false,
                message: 'Error message',
                error: 'Error details (development only)'
            }
        },

        rate_limiting: {
            window: '15 minutes',
            max_requests: 100,
            applies_to: 'All /api/* endpoints'
        },

        security_features: [
            'JWT Authentication',
            'Password Hashing (bcrypt)',
            'Input Validation',
            'SQL Injection Protection',
            'XSS Protection',
            'CORS Configuration',
            'Rate Limiting',
            'Request Logging',
            'Error Handling'
        ]
    };

    sendSuccess(res, documentation, 'API Documentation');
}));

export default router;