import { Options } from 'swagger-jsdoc';

export const swaggerOptions: Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Dashboard Avocado API',
      version: '2.0.0',
      description: `
## Agricultural Management Platform for Rwanda's Avocado Supply Chain

Connects four actor types:
- **Farmers** — register farms, request services, manage avocado trees
- **Agents** — coordinate harvests, manage farmer profiles via QR codes
- **Shop Managers** — sell inputs, manage inventory and orders
- **Admins** — oversee the entire platform

### Authentication
All protected routes require a JWT Bearer token obtained from \`POST /api/auth/login\`.
Include it as: \`Authorization: Bearer <token>\`

### QR Code System
Agents generate QR codes (\`GET /api/profile-access/qr/:userId\`) for farmers.
Farmers scan the token (\`GET /api/profile-access/scan/:token\`) to view/edit their profile without logging in.
One-time access keys (format: \`XXXX-XXXX-XXXX\`) provide an alternative access method.
      `,
      contact: {
        name: 'Dashboard Avocado Support',
        email: 'admin@dashboardavocado.com',
      },
    },
    servers: [
      { url: 'http://localhost:5000', description: 'Local development' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token from POST /api/auth/login',
        },
      },
      schemas: {
        // ─── Shared ───────────────────────────────────────────────────────
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation successful' },
            data: { type: 'object' },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: { type: 'array', items: { type: 'object' } },
            meta: {
              type: 'object',
              properties: {
                page: { type: 'integer', example: 1 },
                limit: { type: 'integer', example: 20 },
                total: { type: 'integer', example: 100 },
                totalPages: { type: 'integer', example: 5 },
                hasNext: { type: 'boolean' },
                hasPrev: { type: 'boolean' },
              },
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error message' },
          },
        },
        // ─── User ─────────────────────────────────────────────────────────
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cm123abc' },
            email: { type: 'string', format: 'email' },
            full_name: { type: 'string' },
            phone: { type: 'string', nullable: true },
            role: { type: 'string', enum: ['admin', 'agent', 'farmer', 'shop_manager'] },
            status: { type: 'string', enum: ['active', 'inactive'] },
            profile: { type: 'object', description: 'Embedded JSON profile (age, gender, location, farm_details, etc.)' },
            qr_code_token: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: { type: 'string', description: 'JWT Bearer token' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                full_name: { type: 'string' },
                role: { type: 'string', enum: ['admin', 'agent', 'farmer', 'shop_manager'] },
                status: { type: 'string', enum: ['active', 'inactive'] },
              },
            },
          },
        },
        // ─── Product ──────────────────────────────────────────────────────
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            category: {
              type: 'string',
              enum: ['seeds', 'fertilizers', 'tools', 'irrigation', 'harvesting', 'containers', 'pest-management', 'protection'],
            },
            description: { type: 'string', nullable: true },
            price: { type: 'number', example: 5000 },
            quantity: { type: 'integer', example: 100 },
            unit: {
              type: 'string',
              enum: ['kg', 'g', 'lb', 'oz', 'ton', 'liter', 'ml', 'gallon', 'piece', 'dozen', 'box', 'bag', 'bottle', 'can', 'packet'],
            },
            status: { type: 'string', enum: ['available', 'out_of_stock', 'discontinued'] },
            sku: { type: 'string', nullable: true },
            supplier_id: { type: 'string' },
            images: { type: 'array', items: { type: 'string' } },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        // ─── Order ────────────────────────────────────────────────────────
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            order_number: { type: 'string', example: 'ORD-20240624-001' },
            customer_id: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'] },
            payment_status: { type: 'string', enum: ['pending', 'paid', 'failed', 'refunded'] },
            payment_method: { type: 'string', enum: ['cash', 'mobile_money', 'bank_transfer', 'credit_card', 'debit_card', 'check'] },
            subtotal: { type: 'number' },
            tax_amount: { type: 'number' },
            shipping_cost: { type: 'number' },
            discount_amount: { type: 'number' },
            total_amount: { type: 'number' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  product_id: { type: 'string' },
                  product_name: { type: 'string' },
                  quantity: { type: 'integer' },
                  unit_price: { type: 'number' },
                  total_price: { type: 'number' },
                },
              },
            },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        // ─── Farm ─────────────────────────────────────────────────────────
        Farm: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            farmName: { type: 'string' },
            farmerName: { type: 'string' },
            farmer_id: { type: 'string' },
            farm_size: { type: 'number', description: 'Size in hectares' },
            tree_count: { type: 'integer' },
            varieties: { type: 'array', items: { type: 'string' } },
            planting_date: { type: 'string', format: 'date-time' },
            expected_harvest: { type: 'string', format: 'date-time', nullable: true },
            crop_type: { type: 'string', example: 'avocado' },
            status: { type: 'string', enum: ['preparing', 'planted', 'growing', 'producing', 'harvesting', 'dormant'] },
            location: {
              type: 'object',
              properties: {
                province: { type: 'string' },
                district: { type: 'string' },
                sector: { type: 'string' },
                cell: { type: 'string' },
                village: { type: 'string' },
              },
            },
            notes: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        // ─── ServiceRequest ───────────────────────────────────────────────
        ServiceRequest: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            request_number: { type: 'string', example: 'HARV-20240624-001' },
            service_type: { type: 'string', enum: ['harvest', 'planting', 'maintenance', 'consultation', 'pest_control', 'other'] },
            title: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'assigned', 'in_progress', 'completed', 'cancelled'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            farmer_id: { type: 'string' },
            agent_id: { type: 'string', nullable: true },
            location: { type: 'object' },
            harvest_details: { type: 'object', nullable: true },
            pest_management_details: { type: 'object', nullable: true },
            cost_estimate: { type: 'number', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        // ─── Supplier ─────────────────────────────────────────────────────
        Supplier: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            category: {
              type: 'string',
              enum: ['seeds_supplier', 'fertilizer_supplier', 'equipment_supplier', 'produce_buyer', 'input_distributor', 'logistics_provider', 'financial_services', 'other'],
            },
            contact_person: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive', 'pending_approval', 'suspended'] },
            rating: { type: 'number', minimum: 0, maximum: 5 },
            address: { type: 'object' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        // ─── Shop ─────────────────────────────────────────────────────────
        Shop: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            shop_number: { type: 'integer', description: 'Auto-incremented integer used in URLs' },
            name: { type: 'string' },
            location: { type: 'object' },
            owner_id: { type: 'string', nullable: true },
            status: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        // ─── Transaction ──────────────────────────────────────────────────
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            transaction_number: { type: 'string' },
            payer_id: { type: 'string' },
            payee_id: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string', example: 'RWF' },
            type: { type: 'string', enum: ['payment', 'refund', 'adjustment', 'fee', 'commission'] },
            status: { type: 'string', enum: ['pending', 'completed', 'failed', 'cancelled', 'processing'] },
            payment_method: { type: 'string', enum: ['cash', 'mobile_money', 'bank_transfer', 'credit_card', 'debit_card', 'check'] },
            net_amount: { type: 'number' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        // ─── Notification ─────────────────────────────────────────────────
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            user_id: { type: 'string' },
            title: { type: 'string' },
            message: { type: 'string' },
            type: { type: 'string', enum: ['info', 'success', 'warning', 'error', 'order', 'system'] },
            is_read: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        // ─── Report ───────────────────────────────────────────────────────
        Report: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            agent_id: { type: 'string' },
            farmer_id: { type: 'string', nullable: true },
            title: { type: 'string' },
            type: { type: 'string', enum: ['inspection', 'audit', 'assessment', 'survey', 'other'] },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            location: { type: 'object' },
            findings: { type: 'string' },
            recommendations: { type: 'string' },
            attachments: { type: 'array', items: { type: 'string' } },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        // ─── Customer ─────────────────────────────────────────────────────
        Customer: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            address: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['active', 'inactive'] },
            total_orders: { type: 'integer' },
            total_spent: { type: 'number' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        // ─── AgentProfile ─────────────────────────────────────────────────
        AgentProfile: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            user_id: { type: 'string' },
            agentId: { type: 'string' },
            territory: { type: 'array', items: { type: 'string' } },
            province: { type: 'string', nullable: true },
            district: { type: 'string', nullable: true },
            sector: { type: 'string', nullable: true },
            specialization: { type: 'string', nullable: true },
            experience: { type: 'string', nullable: true },
            certification: { type: 'string', nullable: true },
            statistics: { type: 'object' },
          },
        },
        // ─── FarmerProfile ────────────────────────────────────────────────
        FarmerProfile: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            user_id: { type: 'string' },
            province: { type: 'string', nullable: true },
            district: { type: 'string', nullable: true },
            sector: { type: 'string', nullable: true },
            farm_size: { type: 'number', nullable: true },
            tree_count: { type: 'integer', nullable: true },
            avocado_type: { type: 'string', nullable: true },
            assistance: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      parameters: {
        pageParam: { in: 'query', name: 'page', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        limitParam: { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 }, description: 'Items per page' },
        searchParam: { in: 'query', name: 'search', schema: { type: 'string' }, description: 'Search term' },
        idParam: { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Resource CUID' },
        shopNumberParam: { in: 'path', name: 'shopNumber', required: true, schema: { type: 'integer' }, description: 'Shop number (auto-increment integer)' },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication and token management' },
      { name: 'Users', description: 'User management (admin)' },
      { name: 'Farms', description: 'Farm registration and tracking' },
      { name: 'Products', description: 'Product catalogue and stock management' },
      { name: 'Orders', description: 'Order lifecycle management' },
      { name: 'Customers', description: 'Customer profiles and history' },
      { name: 'Suppliers', description: 'Supplier management' },
      { name: 'ServiceRequests', description: 'Harvest, pest-control, and other service requests' },
      { name: 'Shops', description: 'Input shops management' },
      { name: 'Inventory', description: 'Inventory levels and stock history' },
      { name: 'Notifications', description: 'User notifications' },
      { name: 'Transactions', description: 'Financial transactions' },
      { name: 'Reports', description: 'Agent field reports' },
      { name: 'Analytics', description: 'Platform-wide statistics (admin)' },
      { name: 'FarmerInformation', description: 'Extended farmer profiles' },
      { name: 'AgentInformation', description: 'Extended agent profiles' },
      { name: 'ProfileAccess', description: 'QR code and access key system' },
      { name: 'Weather', description: 'Weather data and farm conditions' },
      { name: 'Upload', description: 'File upload (Cloudinary)' },
      { name: 'Logs', description: 'System logs (admin)' },
      { name: 'Monitoring', description: 'Health and system metrics' },
      { name: 'Welcome', description: 'Public platform overview' },
    ],
    paths: {

      // ═══════════════════════════════════════════════════════════════════
      // HEALTH
      // ═══════════════════════════════════════════════════════════════════
      '/health': {
        get: {
          summary: 'Service health check',
          tags: ['Monitoring'],
          security: [],
          responses: {
            200: { description: 'Service is healthy' },
          },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // WELCOME
      // ═══════════════════════════════════════════════════════════════════
      '/api/welcome': {
        get: {
          summary: 'Platform overview and public statistics',
          tags: ['Welcome'],
          security: [],
          responses: {
            200: {
              description: 'Platform statistics',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    data: { total_users: 50, total_farms: 30, total_products: 120, total_orders: 200 },
                  },
                },
              },
            },
          },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // AUTH
      // ═══════════════════════════════════════════════════════════════════
      '/api/auth/register': {
        post: {
          summary: 'Register a new user',
          tags: ['Auth'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password', 'full_name'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 6 },
                    full_name: { type: 'string' },
                    phone: { type: 'string' },
                    role: { type: 'string', enum: ['farmer', 'agent', 'shop_manager'], default: 'farmer' },
                    profile: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'User created successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
            409: { description: 'Email already exists' },
          },
        },
      },
      '/api/auth/login': {
        post: {
          summary: 'Login and receive JWT token',
          tags: ['Auth'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email', example: 'admin@dashboardavocado.com' },
                    password: { type: 'string', example: 'admin123456' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Login successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
            401: { description: 'Invalid credentials' },
          },
        },
      },
      '/api/auth/logout': {
        post: {
          summary: 'Logout (invalidates session client-side)',
          tags: ['Auth'],
          responses: { 200: { description: 'Logout successful' } },
        },
      },
      '/api/auth/profile': {
        get: {
          summary: 'Get current user profile',
          tags: ['Auth'],
          responses: {
            200: { description: 'Current user', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          },
        },
        put: {
          summary: 'Update own profile (name, phone, profile JSON)',
          tags: ['Auth'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    full_name: { type: 'string' },
                    phone: { type: 'string' },
                    profile: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Profile updated' } },
        },
      },
      '/api/auth/password': {
        put: {
          summary: 'Change own password',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['currentPassword', 'newPassword'],
                  properties: {
                    currentPassword: { type: 'string' },
                    newPassword: { type: 'string', minLength: 6 },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Password changed' }, 400: { description: 'Wrong current password' } },
        },
      },
      '/api/auth/refresh': {
        post: {
          summary: 'Refresh JWT token',
          tags: ['Auth'],
          responses: { 200: { description: 'New token issued' } },
        },
      },
      '/api/auth/verify': {
        get: {
          summary: 'Verify token validity',
          tags: ['Auth'],
          responses: { 200: { description: 'Token is valid' }, 401: { description: 'Token invalid or expired' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // USERS
      // ═══════════════════════════════════════════════════════════════════
      '/api/users': {
        get: {
          summary: 'List all users (admin)',
          tags: ['Users'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { $ref: '#/components/parameters/searchParam' },
            { in: 'query', name: 'role', schema: { type: 'string', enum: ['admin', 'agent', 'farmer', 'shop_manager'] } },
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['active', 'inactive'] } },
          ],
          responses: { 200: { description: 'Paginated users list' } },
        },
      },
      '/api/users/farmers': {
        get: {
          summary: 'List farmers (admin/agent)',
          tags: ['Users'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { $ref: '#/components/parameters/searchParam' },
          ],
          responses: { 200: { description: 'Paginated farmers list' } },
        },
        post: {
          summary: 'Create a farmer account with full profile (admin)',
          tags: ['Users'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['full_name', 'email', 'gender'],
                  properties: {
                    full_name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    phone: { type: 'string' },
                    gender: { type: 'string', enum: ['Male', 'Female', 'Other'] },
                    age: { type: 'integer' },
                    marital_status: { type: 'string' },
                    education_level: { type: 'string' },
                    province: { type: 'string' },
                    district: { type: 'string' },
                    sector: { type: 'string' },
                    farm_size: { type: 'number' },
                    tree_count: { type: 'integer' },
                    avocado_type: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Farmer created' } },
        },
      },
      '/api/users/agents': {
        get: {
          summary: 'List agents (admin)',
          tags: ['Users'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
          ],
          responses: { 200: { description: 'Paginated agents list' } },
        },
        post: {
          summary: 'Create an agent account (admin)',
          tags: ['Users'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['full_name', 'email'],
                  properties: {
                    full_name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    phone: { type: 'string' },
                    province: { type: 'string' },
                    district: { type: 'string' },
                    territory: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Agent created' } },
        },
      },
      '/api/users/shop-managers': {
        get: {
          summary: 'List shop managers (admin)',
          tags: ['Users'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
          ],
          responses: { 200: { description: 'Paginated shop managers list' } },
        },
      },
      '/api/users/{id}': {
        get: {
          summary: 'Get user by ID (admin)',
          tags: ['Users'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'User details', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } }, 404: { description: 'User not found' } },
        },
        put: {
          summary: 'Update user (admin)',
          tags: ['Users'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    full_name: { type: 'string' },
                    phone: { type: 'string' },
                    status: { type: 'string', enum: ['active', 'inactive'] },
                    role: { type: 'string', enum: ['admin', 'agent', 'farmer', 'shop_manager'] },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'User updated' } },
        },
        delete: {
          summary: 'Delete user (admin)',
          tags: ['Users'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'User deleted' }, 404: { description: 'User not found' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // FARMS
      // ═══════════════════════════════════════════════════════════════════
      '/api/farms': {
        get: {
          summary: 'List farms (admin/agent)',
          tags: ['Farms'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'farmer_id', schema: { type: 'string' } },
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['preparing', 'planted', 'growing', 'producing', 'harvesting', 'dormant'] } },
            { in: 'query', name: 'province', schema: { type: 'string' } },
            { in: 'query', name: 'district', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Paginated farms list' } },
        },
        post: {
          summary: 'Register a new farm (admin/agent)',
          tags: ['Farms'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['farmer_id', 'farm_name'],
                  properties: {
                    farmer_id: { type: 'string' },
                    farm_name: { type: 'string' },
                    farm_size: { type: 'number', description: 'Size in hectares' },
                    tree_count: { type: 'integer' },
                    varieties: { type: 'array', items: { type: 'string' } },
                    planting_date: { type: 'string', format: 'date' },
                    expected_harvest: { type: 'string', format: 'date' },
                    crop_type: { type: 'string', default: 'avocado' },
                    status: { type: 'string', enum: ['preparing', 'planted', 'growing', 'producing', 'harvesting', 'dormant'] },
                    location: {
                      type: 'object',
                      properties: {
                        province: { type: 'string' },
                        district: { type: 'string' },
                        sector: { type: 'string' },
                        cell: { type: 'string' },
                        village: { type: 'string' },
                      },
                    },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Farm registered' } },
        },
      },
      '/api/farms/overview': {
        get: {
          summary: 'Aggregate farm statistics (admin/agent)',
          tags: ['Farms'],
          responses: {
            200: {
              description: 'Overview stats',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    data: { total_farms: 45, by_status: { planted: 20, growing: 15 }, total_trees: 5400, total_area: 90.5 },
                  },
                },
              },
            },
          },
        },
      },
      '/api/farms/{id}': {
        get: {
          summary: 'Get farm by ID',
          tags: ['Farms'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Farm details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Farm' } } } }, 404: { description: 'Not found' } },
        },
        put: {
          summary: 'Update farm',
          tags: ['Farms'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    farm_name: { type: 'string' },
                    farm_size: { type: 'number' },
                    tree_count: { type: 'integer' },
                    status: { type: 'string', enum: ['preparing', 'planted', 'growing', 'producing', 'harvesting', 'dormant'] },
                    expected_harvest: { type: 'string', format: 'date' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Farm updated' } },
        },
        delete: {
          summary: 'Delete farm (admin)',
          tags: ['Farms'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Farm deleted' } },
        },
      },
      '/api/farms/{id}/details': {
        get: {
          summary: 'Extended farm information including yield estimate',
          tags: ['Farms'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Extended farm info with yield estimate and harvest readiness' } },
        },
      },
      '/api/farms/{id}/production-stats': {
        get: {
          summary: 'Farm production statistics',
          tags: ['Farms'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Production statistics and annual yield estimate' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // PRODUCTS
      // ═══════════════════════════════════════════════════════════════════
      '/api/products': {
        get: {
          summary: 'List products',
          tags: ['Products'],
          security: [],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { $ref: '#/components/parameters/searchParam' },
            { in: 'query', name: 'category', schema: { type: 'string', enum: ['seeds', 'fertilizers', 'tools', 'irrigation', 'harvesting', 'containers', 'pest-management', 'protection'] } },
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['available', 'out_of_stock', 'discontinued'] } },
            { in: 'query', name: 'min_price', schema: { type: 'number' } },
            { in: 'query', name: 'max_price', schema: { type: 'number' } },
          ],
          responses: { 200: { description: 'Paginated products list' } },
        },
        post: {
          summary: 'Create product (admin)',
          tags: ['Products'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'category', 'price', 'unit', 'supplier_id'],
                  properties: {
                    name: { type: 'string' },
                    category: { type: 'string', enum: ['seeds', 'fertilizers', 'tools', 'irrigation', 'harvesting', 'containers', 'pest-management', 'protection'] },
                    description: { type: 'string' },
                    price: { type: 'number' },
                    quantity: { type: 'integer', default: 0 },
                    unit: { type: 'string', enum: ['kg', 'g', 'lb', 'oz', 'ton', 'liter', 'ml', 'gallon', 'piece', 'dozen', 'box', 'bag', 'bottle', 'can', 'packet'] },
                    supplier_id: { type: 'string' },
                    sku: { type: 'string' },
                    brand: { type: 'string' },
                    images: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Product created' } },
        },
      },
      '/api/products/{id}': {
        get: {
          summary: 'Get product by ID',
          tags: ['Products'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Product details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } } }, 404: { description: 'Not found' } },
        },
        put: {
          summary: 'Update product (admin)',
          tags: ['Products'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            content: {
              'application/json': {
                schema: { type: 'object', properties: { name: { type: 'string' }, price: { type: 'number' }, status: { type: 'string' } } },
              },
            },
          },
          responses: { 200: { description: 'Product updated' } },
        },
        delete: {
          summary: 'Delete product (admin)',
          tags: ['Products'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Product deleted' } },
        },
      },
      '/api/products/{id}/stock': {
        post: {
          summary: 'Update product stock (admin/agent). Records a StockHistory entry.',
          tags: ['Products'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['quantity', 'reason'],
                  properties: {
                    quantity: { type: 'integer', description: 'New absolute quantity (not a delta)' },
                    reason: { type: 'string', enum: ['restock', 'sale', 'adjustment', 'damage', 'return', 'other'] },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Stock updated and history recorded' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // ORDERS
      // ═══════════════════════════════════════════════════════════════════
      '/api/orders': {
        get: {
          summary: 'List orders (admin/agent, or own orders for others)',
          tags: ['Orders'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'] } },
            { in: 'query', name: 'customer_id', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Paginated orders list' } },
        },
        post: {
          summary: 'Create order. Validates stock and decrements quantities on creation.',
          tags: ['Orders'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['customer_id', 'items', 'shipping_address'],
                  properties: {
                    customer_id: { type: 'string' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['product_id', 'quantity'],
                        properties: {
                          product_id: { type: 'string' },
                          quantity: { type: 'integer', minimum: 1 },
                        },
                      },
                    },
                    shipping_address: { type: 'object' },
                    payment_method: { type: 'string', enum: ['cash', 'mobile_money', 'bank_transfer', 'credit_card', 'debit_card', 'check'] },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Order created' },
            400: { description: 'Insufficient stock for one or more items' },
          },
        },
      },
      '/api/orders/{id}': {
        get: {
          summary: 'Get order with items',
          tags: ['Orders'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Order details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } } },
        },
        delete: {
          summary: 'Cancel/delete order (admin)',
          tags: ['Orders'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Order cancelled' } },
        },
      },
      '/api/orders/{id}/status': {
        put: {
          summary: 'Update order status (admin/agent). Auto-sets delivered_date when status=delivered.',
          tags: ['Orders'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { type: 'string', enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'] },
                    payment_status: { type: 'string', enum: ['pending', 'paid', 'failed', 'refunded'] },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Status updated' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // CUSTOMERS
      // ═══════════════════════════════════════════════════════════════════
      '/api/customers': {
        get: {
          summary: 'List customers (admin/agent)',
          tags: ['Customers'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { $ref: '#/components/parameters/searchParam' },
          ],
          responses: { 200: { description: 'Paginated customers' } },
        },
        post: {
          summary: 'Create customer (admin/agent)',
          tags: ['Customers'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'email', 'phone'],
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    phone: { type: 'string' },
                    address: { type: 'string' },
                    shop_id: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Customer created' } },
        },
      },
      '/api/customers/{id}': {
        get: {
          summary: 'Get customer',
          tags: ['Customers'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Customer details' } },
        },
        put: {
          summary: 'Update customer',
          tags: ['Customers'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { 200: { description: 'Customer updated' } },
        },
        delete: {
          summary: 'Delete customer (admin)',
          tags: ['Customers'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Customer deleted' } },
        },
      },
      '/api/customers/{id}/orders': {
        get: {
          summary: "Customer's order history",
          tags: ['Customers'],
          parameters: [
            { $ref: '#/components/parameters/idParam' },
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
          ],
          responses: { 200: { description: "Customer's orders" } },
        },
      },
      '/api/customers/{id}/statistics': {
        get: {
          summary: 'Customer spend statistics and order summary',
          tags: ['Customers'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Statistics' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // SUPPLIERS
      // ═══════════════════════════════════════════════════════════════════
      '/api/suppliers': {
        get: {
          summary: 'List suppliers (admin)',
          tags: ['Suppliers'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { $ref: '#/components/parameters/searchParam' },
          ],
          responses: { 200: { description: 'Paginated suppliers' } },
        },
        post: {
          summary: 'Create supplier (admin)',
          tags: ['Suppliers'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'category', 'contact_person', 'email', 'phone', 'address'],
                  properties: {
                    name: { type: 'string' },
                    category: { type: 'string', enum: ['seeds_supplier', 'fertilizer_supplier', 'equipment_supplier', 'produce_buyer', 'input_distributor', 'logistics_provider', 'financial_services', 'other'] },
                    contact_person: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    phone: { type: 'string' },
                    address: { type: 'object', description: '{street_address, city, province, country}' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Supplier created' } },
        },
      },
      '/api/suppliers/{id}': {
        get: {
          summary: 'Get supplier by ID',
          tags: ['Suppliers'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Supplier details' } },
        },
        put: {
          summary: 'Update supplier (admin)',
          tags: ['Suppliers'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { 200: { description: 'Supplier updated' } },
        },
        delete: {
          summary: 'Delete supplier (admin)',
          tags: ['Suppliers'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Supplier deleted' } },
        },
      },
      '/api/suppliers/{id}/products': {
        get: {
          summary: "Supplier's products",
          tags: ['Suppliers'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: "List of supplier's products" } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // SERVICE REQUESTS
      // ═══════════════════════════════════════════════════════════════════
      '/api/service-requests': {
        get: {
          summary: 'List service requests (role-scoped: farmers see own, agents see assigned, admin sees all)',
          tags: ['ServiceRequests'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['pending', 'approved', 'rejected', 'assigned', 'in_progress', 'completed', 'cancelled'] } },
            { in: 'query', name: 'service_type', schema: { type: 'string', enum: ['harvest', 'pest_control', 'other'] } },
          ],
          responses: { 200: { description: 'Paginated service requests' } },
        },
      },
      '/api/service-requests/harvest': {
        post: {
          summary: 'Create harvest service request (farmer/agent)',
          tags: ['ServiceRequests'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['workersNeeded', 'treesToHarvest', 'harvestDateFrom', 'harvestDateTo', 'location'],
                  properties: {
                    workersNeeded: { type: 'integer' },
                    treesToHarvest: { type: 'integer' },
                    harvestDateFrom: { type: 'string', format: 'date' },
                    harvestDateTo: { type: 'string', format: 'date' },
                    equipmentNeeded: { type: 'array', items: { type: 'string' } },
                    location: {
                      type: 'object',
                      required: ['province', 'district'],
                      properties: {
                        province: { type: 'string' },
                        district: { type: 'string' },
                        sector: { type: 'string' },
                      },
                    },
                    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Harvest request created' } },
        },
      },
      '/api/service-requests/pest-control': {
        post: {
          summary: 'Create pest control request (farmer)',
          tags: ['ServiceRequests'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'description', 'location', 'pest_management_details'],
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
                    location: { type: 'object' },
                    pest_management_details: {
                      type: 'object',
                      properties: {
                        pests_diseases: { type: 'array', items: { type: 'object' } },
                        severity_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                        damage_details: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Pest control request created' } },
        },
      },
      '/api/service-requests/other': {
        post: {
          summary: 'Create other/property evaluation request (farmer/agent)',
          tags: ['ServiceRequests'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'description', 'location'],
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    location: { type: 'object' },
                    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Request created' } },
        },
      },
      '/api/service-requests/{id}': {
        get: {
          summary: 'Get service request by ID',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Service request details' } },
        },
        put: {
          summary: 'Update service request',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { 200: { description: 'Updated' } },
        },
        delete: {
          summary: 'Delete service request (admin)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Deleted' } },
        },
      },
      '/api/service-requests/{id}/approve': {
        post: {
          summary: 'Approve service request (admin/agent)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    agent_id: { type: 'string' },
                    scheduled_date: { type: 'string', format: 'date-time' },
                    cost_estimate: { type: 'number' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Request approved' } },
        },
      },
      '/api/service-requests/{id}/complete': {
        post: {
          summary: 'Mark service request as completed (admin/agent)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    completion_notes: { type: 'string' },
                    actual_cost: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Request completed' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // SHOPS
      // ═══════════════════════════════════════════════════════════════════
      '/api/shops': {
        get: {
          summary: 'List shops',
          tags: ['Shops'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
          ],
          responses: { 200: { description: 'Paginated shops list' } },
        },
        post: {
          summary: 'Create shop (admin)',
          tags: ['Shops'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    location: { type: 'object' },
                    owner_id: { type: 'string' },
                    description: { type: 'string' },
                    phone: { type: 'string' },
                    email: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Shop created with auto-assigned shop_number' } },
        },
      },
      '/api/shops/{shopNumber}': {
        get: {
          summary: 'Get shop by shop number (integer)',
          tags: ['Shops'],
          parameters: [{ $ref: '#/components/parameters/shopNumberParam' }],
          responses: { 200: { description: 'Shop details' } },
        },
        put: {
          summary: 'Update shop (admin/shop_manager)',
          tags: ['Shops'],
          parameters: [{ $ref: '#/components/parameters/shopNumberParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { 200: { description: 'Shop updated' } },
        },
        delete: {
          summary: 'Delete shop (admin)',
          tags: ['Shops'],
          parameters: [{ $ref: '#/components/parameters/shopNumberParam' }],
          responses: { 200: { description: 'Shop deleted' } },
        },
      },
      '/api/shops/{shopNumber}/inventory': {
        get: {
          summary: "List shop's products/inventory",
          tags: ['Shops'],
          parameters: [
            { $ref: '#/components/parameters/shopNumberParam' },
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
          ],
          responses: { 200: { description: 'Shop inventory' } },
        },
      },
      '/api/shops/{shopNumber}/orders': {
        get: {
          summary: "List orders associated with the shop's products",
          tags: ['Shops'],
          parameters: [
            { $ref: '#/components/parameters/shopNumberParam' },
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
          ],
          responses: { 200: { description: "Shop's orders" } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // INVENTORY
      // ═══════════════════════════════════════════════════════════════════
      '/api/inventory': {
        get: {
          summary: 'Full inventory list with stock status (admin)',
          tags: ['Inventory'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
          ],
          responses: { 200: { description: 'Inventory list' } },
        },
      },
      '/api/inventory/low-stock': {
        get: {
          summary: 'Products below stock threshold (admin)',
          tags: ['Inventory'],
          parameters: [
            { in: 'query', name: 'threshold', schema: { type: 'integer', default: 10 }, description: 'Minimum quantity threshold' },
          ],
          responses: { 200: { description: 'Low stock products' } },
        },
      },
      '/api/inventory/summary': {
        get: {
          summary: 'Inventory summary by category (admin)',
          tags: ['Inventory'],
          responses: { 200: { description: 'Category totals and value' } },
        },
      },
      '/api/inventory/{id}/restock': {
        post: {
          summary: 'Restock product and log stock history (admin)',
          tags: ['Inventory'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['quantity'],
                  properties: {
                    quantity: { type: 'integer', description: 'Quantity to add' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Stock updated' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // NOTIFICATIONS
      // ═══════════════════════════════════════════════════════════════════
      '/api/notifications': {
        get: {
          summary: "Get current user's notifications",
          tags: ['Notifications'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'unread_only', schema: { type: 'boolean' } },
          ],
          responses: { 200: { description: 'Notifications list' } },
        },
      },
      '/api/notifications/read-all': {
        put: {
          summary: 'Mark all notifications as read',
          tags: ['Notifications'],
          responses: { 200: { description: 'All marked as read' } },
        },
      },
      '/api/notifications/clear-all': {
        delete: {
          summary: 'Delete all notifications for current user',
          tags: ['Notifications'],
          responses: { 200: { description: 'All deleted' } },
        },
      },
      '/api/notifications/{id}/read': {
        put: {
          summary: 'Mark a notification as read',
          tags: ['Notifications'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Notification marked as read' } },
        },
      },
      '/api/notifications/{id}': {
        delete: {
          summary: 'Delete a notification',
          tags: ['Notifications'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Notification deleted' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // TRANSACTIONS
      // ═══════════════════════════════════════════════════════════════════
      '/api/transactions': {
        get: {
          summary: 'List transactions (admin sees all, users see own)',
          tags: ['Transactions'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['pending', 'completed', 'failed', 'cancelled', 'processing'] } },
            { in: 'query', name: 'type', schema: { type: 'string', enum: ['payment', 'refund', 'adjustment', 'fee', 'commission'] } },
          ],
          responses: { 200: { description: 'Paginated transactions' } },
        },
        post: {
          summary: 'Create a transaction',
          tags: ['Transactions'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['payer_id', 'payee_id', 'amount', 'type', 'payment_method'],
                  properties: {
                    payer_id: { type: 'string' },
                    payee_id: { type: 'string' },
                    amount: { type: 'number' },
                    currency: { type: 'string', default: 'RWF' },
                    type: { type: 'string', enum: ['payment', 'refund', 'adjustment', 'fee', 'commission'] },
                    payment_method: { type: 'string', enum: ['cash', 'mobile_money', 'bank_transfer', 'credit_card', 'debit_card', 'check'] },
                    description: { type: 'string' },
                    fees: { type: 'number', default: 0 },
                    order_id: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Transaction created' } },
        },
      },
      '/api/transactions/summary': {
        get: {
          summary: 'Financial summary (admin)',
          tags: ['Transactions'],
          parameters: [
            { in: 'query', name: 'start_date', schema: { type: 'string', format: 'date' } },
            { in: 'query', name: 'end_date', schema: { type: 'string', format: 'date' } },
          ],
          responses: { 200: { description: 'Financial summary by type and status' } },
        },
      },
      '/api/transactions/{id}': {
        get: {
          summary: 'Get transaction by ID (own or admin)',
          tags: ['Transactions'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Transaction details' } },
        },
      },
      '/api/transactions/{id}/status': {
        put: {
          summary: 'Update transaction status (admin)',
          tags: ['Transactions'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { type: 'string', enum: ['pending', 'completed', 'failed', 'cancelled', 'processing'] },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Status updated' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // REPORTS
      // ═══════════════════════════════════════════════════════════════════
      '/api/reports': {
        get: {
          summary: 'List reports (admin/agent)',
          tags: ['Reports'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'type', schema: { type: 'string', enum: ['inspection', 'audit', 'assessment', 'survey', 'other'] } },
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] } },
          ],
          responses: { 200: { description: 'Paginated reports' } },
        },
        post: {
          summary: 'Create report (agent/admin)',
          tags: ['Reports'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'type', 'location', 'findings'],
                  properties: {
                    title: { type: 'string' },
                    type: { type: 'string', enum: ['inspection', 'audit', 'assessment', 'survey', 'other'] },
                    farmer_id: { type: 'string' },
                    location: { type: 'object', description: '{province, district, sector}' },
                    findings: { type: 'string' },
                    recommendations: { type: 'string' },
                    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
                    attachments: { type: 'array', items: { type: 'string', format: 'uri' } },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Report created' } },
        },
      },
      '/api/reports/{id}': {
        get: {
          summary: 'Get report by ID',
          tags: ['Reports'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Report details' } },
        },
        put: {
          summary: 'Update report (agent/admin)',
          tags: ['Reports'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { 200: { description: 'Report updated' } },
        },
        delete: {
          summary: 'Delete report (admin)',
          tags: ['Reports'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Report deleted' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // ANALYTICS
      // ═══════════════════════════════════════════════════════════════════
      '/api/analytics/dashboard': {
        get: {
          summary: 'Platform-wide KPIs — user counts, revenue, orders (admin/shop_manager)',
          tags: ['Analytics'],
          parameters: [
            { in: 'query', name: 'start_date', schema: { type: 'string', format: 'date' } },
            { in: 'query', name: 'end_date', schema: { type: 'string', format: 'date' } },
          ],
          responses: { 200: { description: 'Dashboard analytics' } },
        },
      },
      '/api/analytics/users': {
        get: {
          summary: 'User registration trends and role breakdown (admin)',
          tags: ['Analytics'],
          responses: { 200: { description: 'User analytics' } },
        },
      },
      '/api/analytics/products': {
        get: {
          summary: 'Product sales by category and top-selling items (admin)',
          tags: ['Analytics'],
          responses: { 200: { description: 'Product analytics' } },
        },
      },
      '/api/analytics/service-requests': {
        get: {
          summary: 'Service request trends by type and status (admin)',
          tags: ['Analytics'],
          responses: { 200: { description: 'Service request analytics' } },
        },
      },
      '/api/analytics/farms': {
        get: {
          summary: 'Farm status distribution and regional breakdown (admin)',
          tags: ['Analytics'],
          responses: { 200: { description: 'Farm analytics' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // FARMER INFORMATION
      // ═══════════════════════════════════════════════════════════════════
      '/api/farmer-information': {
        get: {
          summary: 'List farmers with extended profiles (admin/agent)',
          tags: ['FarmerInformation'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { $ref: '#/components/parameters/searchParam' },
          ],
          responses: { 200: { description: 'Farmers with profiles' } },
        },
        post: {
          summary: 'Create/upsert farmer extended profile (agent/admin)',
          tags: ['FarmerInformation'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    farmer_id: { type: 'string', description: 'Required when called by admin' },
                    province: { type: 'string' },
                    district: { type: 'string' },
                    farm_size: { type: 'number' },
                    tree_count: { type: 'integer' },
                    avocado_type: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Profile created/updated' } },
        },
      },
      '/api/farmer-information/{id}': {
        get: {
          summary: 'Get farmer with extended profile (admin/agent)',
          tags: ['FarmerInformation'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Farmer with profile' } },
        },
        put: {
          summary: 'Update farmer extended profile (agent/admin)',
          tags: ['FarmerInformation'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { 200: { description: 'Profile updated' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // AGENT INFORMATION
      // ═══════════════════════════════════════════════════════════════════
      '/api/agent-information': {
        get: {
          summary: 'List agents with profiles (admin)',
          tags: ['AgentInformation'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { $ref: '#/components/parameters/searchParam' },
          ],
          responses: { 200: { description: 'Agents with profiles' } },
        },
        post: {
          summary: 'Create/upsert agent profile (admin/agent)',
          tags: ['AgentInformation'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    agent_id: { type: 'string', description: 'Required when called by admin for another agent' },
                    territory: { type: 'array', items: { type: 'string' } },
                    province: { type: 'string' },
                    district: { type: 'string' },
                    specialization: { type: 'string' },
                    experience: { type: 'string' },
                    certification: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Agent profile created/updated' } },
        },
      },
      '/api/agent-information/me': {
        get: {
          summary: 'Get own agent profile (agent)',
          tags: ['AgentInformation'],
          responses: { 200: { description: 'Own agent profile' } },
        },
      },
      '/api/agent-information/{id}': {
        get: {
          summary: 'Get agent with profile by ID (admin/agent)',
          tags: ['AgentInformation'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Agent with profile' } },
        },
        put: {
          summary: 'Update agent profile (admin/agent)',
          tags: ['AgentInformation'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { 200: { description: 'Profile updated' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // PROFILE ACCESS (QR SYSTEM)
      // ═══════════════════════════════════════════════════════════════════
      '/api/profile-access/qr/{userId}': {
        get: {
          summary: 'Generate QR code image for a user (agent/admin)',
          tags: ['ProfileAccess'],
          parameters: [{ in: 'path', name: 'userId', required: true, schema: { type: 'string' } }],
          responses: {
            200: {
              description: 'Returns QR code as PNG image or base64 data URL',
              content: { 'image/png': {}, 'application/json': {} },
            },
          },
        },
      },
      '/api/profile-access/scan/{token}': {
        get: {
          summary: 'Get user profile by QR token (public — no auth required)',
          tags: ['ProfileAccess'],
          security: [],
          parameters: [{ in: 'path', name: 'token', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'User profile including farmer_profile or agent_profile relation' },
            404: { description: 'Invalid QR token' },
          },
        },
        put: {
          summary: 'Update user profile via QR scan (agent/admin)',
          tags: ['ProfileAccess'],
          parameters: [{ in: 'path', name: 'token', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    full_name: { type: 'string' },
                    phone: { type: 'string' },
                    email: { type: 'string' },
                    profile: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Profile updated' } },
        },
      },
      '/api/profile-access/bulk-import': {
        post: {
          summary: 'Bulk import users from Excel file (admin). Each imported user gets an access key.',
          tags: ['ProfileAccess'],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: { type: 'string', format: 'binary', description: '.xlsx file with columns: full_name, email, phone, role, age, gender, province, district, sector, farm_size, tree_count' },
                  },
                },
              },
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    users: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Import results with access keys',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    data: { total: 50, imported: 48, failed: 2, access_keys: [], errors: [] },
                  },
                },
              },
            },
          },
        },
      },
      '/api/profile-access/verify-access-key': {
        post: {
          summary: 'Verify a one-time access key (public)',
          tags: ['ProfileAccess'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['access_key'],
                  properties: {
                    access_key: { type: 'string', pattern: '^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$', example: 'ABCD-1234-EFGH' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Access key valid — returns user info' },
            404: { description: 'Key invalid, used, or expired' },
          },
        },
      },
      '/api/profile-access/update-profile-with-key': {
        post: {
          summary: 'Update farmer profile using a one-time access key (public)',
          tags: ['ProfileAccess'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['access_key'],
                  properties: {
                    access_key: { type: 'string' },
                    full_name: { type: 'string' },
                    phone: { type: 'string' },
                    profile: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Profile updated. Access key marked as used.' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // WEATHER
      // ═══════════════════════════════════════════════════════════════════
      '/api/weather/current': {
        get: {
          summary: 'Current weather for a location',
          tags: ['Weather'],
          parameters: [
            { in: 'query', name: 'location', required: true, schema: { type: 'string' }, description: 'City/district name (e.g. Kigali, Huye, Musanze)' },
          ],
          responses: { 200: { description: 'Current weather conditions' } },
        },
      },
      '/api/weather/forecast': {
        get: {
          summary: '7-day weather forecast for a location',
          tags: ['Weather'],
          parameters: [
            { in: 'query', name: 'location', required: true, schema: { type: 'string' } },
            { in: 'query', name: 'days', schema: { type: 'integer', default: 7, maximum: 14 } },
          ],
          responses: { 200: { description: 'Weather forecast array' } },
        },
      },
      '/api/weather/farm-conditions': {
        get: {
          summary: 'Weather conditions specific to a farm with farming recommendations',
          tags: ['Weather'],
          parameters: [
            { in: 'query', name: 'farm_id', required: true, schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Farm weather conditions and recommendations' } },
        },
      },
      '/api/weather/multi-location': {
        post: {
          summary: 'Weather for multiple locations at once',
          tags: ['Weather'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['locations'],
                  properties: {
                    locations: { type: 'array', items: { type: 'string' }, example: ['Kigali', 'Huye', 'Musanze'] },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Array of weather results' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // UPLOAD
      // ═══════════════════════════════════════════════════════════════════
      '/api/upload': {
        post: {
          summary: 'Upload a single file to Cloudinary (max 5MB: jpg, png, webp, pdf)',
          tags: ['Upload'],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Upload successful', content: { 'application/json': { example: { success: true, data: { url: 'https://res.cloudinary.com/...', filename: 'img-123.jpg', size: 204800 } } } } } },
        },
      },
      '/api/upload/multiple': {
        post: {
          summary: 'Upload multiple files to Cloudinary (max 5 files)',
          tags: ['Upload'],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    files: { type: 'array', items: { type: 'string', format: 'binary' } },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'All files uploaded' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // LOGS
      // ═══════════════════════════════════════════════════════════════════
      '/api/logs': {
        get: {
          summary: 'Paginated system logs (admin)',
          tags: ['Logs'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'level', schema: { type: 'string', enum: ['error', 'warn', 'info', 'http', 'debug'] } },
            { in: 'query', name: 'start_date', schema: { type: 'string', format: 'date' } },
            { in: 'query', name: 'end_date', schema: { type: 'string', format: 'date' } },
          ],
          responses: { 200: { description: 'Paginated log entries' } },
        },
      },
      '/api/logs/statistics': {
        get: {
          summary: 'Log level statistics (admin)',
          tags: ['Logs'],
          responses: { 200: { description: 'Count of log entries by level' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // MONITORING
      // ═══════════════════════════════════════════════════════════════════
      '/api/monitoring/health': {
        get: {
          summary: 'Database and system health check',
          tags: ['Monitoring'],
          responses: {
            200: { description: 'Health status including DB ping and system info' },
          },
        },
      },
      '/api/monitoring/stats': {
        get: {
          summary: 'API usage statistics (admin)',
          tags: ['Monitoring'],
          responses: { 200: { description: 'Request counts and usage data from logs' } },
        },
      },
      '/api/monitoring/system': {
        get: {
          summary: 'System resource information — CPU, memory, uptime (admin)',
          tags: ['Monitoring'],
          responses: { 200: { description: 'OS and process resource usage' } },
        },
      },
    },
  },
  apis: [],
};
