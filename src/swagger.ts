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
            token: { type: 'string', description: 'Short-lived JWT access token' },
            refreshToken: { type: 'string', description: 'Long-lived JWT refresh token (type: refresh), used against POST /api/auth/refresh to obtain a new access token' },
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
            organic_certified: { type: 'boolean', default: false },
            irrigation_system: { type: 'string', nullable: true },
            soil_type: { type: 'string', nullable: true },
            latitude: { type: 'number', nullable: true },
            longitude: { type: 'number', nullable: true },
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
            shopName: { type: 'string' },
            description: { type: 'string' },
            province: { type: 'string' },
            district: { type: 'string' },
            ownerName: { type: 'string' },
            ownerEmail: { type: 'string', format: 'email' },
            ownerPhone: { type: 'string' },
            created_by: { type: 'string', description: 'User id of the admin who created this shop' },
            manager_id: { type: 'string', nullable: true, description: 'User id of the shop_manager who manages this shop; scopes GET/PUT/DELETE access for that role' },
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
            name: { type: 'string', description: 'Derived from first_name + last_name if not provided directly' },
            first_name: { type: 'string', nullable: true },
            last_name: { type: 'string', nullable: true },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            address: { type: 'string', nullable: true, description: 'Legacy free-text address' },
            address_details: { type: 'object', nullable: true, description: '{street, city, state, zipCode, country}' },
            type: { type: 'string', default: 'individual', description: "e.g. 'individual' | 'business'" },
            company: { type: 'string', nullable: true },
            preferences: { type: 'object', nullable: true, description: '{organic, local, deliveryMethod, communicationMethod}' },
            tags: { type: 'array', items: { type: 'string' } },
            notes: { type: 'string', nullable: true },
            shop_id: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['active', 'inactive'] },
            total_orders: { type: 'integer' },
            total_spent: { type: 'number' },
            last_order_date: { type: 'string', format: 'date-time', nullable: true },
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
            age: { type: 'integer', nullable: true },
            id_number: { type: 'string', nullable: true },
            gender: { type: 'string', enum: ['Male', 'Female', 'Other'], nullable: true },
            marital_status: { type: 'string', enum: ['Single', 'Married', 'Divorced', 'Widowed'], nullable: true },
            education_level: { type: 'string', enum: ['Primary', 'Secondary', 'University', 'None'], nullable: true },
            province: { type: 'string', nullable: true },
            district: { type: 'string', nullable: true },
            sector: { type: 'string', nullable: true },
            cell: { type: 'string', nullable: true },
            village: { type: 'string', nullable: true },
            farm_age: { type: 'integer', nullable: true },
            planted: { type: 'string', nullable: true },
            avocado_type: { type: 'string', nullable: true },
            mixed_percentage: { type: 'number', nullable: true },
            farm_size: { type: 'number', nullable: true },
            tree_count: { type: 'integer', nullable: true },
            upi_number: { type: 'string', nullable: true },
            farm_province: { type: 'string', nullable: true },
            farm_district: { type: 'string', nullable: true },
            farm_sector: { type: 'string', nullable: true },
            farm_cell: { type: 'string', nullable: true },
            farm_village: { type: 'string', nullable: true },
            assistance: { type: 'array', items: { type: 'string' } },
            image: { type: 'string', nullable: true, description: 'Profile photo URL' },
            verification_status: { type: 'string', enum: ['pending', 'verified', 'rejected'], description: 'Set only via PUT /api/farmer-information/{id}/verify (admin)' },
          },
        },
        // ─── Trees ───────────────────────────────────────────────────────
        TreeRecord: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            farm_id: { type: 'string' },
            tree_number: { type: 'string', example: 'T-001' },
            variety: { type: 'string', nullable: true },
            planted_at: { type: 'string', format: 'date', nullable: true },
            age_years: { type: 'number', nullable: true },
            height_m: { type: 'number', nullable: true },
            canopy_m: { type: 'number', nullable: true },
            health_status: { type: 'string', enum: ['healthy', 'stressed', 'diseased', 'dead'], example: 'healthy' },
            notes: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        TreeDisease: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            tree_id: { type: 'string' },
            farm_id: { type: 'string' },
            disease_name: { type: 'string' },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            detected_at: { type: 'string', format: 'date' },
            treated_at: { type: 'string', format: 'date', nullable: true },
            treatment_notes: { type: 'string', nullable: true },
            resolved: { type: 'boolean', default: false },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        // ─── Diseases ─────────────────────────────────────────────────────
        DiseaseRegistry: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            symptoms: { type: 'string', nullable: true },
            treatment: { type: 'string', nullable: true },
            prevention: { type: 'string', nullable: true },
            severity_default: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        DiseaseCase: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            farm_id: { type: 'string' },
            disease_id: { type: 'string' },
            reported_by: { type: 'string' },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            status: { type: 'string', enum: ['open', 'in_treatment', 'resolved', 'closed'] },
            affected_trees: { type: 'integer' },
            detected_at: { type: 'string', format: 'date' },
            resolved_at: { type: 'string', format: 'date', nullable: true },
            notes: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        // ─── Forecasting ──────────────────────────────────────────────────
        HarvestForecast: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            forecast_number: { type: 'string' },
            farm_id: { type: 'string', nullable: true },
            province: { type: 'string', nullable: true },
            district: { type: 'string', nullable: true },
            forecast_year: { type: 'integer' },
            forecast_season: { type: 'string', nullable: true },
            predicted_kg: { type: 'number', example: 500 },
            confidence_pct: { type: 'number', default: 70 },
            actual_kg: { type: 'number', nullable: true },
            variance_pct: { type: 'number', nullable: true },
            basis: { type: 'string', nullable: true },
            notes: { type: 'string', nullable: true },
            created_by: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        // ─── Procurement ──────────────────────────────────────────────────
        PurchaseOrder: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            supplier_id: { type: 'string' },
            created_by: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'submitted', 'approved', 'received', 'cancelled'] },
            expected_delivery: { type: 'string', format: 'date', nullable: true },
            total_amount: { type: 'number' },
            notes: { type: 'string', nullable: true },
            items: { type: 'array', items: { $ref: '#/components/schemas/PurchaseOrderItem' } },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        PurchaseOrderItem: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            po_id: { type: 'string' },
            product_id: { type: 'string' },
            quantity: { type: 'integer' },
            unit_price: { type: 'number' },
            total_price: { type: 'number' },
          },
        },
        GoodsReceipt: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            po_id: { type: 'string' },
            received_by: { type: 'string' },
            received_at: { type: 'string', format: 'date-time' },
            notes: { type: 'string', nullable: true },
            items: { type: 'array', items: { $ref: '#/components/schemas/GoodsReceiptItem' } },
          },
        },
        GoodsReceiptItem: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            receipt_id: { type: 'string' },
            product_id: { type: 'string' },
            quantity_ordered: { type: 'integer' },
            quantity_received: { type: 'integer' },
          },
        },
        // ─── Training ────────────────────────────────────────────────────
        TrainingContent: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            content_type: { type: 'string', enum: ['article', 'video', 'pdf', 'quiz'] },
            status: { type: 'string', enum: ['draft', 'published', 'archived'] },
            content_url: { type: 'string', nullable: true },
            thumbnail_url: { type: 'string', nullable: true },
            tags: { type: 'array', items: { type: 'string' } },
            created_by: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        // ─── Geography ───────────────────────────────────────────────────
        Province: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', example: 'Southern Province' },
            code: { type: 'string', nullable: true, example: 'S' },
          },
        },
        District: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', example: 'Huye' },
            province_id: { type: 'string' },
            code: { type: 'string', nullable: true },
          },
        },
        // ─── Settings ────────────────────────────────────────────────────
        SystemSetting: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            key: { type: 'string', example: 'platform_name' },
            value: { type: 'string', example: 'Avocado Dashboard' },
            description: { type: 'string', nullable: true },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        // ─── Cart ────────────────────────────────────────────────────────
        Cart: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            user_id: { type: 'string' },
            items: { type: 'array', items: { $ref: '#/components/schemas/CartItem' } },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        CartItem: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            cart_id: { type: 'string' },
            product_id: { type: 'string' },
            quantity: { type: 'integer', example: 2 },
            unit_price: { type: 'number' },
          },
        },
        // ─── Visits ──────────────────────────────────────────────────────
        FarmVisit: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            farm_id: { type: 'string' },
            agent_id: { type: 'string' },
            scheduled_at: { type: 'string', format: 'date-time' },
            completed_at: { type: 'string', format: 'date-time', nullable: true },
            status: { type: 'string', enum: ['scheduled', 'completed', 'cancelled'] },
            purpose: { type: 'string', nullable: true },
            notes: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        // ─── Supplier evaluation ─────────────────────────────────────────
        SupplierEvaluation: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            supplier_id: { type: 'string' },
            evaluated_by: { type: 'string' },
            rating: { type: 'integer', minimum: 1, maximum: 5, example: 4 },
            comment: { type: 'string', nullable: true },
            evaluated_at: { type: 'string', format: 'date-time' },
          },
        },
      },
      parameters: {
        pageParam: { in: 'query', name: 'page', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        limitParam: { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 }, description: 'Items per page' },
        searchParam: { in: 'query', name: 'search', schema: { type: 'string' }, description: 'Search term' },
        idParam: { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Resource CUID' },
        shopNumberParam: { in: 'path', name: 'shopNumber', required: true, schema: { type: 'integer' }, description: 'Shop number (auto-increment integer)' },
        escalatedParam: { in: 'query', name: 'escalated', schema: { type: 'boolean' }, description: 'Filter to only requests auto-escalated to urgent priority past their due_date' },
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
      { name: 'Upload', description: 'File upload (MinIO object storage)' },
      { name: 'Logs', description: 'System logs (admin)' },
      { name: 'Monitoring', description: 'Health and system metrics' },
      { name: 'Welcome', description: 'Public platform overview' },
      { name: 'Trees', description: 'Avocado tree records and tree-level disease tracking' },
      { name: 'Diseases', description: 'Disease registry, cases, and outbreak management' },
      { name: 'Forecasting', description: 'Harvest yield forecasting and actuals tracking' },
      { name: 'Procurement', description: 'Purchase orders, approval workflow, and goods receipts' },
      { name: 'Training', description: 'Training content library and farmer access tracking' },
      { name: 'Geography', description: 'Rwanda administrative geography (Province → Village)' },
      { name: 'Settings', description: 'System-wide configuration key-value settings' },
      { name: 'Cart', description: 'Shopping cart and checkout for farmers' },
      { name: 'Visits', description: 'Agent farm visit scheduling and reporting' },
      { name: 'Documents', description: 'Generated/uploaded documents, e-signatures, and notarization workflow' },
      { name: 'PendingFarmers', description: 'Farmers registered by staff without a login account yet, pending approval' },
      { name: 'SMS', description: 'Ad-hoc SMS sending via Africa\'s Talking (admin only)' },
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
          summary: 'Comprehensive self-service registration. Role-conditional: farmer additionally creates a FarmerProfile + seed Farm record, agent creates an AgentProfile, shop_manager creates a Shop (linked via manager_id). role=admin is rejected (admins are seeded/created by other admins only).',
          tags: ['Auth'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password', 'full_name', 'phone', 'role'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8, description: 'Must contain upper, lower, digit, and special character' },
                    full_name: { type: 'string', minLength: 2 },
                    phone: { type: 'string' },
                    role: { type: 'string', enum: ['farmer', 'agent', 'shop_manager'] },
                    age: { type: 'integer', description: 'farmer' },
                    id_number: { type: 'string', description: 'farmer' },
                    gender: { type: 'string', enum: ['Male', 'Female', 'Other'], description: 'farmer, required' },
                    marital_status: { type: 'string', enum: ['Single', 'Married', 'Divorced', 'Widowed'], description: 'farmer' },
                    education_level: { type: 'string', enum: ['Primary', 'Secondary', 'University', 'None'], description: 'farmer' },
                    province: { type: 'string', description: 'farmer (required) / agent (required) / shop_manager (required)' },
                    district: { type: 'string', description: 'farmer (required) / agent (required) / shop_manager (required)' },
                    sector: { type: 'string', description: 'farmer / agent' },
                    cell: { type: 'string', description: 'farmer / agent' },
                    village: { type: 'string', description: 'farmer / agent' },
                    farm_age: { type: 'integer', description: 'farmer' },
                    planted: { type: 'string', description: 'farmer — year planted, also seeds Farm.planting_date' },
                    avocado_type: { type: 'string', enum: ['Hass', 'Fuerte', 'Bacon', 'Zutano', 'Mixed'], description: 'farmer, required' },
                    mixed_percentage: { type: 'number', description: 'farmer' },
                    farm_size: { type: 'number', description: 'farmer, required' },
                    tree_count: { type: 'integer', description: 'farmer' },
                    upi_number: { type: 'string', description: 'farmer' },
                    farm_province: { type: 'string', description: 'farmer' },
                    farm_district: { type: 'string', description: 'farmer' },
                    farm_sector: { type: 'string', description: 'farmer' },
                    farm_cell: { type: 'string', description: 'farmer' },
                    farm_village: { type: 'string', description: 'farmer' },
                    assistance: { type: 'array', items: { type: 'string' }, description: 'farmer' },
                    image: { type: 'string', description: 'farmer — profile photo URL, typically obtained via POST /api/upload first' },
                    organic_certified: { type: 'boolean', default: false, description: 'farmer — seeds Farm.organic_certified' },
                    irrigation_system: { type: 'string', description: 'farmer — seeds Farm.irrigation_system' },
                    soil_type: { type: 'string', description: 'farmer — seeds Farm.soil_type' },
                    specialization: { type: 'string', description: 'agent, required' },
                    experience: { type: 'string', description: 'agent' },
                    certification: { type: 'string', description: 'agent' },
                    shopName: { type: 'string', description: 'shop_manager, required' },
                    description: { type: 'string', description: 'shop_manager, required' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'User (and role-specific profile/Farm/Shop) created', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
            400: { description: 'Validation failed, or missing role-specific required fields' },
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
                    newPassword: { type: 'string', minLength: 8 },
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
          summary: 'Exchange a refresh token for a new short-lived access token. Does not require an Authorization header (the access token may already be expired).',
          tags: ['Auth'],
          security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } },
          },
          responses: {
            200: { description: 'New access token issued', content: { 'application/json': { schema: { type: 'object', properties: { token: { type: 'string' }, user: { type: 'object' } } } } } },
            400: { description: 'refreshToken missing' },
            401: { description: 'Invalid, expired, or non-refresh token; or user no longer active' },
          },
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
        post: {
          summary: 'Create a generic user account (admin). Defaults role to shop_manager if omitted/invalid; sets an auto-generated default password (returned in the response).',
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
                    role: { type: 'string', enum: ['admin', 'agent', 'farmer', 'shop_manager'], default: 'shop_manager' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'User created, includes default_password' } },
        },
      },
      '/api/users/me': {
        get: {
          summary: 'Get the authenticated user',
          tags: ['Users'],
          responses: { 200: { description: 'Current user' } },
        },
        put: {
          summary: "Update the authenticated user's own account fields (name, phone; role/status/password/email are ignored). If role is farmer, also merges farm fields into the legacy User.profile JSON blob.",
          tags: ['Users'],
          requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { 200: { description: 'Profile updated' } },
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
      '/api/users/{id}/status': {
        put: {
          summary: "Set a user's active/inactive status (admin)",
          tags: ['Users'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['active', 'inactive'] } } } } } },
          responses: { 200: { description: 'Status updated' } },
        },
      },
      '/api/users/{id}/role': {
        put: {
          summary: "Change a user's role (admin)",
          tags: ['Users'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['role'], properties: { role: { type: 'string', enum: ['admin', 'agent', 'farmer', 'shop_manager'] } } } } } },
          responses: { 200: { description: 'Role updated' } },
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
        put: {
          summary: 'Set product stock to an absolute quantity (admin/shop_manager/agent). Records a StockHistory entry when the quantity changes.',
          tags: ['Products'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['quantity'],
                  properties: {
                    quantity: { type: 'integer', minimum: 0, description: 'New absolute quantity (not a delta)' },
                    reason: { type: 'string', enum: ['restock', 'sale', 'adjustment', 'damage', 'return', 'other'], default: 'adjustment' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Stock updated (and history recorded if the quantity changed)' }, 400: { description: 'Quantity must be a non-negative integer' }, 404: { description: 'Product not found' } },
        },
      },
      '/api/products/{id}/stock-history': {
        get: {
          summary: 'Paginated stock change history for a product (admin/shop_manager)',
          tags: ['Products'],
          parameters: [{ $ref: '#/components/parameters/idParam' }, { $ref: '#/components/parameters/pageParam' }, { $ref: '#/components/parameters/limitParam' }],
          responses: { 200: { description: "Paginated StockHistory entries, each including the creator's full_name and email" } },
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
          summary: 'Create order. Validates stock and decrements quantities atomically.',
          description: '`customer_id` must reference a **Customer** record (from `GET /api/customers`), not a User ID. Creates order items, deducts stock in a single transaction.',
          tags: ['Orders'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['customer_id', 'items', 'shipping_address'],
                  properties: {
                    customer_id: { type: 'string', description: 'ID from the Customer table (not User ID)' },
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
        put: {
          summary: 'Partially update an order, excluding items (admin/shop_manager)',
          tags: ['Orders'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { shipping_address: { type: 'object' }, billing_address: { type: 'object' }, payment_method: { type: 'string' }, payment_status: { type: 'string' }, notes: { type: 'string' } } } } } },
          responses: { 200: { description: 'Order updated' }, 404: { description: 'Order not found' } },
        },
        delete: {
          summary: 'Cancel/delete order (admin)',
          tags: ['Orders'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Order cancelled' } },
        },
      },
      '/api/orders/user/{userId}': {
        get: {
          summary: 'List orders for a specific user (admin/shop_manager, or the user themselves)',
          tags: ['Orders'],
          parameters: [
            { in: 'path', name: 'userId', required: true, schema: { type: 'string' } },
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
          ],
          responses: { 200: { description: 'Paginated orders belonging to the user' }, 403: { description: 'Not an admin/shop_manager and not the requesting user' } },
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
      // One table (ServiceRequest) discriminated by service_type. assign/start/
      // cancel/reject/feedback/status are generic across every type; approve/
      // complete are type-specific (e.g. approve-harvest, complete-ipm-routine).
      // ═══════════════════════════════════════════════════════════════════
      '/api/service-requests/harvest': {
        post: {
          summary: 'Create a harvest request (farmer for self, or agent on behalf of a farmer)',
          tags: ['ServiceRequests'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['workersNeeded', 'treesToHarvest', 'harvestDateFrom', 'harvestDateTo', 'location'],
                  properties: {
                    workersNeeded: { type: 'integer', minimum: 1 },
                    treesToHarvest: { type: 'integer', minimum: 1 },
                    harvestDateFrom: { type: 'string', format: 'date' },
                    harvestDateTo: { type: 'string', format: 'date' },
                    equipmentNeeded: { type: 'array', items: { type: 'string' } },
                    harvestImages: { type: 'array', items: { type: 'string' } },
                    location: { type: 'object', required: ['province'], properties: { province: { type: 'string' }, district: { type: 'string' }, sector: { type: 'string' }, cell: { type: 'string' }, village: { type: 'string' } } },
                    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
                    notes: { type: 'string' },
                    farmer_id: { type: 'string', description: 'Required when an agent creates this on behalf of a farmer' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Harvest request created' } },
        },
        get: {
          summary: 'List harvest requests (role-scoped)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/pageParam' }, { $ref: '#/components/parameters/limitParam' }, { $ref: '#/components/parameters/escalatedParam' }],
          responses: { 200: { description: 'Paginated harvest requests' } },
        },
      },
      '/api/service-requests/harvesting-plan': {
        post: {
          summary: 'Create a harvesting plan request (farmer for self, or agent on behalf of a farmer)',
          tags: ['ServiceRequests'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['plannedHarvestDate', 'estimatedYield', 'farmSize', 'laborRequirement', 'marketTarget', 'location'],
                  properties: {
                    plannedHarvestDate: { type: 'string', format: 'date' },
                    estimatedYield: { type: 'string' },
                    farmSize: { type: 'string' },
                    laborRequirement: { type: 'string' },
                    marketTarget: { type: 'string' },
                    location: { type: 'object' },
                    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
                    notes: { type: 'string' },
                    farmer_id: { type: 'string', description: 'Required when an agent creates this on behalf of a farmer' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Harvesting plan request created' } },
        },
        get: {
          summary: 'List harvesting plan requests (role-scoped)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/pageParam' }, { $ref: '#/components/parameters/limitParam' }, { $ref: '#/components/parameters/escalatedParam' }],
          responses: { 200: { description: 'Paginated harvesting plan requests' } },
        },
      },
      '/api/service-requests/ipm-routine': {
        post: {
          summary: 'Create an IPM (Integrated Pest Management) routine request (farmer for self, or agent on behalf of a farmer)',
          tags: ['ServiceRequests'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['scheduledDate', 'farmSize', 'pestType', 'ipmMethod', 'laborRequired', 'targetArea', 'location'],
                  properties: {
                    scheduledDate: { type: 'string', format: 'date' },
                    farmSize: { type: 'number' },
                    pestType: { type: 'array', items: { type: 'string' }, minItems: 1 },
                    ipmMethod: { type: 'array', items: { type: 'string' }, minItems: 1 },
                    chemicalsNeeded: { type: 'string' },
                    equipmentNeeded: { type: 'array', items: { type: 'string' } },
                    laborRequired: { type: 'integer' },
                    targetArea: { type: 'string' },
                    severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                    preventiveMeasures: { type: 'string' },
                    followUpDate: { type: 'string', format: 'date' },
                    specialInstructions: { type: 'string' },
                    location: { type: 'object' },
                    farmer_id: { type: 'string', description: 'Required when an agent creates this on behalf of a farmer' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'IPM routine request created' } },
        },
        get: {
          summary: 'List IPM routine requests (role-scoped)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/pageParam' }, { $ref: '#/components/parameters/limitParam' }, { $ref: '#/components/parameters/escalatedParam' }],
          responses: { 200: { description: 'Paginated IPM routine requests' } },
        },
      },
      '/api/service-requests/pest-management': {
        post: {
          summary: 'Create a pest management request (farmer)',
          tags: ['ServiceRequests'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'description', 'location', 'pest_management_details', 'farmer_info'],
                  properties: {
                    title: { type: 'string', maxLength: 200 },
                    description: { type: 'string', maxLength: 1000 },
                    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
                    location: { type: 'object', required: ['province'], properties: { province: { type: 'string' } } },
                    pest_management_details: {
                      type: 'object',
                      required: ['pests_diseases', 'severity_level'],
                      properties: {
                        pests_diseases: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } }, minItems: 1 },
                        first_noticed: { type: 'string', maxLength: 500 },
                        damage_observed: { type: 'string' },
                        damage_details: { type: 'string', maxLength: 1000 },
                        control_methods_tried: { type: 'string', maxLength: 1000 },
                        severity_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                      },
                    },
                    farmer_info: { type: 'object', required: ['name', 'phone'], properties: { name: { type: 'string' }, phone: { type: 'string' }, location: { type: 'object' } } },
                    attachments: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Pest management request created' } },
        },
        get: {
          summary: 'List pest management requests (role-scoped)',
          tags: ['ServiceRequests'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'status', schema: { type: 'string' } },
            { in: 'query', name: 'priority', schema: { type: 'string' } },
            { $ref: '#/components/parameters/escalatedParam' },
          ],
          responses: { 200: { description: 'Paginated pest management requests' } },
        },
      },
      '/api/service-requests/property-evaluation': {
        post: {
          summary: 'Create a property evaluation request (farmer)',
          tags: ['ServiceRequests'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['irrigationSource', 'visitStartDate', 'visitEndDate', 'location'],
                  properties: {
                    irrigationSource: { type: 'string', enum: ['Yes', 'No'] },
                    irrigationTiming: { type: 'string', description: 'Required when irrigationSource is Yes' },
                    soilTesting: { type: 'string' },
                    visitStartDate: { type: 'string', format: 'date' },
                    visitEndDate: { type: 'string', format: 'date', description: 'Must be exactly 5 days (inclusive) after visitStartDate' },
                    evaluationPurpose: { type: 'string' },
                    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
                    notes: { type: 'string' },
                    location: { type: 'object', required: ['province'], properties: { province: { type: 'string' }, district: { type: 'string' }, farm_name: { type: 'string' } } },
                    property_details: { type: 'object', properties: { farm_size: { type: 'string' }, crop_types: { type: 'string' }, current_irrigation_system: { type: 'string' }, soil_type: { type: 'string' }, water_access: { type: 'string' } } },
                    certified_valuation_requested: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Property evaluation request created' } },
        },
        get: {
          summary: 'List property evaluation requests (role-scoped)',
          tags: ['ServiceRequests'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { $ref: '#/components/parameters/escalatedParam' },
          ],
          responses: { 200: { description: 'Paginated property evaluation requests' } },
        },
      },
      '/api/service-requests/property-evaluation/{id}': {
        put: {
          summary: 'Edit a pending property evaluation request (farmer, own request only, before approval)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', description: 'Same shape as create; only provided fields are updated' } } } },
          responses: { 200: { description: 'Request updated' }, 400: { description: 'Only pending requests can be edited' }, 403: { description: 'Not the owning farmer' } },
        },
      },
      '/api/service-requests/property-evaluation/stats': {
        get: {
          summary: 'Aggregate property evaluation statistics (admin/agent)',
          tags: ['ServiceRequests'],
          parameters: [
            { in: 'query', name: 'date_from', schema: { type: 'string', format: 'date' } },
            { in: 'query', name: 'date_to', schema: { type: 'string', format: 'date' } },
            { in: 'query', name: 'agent_id', schema: { type: 'string' } },
            { in: 'query', name: 'province', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'total, by_status counts, average_cost_estimate, average_final_cost' } },
        },
      },
      '/api/service-requests/harvest/agent/me': {
        get: {
          summary: "List the authenticated agent's assigned harvest requests",
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/pageParam' }, { $ref: '#/components/parameters/limitParam' }],
          responses: { 200: { description: 'Paginated harvest requests assigned to this agent' } },
        },
      },
      '/api/service-requests/harvesting-plan/agent/me': {
        get: {
          summary: "List the authenticated agent's assigned harvesting plan requests",
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/pageParam' }, { $ref: '#/components/parameters/limitParam' }],
          responses: { 200: { description: 'Paginated harvesting plan requests assigned to this agent' } },
        },
      },
      '/api/service-requests/ipm-routine/agent/me': {
        get: {
          summary: "List the authenticated agent's assigned IPM routine requests",
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/pageParam' }, { $ref: '#/components/parameters/limitParam' }],
          responses: { 200: { description: 'Paginated IPM routine requests assigned to this agent' } },
        },
      },
      '/api/service-requests/farmer/{farmerId}': {
        get: {
          summary: 'List all service requests for a given farmer, across every service type (admin/agent, or the farmer themself)',
          tags: ['ServiceRequests'],
          parameters: [
            { in: 'path', name: 'farmerId', required: true, schema: { type: 'string' } },
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'status', schema: { type: 'string' } },
            { in: 'query', name: 'service_type', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Paginated service requests' }, 403: { description: 'Farmers may only query their own id' } },
        },
      },
      '/api/service-requests/agent/{agentId}': {
        get: {
          summary: 'List all service requests assigned to a given agent, across every service type (admin, or the agent themself)',
          tags: ['ServiceRequests'],
          parameters: [
            { in: 'path', name: 'agentId', required: true, schema: { type: 'string' } },
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'status', schema: { type: 'string' } },
            { in: 'query', name: 'service_type', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Paginated service requests' }, 403: { description: 'Agents may only query their own id' } },
        },
      },
      '/api/service-requests/{id}': {
        get: {
          summary: 'Get a service request by ID (any type)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Service request details, including farmer and agent summaries' } },
        },
      },
      '/api/service-requests/{id}/status': {
        put: {
          summary: 'Generically set the status of a service request, any type (admin)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'assigned', 'in_progress', 'completed', 'cancelled'] } } } } },
          },
          responses: { 200: { description: 'Status updated' } },
        },
      },
      '/api/service-requests/{id}/reject': {
        put: {
          summary: 'Reject a service request, any type (admin)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['rejection_reason'], properties: { rejection_reason: { type: 'string' } } } } } },
          responses: { 200: { description: 'Request rejected' }, 400: { description: 'Only pending/approved requests can be rejected' } },
        },
      },
      '/api/service-requests/{id}/assign': {
        put: {
          summary: 'Assign an agent to a service request, any type (admin)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['agent_id'], properties: { agent_id: { type: 'string' }, scheduled_date: { type: 'string', format: 'date-time' } } } } } },
          responses: { 200: { description: 'Agent assigned, farmer and agent notified' } },
        },
      },
      '/api/service-requests/{id}/start': {
        put: {
          summary: 'Mark a service request in_progress, any type (admin, or the assigned agent)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { start_notes: { type: 'string' } } } } } },
          responses: { 200: { description: 'Request started' }, 400: { description: 'Must be approved/assigned first' } },
        },
      },
      '/api/service-requests/{id}/cancel': {
        put: {
          summary: 'Cancel a service request, any type (farmer can cancel own pending request; admin can cancel any non-terminal request)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: 'string' } } } } } },
          responses: { 200: { description: 'Request cancelled' } },
        },
      },
      '/api/service-requests/{id}/feedback': {
        post: {
          summary: 'Submit feedback for a completed service request, any type (farmer)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['rating'], properties: { rating: { type: 'integer', minimum: 1, maximum: 5 }, comment: { type: 'string' } } } } } },
          responses: { 200: { description: 'Feedback recorded' }, 400: { description: 'Request must be completed; feedback can only be submitted once' } },
        },
      },
      '/api/service-requests/{id}/approve-harvest': {
        put: {
          summary: 'Approve a harvest request (admin)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { agent_id: { type: 'string' }, scheduled_date: { type: 'string', format: 'date-time' }, cost_estimate: { type: 'number' }, notes: { type: 'string' }, approved_workers: { type: 'integer' }, approved_equipment: { type: 'array', items: { type: 'string' } } } } } } },
          responses: { 200: { description: 'Harvest request approved' } },
        },
      },
      '/api/service-requests/{id}/complete-harvest': {
        put: {
          summary: 'Complete a harvest request (admin, or the assigned agent)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { completion_notes: { type: 'string' }, actual_workers_used: { type: 'integer' }, actual_harvest_amount: { type: 'string' }, harvest_quality_notes: { type: 'string' }, completion_images: { type: 'array', items: { type: 'string' } } } } } } },
          responses: { 200: { description: 'Harvest request completed, farmer notified' } },
        },
      },
      '/api/service-requests/{id}/approve-harvesting-plan': {
        put: {
          summary: 'Approve a harvesting plan request (admin)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { agent_id: { type: 'string' }, scheduled_date: { type: 'string', format: 'date-time' }, cost_estimate: { type: 'number' }, notes: { type: 'string' } } } } } },
          responses: { 200: { description: 'Harvesting plan request approved' } },
        },
      },
      '/api/service-requests/{id}/complete-harvesting-plan': {
        put: {
          summary: 'Complete a harvesting plan request (admin, or the assigned agent)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { completion_notes: { type: 'string' }, actual_yield: { type: 'string' }, completion_images: { type: 'array', items: { type: 'string' } } } } } } },
          responses: { 200: { description: 'Harvesting plan request completed, farmer notified' } },
        },
      },
      '/api/service-requests/{id}/approve-ipm-routine': {
        put: {
          summary: 'Approve an IPM routine request (admin)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { agent_id: { type: 'string' }, scheduled_date: { type: 'string', format: 'date-time' }, cost_estimate: { type: 'number' }, notes: { type: 'string' } } } } } },
          responses: { 200: { description: 'IPM routine request approved' } },
        },
      },
      '/api/service-requests/{id}/complete-ipm-routine': {
        put: {
          summary: 'Complete an IPM routine request (admin, or the assigned agent)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { completion_notes: { type: 'string' }, treatment_outcome: { type: 'string' }, completion_images: { type: 'array', items: { type: 'string' } } } } } } },
          responses: { 200: { description: 'IPM routine request completed, farmer notified' } },
        },
      },
      '/api/service-requests/{id}/approve-pest-management': {
        put: {
          summary: 'Approve a pest management request (admin)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { agent_id: { type: 'string' }, scheduled_date: { type: 'string', format: 'date-time' }, cost_estimate: { type: 'number' }, notes: { type: 'string' } } } } } },
          responses: { 200: { description: 'Pest management request approved' } },
        },
      },
      '/api/service-requests/{id}/complete-pest-management': {
        put: {
          summary: 'Complete a pest management request (admin, or the assigned agent)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { completion_notes: { type: 'string' }, treatment_applied: { type: 'string' }, completion_images: { type: 'array', items: { type: 'string' } } } } } } },
          responses: { 200: { description: 'Pest management request completed, farmer notified' } },
        },
      },
      '/api/service-requests/{id}/approve-property-evaluation': {
        put: {
          summary: 'Approve a property evaluation request (admin)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { agent_id: { type: 'string' }, scheduled_date: { type: 'string', format: 'date-time' }, cost_estimate: { type: 'number' }, notes: { type: 'string' } } } } } },
          responses: { 200: { description: 'Property evaluation request approved' } },
        },
      },
      '/api/service-requests/{id}/complete-property-evaluation': {
        put: {
          summary: 'Complete a property evaluation request (admin, or the assigned agent)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { completion_notes: { type: 'string' }, evaluation_report: { type: 'object' }, follow_up_required: { type: 'boolean' }, follow_up_date: { type: 'string', format: 'date' }, attachments: { type: 'array', items: { type: 'string' } } } } } } },
          responses: { 200: { description: 'Property evaluation request completed, farmer notified' } },
        },
      },
      '/api/service-requests/{id}/schedule-visit': {
        put: {
          summary: 'Schedule a property evaluation visit (admin, or the assigned agent)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['visit_date', 'visit_time'], properties: { visit_date: { type: 'string', format: 'date' }, visit_time: { type: 'string' }, estimated_duration: { type: 'string' }, preparation_notes: { type: 'string' }, farmer_instructions: { type: 'string' } } } } } },
          responses: { 200: { description: 'Visit scheduled, farmer notified' } },
        },
      },
      '/api/service-requests/{id}/reschedule-visit': {
        put: {
          summary: 'Reschedule a previously scheduled property evaluation visit (admin, or the assigned agent)',
          tags: ['ServiceRequests'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['new_visit_date', 'reason'], properties: { new_visit_date: { type: 'string', format: 'date' }, new_visit_time: { type: 'string' }, reason: { type: 'string' } } } } } },
          responses: { 200: { description: 'Visit rescheduled, farmer notified, history preserved' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // SHOPS
      // ═══════════════════════════════════════════════════════════════════
      '/api/shops': {
        get: {
          summary: 'List shops (admin sees all; shop_manager sees only the shop they manage, via manager_id)',
          tags: ['Shops'],
          responses: { 200: { description: 'Shops list' } },
        },
      },
      '/api/shops/addshop': {
        post: {
          summary: 'Create a shop (admin)',
          tags: ['Shops'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['shopName', 'description', 'province', 'district', 'ownerName', 'ownerEmail', 'ownerPhone'],
                  properties: {
                    shopName: { type: 'string', minLength: 2, maxLength: 200 },
                    description: { type: 'string', maxLength: 1000 },
                    province: { type: 'string' },
                    district: { type: 'string' },
                    ownerName: { type: 'string', minLength: 2 },
                    ownerEmail: { type: 'string', format: 'email' },
                    ownerPhone: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Shop created with auto-assigned shop_number; not linked to a manager unless created via farmer/shop_manager registration' } },
        },
      },
      '/api/shops/{shopNumber}': {
        get: {
          summary: 'Get shop by shop number (integer)',
          tags: ['Shops'],
          parameters: [{ $ref: '#/components/parameters/shopNumberParam' }],
          responses: { 200: { description: 'Shop details' }, 403: { description: 'shop_manager requesting a shop they do not manage' } },
        },
        put: {
          summary: 'Update shop (admin, or the managing shop_manager)',
          tags: ['Shops'],
          parameters: [{ $ref: '#/components/parameters/shopNumberParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { shopName: { type: 'string' }, description: { type: 'string' }, province: { type: 'string' }, district: { type: 'string' }, ownerName: { type: 'string' }, ownerEmail: { type: 'string' }, ownerPhone: { type: 'string' } } } } } },
          responses: { 200: { description: 'Shop updated' }, 403: { description: 'shop_manager updating a shop they do not manage' } },
        },
        delete: {
          summary: 'Delete shop (admin, or the managing shop_manager)',
          tags: ['Shops'],
          parameters: [{ $ref: '#/components/parameters/shopNumberParam' }],
          responses: { 200: { description: 'Shop deleted' }, 403: { description: 'shop_manager deleting a shop they do not manage' } },
        },
      },
      '/api/shops/{shopNumber}/inventory': {
        get: {
          summary: "List shop's products/inventory (Products whose supplier_id equals this shop's id)",
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
          summary: "List orders containing the shop's products",
          tags: ['Shops'],
          parameters: [
            { $ref: '#/components/parameters/shopNumberParam' },
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
          ],
          responses: { 200: { description: "Shop's orders" } },
        },
      },
      '/api/shops/{shopNumber}/analytics': {
        get: {
          summary: 'Shop analytics summary (totals, revenue, stock levels)',
          tags: ['Shops'],
          parameters: [{ $ref: '#/components/parameters/shopNumberParam' }],
          responses: { 200: { description: 'totalProducts, totalOrders, totalSales, totalRevenue, lowStockProducts, outOfStockProducts' } },
        },
      },
      '/api/shops/{shopNumber}/selling-permission': {
        put: {
          summary: "Enable or disable a shop's ability to sell (admin only)",
          tags: ['Shops'],
          parameters: [{ $ref: '#/components/parameters/shopNumberParam' }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['can_sell'], properties: { can_sell: { type: 'boolean' } } } } },
          },
          responses: { 200: { description: 'Selling permission updated' } },
        },
      },
      '/api/shops/{shopNumber}/wallet/topup': {
        post: {
          summary: "Add balance to a shop's wallet (admin only)",
          tags: ['Shops'],
          parameters: [{ $ref: '#/components/parameters/shopNumberParam' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['amount'],
                  properties: {
                    amount: { type: 'number', minimum: 0.01 },
                    description: { type: 'string' },
                    payment_method: { type: 'string', enum: ['cash', 'mobile_money', 'bank_transfer', 'credit_card', 'debit_card', 'check'], default: 'cash' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Wallet topped up; returns the updated shop and the created Transaction' }, 400: { description: 'Shop has no assigned manager to credit' } },
        },
      },
      '/api/shops/{shopNumber}/wallet': {
        get: {
          summary: "Get a shop's wallet balance and top-up/adjustment transaction history",
          tags: ['Shops'],
          parameters: [
            { $ref: '#/components/parameters/shopNumberParam' },
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
          ],
          responses: { 200: { description: 'Paginated Transaction history; current balance is in meta.balance' } },
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
        post: {
          summary: 'Create a new inventory item (admin/shop_manager)',
          tags: ['Inventory'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'category', 'price', 'unit', 'supplier_id'],
                  properties: {
                    name: { type: 'string' },
                    category: { type: 'string' },
                    description: { type: 'string' },
                    price: { type: 'number' },
                    quantity: { type: 'integer', default: 0 },
                    unit: { type: 'string' },
                    supplier_id: { type: 'string' },
                    variety: { type: 'string' },
                    min_stock: { type: 'integer', default: 10 },
                    cost: { type: 'number' },
                    source_type: { type: 'string', default: 'manual' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Inventory item created' } },
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
        put: {
          summary: 'Add stock to a product and log a StockHistory entry (admin/shop_manager)',
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
                    quantity: { type: 'integer', minimum: 1, description: 'Quantity to add (delta, must be a positive integer)' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Product restocked; status set to available' }, 400: { description: 'Restock quantity must be a positive integer' }, 404: { description: 'Product not found' } },
        },
      },
      '/api/inventory/{id}/history': {
        get: {
          summary: 'Paginated stock history for a product (admin/shop_manager)',
          tags: ['Inventory'],
          parameters: [{ $ref: '#/components/parameters/idParam' }, { $ref: '#/components/parameters/pageParam' }, { $ref: '#/components/parameters/limitParam' }],
          responses: { 200: { description: 'Paginated StockHistory entries for the product' } },
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
        post: {
          summary: 'Create a notification for a user (admin)',
          tags: ['Notifications'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['recipient_id', 'title', 'message'],
                  properties: {
                    recipient_id: { type: 'string' },
                    title: { type: 'string' },
                    message: { type: 'string' },
                    type: { type: 'string', enum: ['info', 'success', 'warning', 'error', 'order', 'system'], default: 'info' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Notification created' } },
        },
      },
      '/api/notifications/unread-count': {
        get: {
          summary: "Get current user's unread notification count",
          tags: ['Notifications'],
          responses: { 200: { description: 'Unread notification count' } },
        },
      },
      '/api/notifications/read-all': {
        put: {
          summary: 'Mark all notifications as read',
          tags: ['Notifications'],
          responses: { 200: { description: 'All marked as read' } },
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
        get: {
          summary: 'Get a single notification (must belong to the current user)',
          tags: ['Notifications'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Notification details' }, 404: { description: 'Notification not found' } },
        },
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
          summary: 'List reports (admin/agent). Agents only see their own reports.',
          tags: ['Reports'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'report_type', schema: { type: 'string', enum: ['inspection', 'audit', 'assessment', 'survey', 'other'] } },
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] } },
            { in: 'query', name: 'agent_id', schema: { type: 'string' }, description: 'Filter by agent (admin only)' },
            { in: 'query', name: 'date_from', schema: { type: 'string', format: 'date-time' } },
            { in: 'query', name: 'date_to', schema: { type: 'string', format: 'date-time' } },
          ],
          responses: { 200: { description: 'Paginated reports' } },
        },
        post: {
          summary: 'Create report (agent/admin). Agents auto-assigned; admins must supply agent_id.',
          tags: ['Reports'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'description', 'report_type', 'scheduled_date', 'location'],
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    report_type: { type: 'string', enum: ['inspection', 'audit', 'assessment', 'survey', 'other'] },
                    agent_id: { type: 'string', description: 'Required when created by admin; auto-set for agents' },
                    farmer_id: { type: 'string' },
                    scheduled_date: { type: 'string', format: 'date-time' },
                    location: { type: 'string', description: 'Free-text location description' },
                    findings: { type: 'string' },
                    recommendations: { type: 'string' },
                    notes: { type: 'string' },
                    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Report created' } },
        },
      },
      '/api/reports/statistics': {
        get: {
          summary: 'Report statistics — counts by status, type, and priority (admin/agent)',
          description: 'Agents only see stats for their own reports. Admins see platform-wide stats.',
          tags: ['Reports'],
          responses: { 200: { description: 'Aggregated report counts grouped by status, type, and priority' } },
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
      '/api/agent-information/test': {
        get: { summary: 'Health-check route for this router (no auth)', tags: ['AgentInformation'], security: [], responses: { 200: { description: 'Routes are working' } } },
      },
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
        put: {
          summary: "Upsert the authenticated agent's own profile",
          tags: ['AgentInformation'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    territory: { type: 'array', items: { type: 'object' } },
                    province: { type: 'string' },
                    district: { type: 'string' },
                    sector: { type: 'string' },
                    cell: { type: 'string' },
                    village: { type: 'string' },
                    specialization: { type: 'string' },
                    experience: { type: 'string' },
                    certification: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Agent profile updated' } },
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
          summary: 'Upload a single file to MinIO object storage (max 5MB: jpg, png, webp, pdf)',
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
          responses: { 200: { description: 'Upload successful', content: { 'application/json': { example: { success: true, data: { url: 'http://localhost:9000/avocado-dashboard/img-123.jpg', filename: 'img-123.jpg', size: 204800 } } } } } },
        },
      },
      '/api/upload/multiple': {
        post: {
          summary: 'Upload multiple files to MinIO object storage (max 5 files)',
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
      '/api/monitoring/system': {
        get: {
          summary: 'System resource information — CPU, memory, uptime (admin)',
          tags: ['Monitoring'],
          responses: { 200: { description: 'OS and process resource usage' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // AUTH — new endpoints
      // ═══════════════════════════════════════════════════════════════════
      '/api/auth/forgot-password': {
        post: {
          summary: 'Request a password reset email',
          tags: ['Auth'],
          security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } },
          },
          responses: { 200: { description: 'Reset link sent if email exists (always 200 to prevent enumeration)' } },
        },
      },
      '/api/auth/reset-password': {
        post: {
          summary: 'Reset password with a valid token',
          tags: ['Auth'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['token', 'newPassword'], properties: { token: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } } },
              },
            },
          },
          responses: { 200: { description: 'Password reset successfully' }, 400: { description: 'Invalid or expired token' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // FARMS — new endpoints
      // ═══════════════════════════════════════════════════════════════════
      '/api/farms/{id}/history': {
        get: {
          summary: 'Farm change history (service requests, visits, forecasts)',
          tags: ['Farms'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Chronological history events' }, 404: { description: 'Farm not found' } },
        },
      },
      '/api/farms/{id}/archive': {
        put: {
          summary: 'Archive (soft-delete) a farm',
          tags: ['Farms'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Farm archived' }, 404: { description: 'Farm not found' } },
        },
      },
      '/api/farms/{id}/assign-agent': {
        put: {
          summary: 'Assign an agent to a farm',
          tags: ['Farms'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['agent_id'], properties: { agent_id: { type: 'string' } } } } },
          },
          responses: { 200: { description: 'Agent assigned' }, 404: { description: 'Farm or agent not found' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // FARMER INFORMATION — new endpoints
      // ═══════════════════════════════════════════════════════════════════
      '/api/farmer-information/{id}/verify': {
        put: {
          summary: 'Verify or reject a farmer profile (admin). The {id} is the FarmerProfile record ID.',
          tags: ['FarmerInformation'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['verification_status'],
                  properties: {
                    verification_status: { type: 'string', enum: ['verified', 'rejected'], description: 'New verification status' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Verification status updated' },
            400: { description: 'verification_status must be "verified" or "rejected"' },
            404: { description: 'Farmer profile not found' },
          },
        },
      },

      '/api/farmer-information/test': {
        get: { summary: 'Health-check route for this router (no auth)', tags: ['FarmerInformation'], security: [], responses: { 200: { description: 'Routes are working' } } },
      },
      '/api/farmer-information/me': {
        get: {
          summary: "Get the authenticated farmer's own extended profile",
          tags: ['FarmerInformation'],
          responses: { 200: { description: 'Farmer profile (or null if not yet created)' } },
        },
        put: {
          summary: "Upsert the authenticated farmer's own extended profile",
          tags: ['FarmerInformation'],
          requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/FarmerProfile' } } } },
          responses: { 200: { description: 'Profile updated' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // AGENT INFORMATION — new endpoints
      // ═══════════════════════════════════════════════════════════════════
      '/api/agent-information/{id}/performance': {
        put: {
          summary: "Update an agent's performance metrics (admin)",
          tags: ['AgentInformation'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    farmersAssisted: { type: 'integer' },
                    totalTransactions: { type: 'integer' },
                    performance: { type: 'string', example: '85%' },
                    statistics: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Performance metrics updated' }, 404: { description: 'Agent not found' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // INVENTORY — new endpoints
      // Thin wrapper over Product; POST/PUT create or edit shop-facing stock
      // items (as opposed to the supplier-catalog-oriented /api/products).
      // ═══════════════════════════════════════════════════════════════════
      '/api/inventory/out-of-stock': {
        get: {
          summary: 'List out-of-stock products (admin/shop_manager)',
          tags: ['Inventory'],
          responses: { 200: { description: 'Out-of-stock products' } },
        },
      },
      '/api/inventory/{id}': {
        get: {
          summary: 'Get an inventory item (Product) by ID (admin/shop_manager)',
          tags: ['Inventory'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Product' }, 404: { description: 'Not found' } },
        },
        put: {
          summary: 'Update an inventory item (admin/shop_manager)',
          tags: ['Inventory'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, category: { type: 'string' }, price: { type: 'number' }, quantity: { type: 'integer' }, unit: { type: 'string' }, supplier_id: { type: 'string' }, variety: { type: 'string' }, min_stock: { type: 'integer' }, cost: { type: 'number' }, source_type: { type: 'string' } } } } } },
          responses: { 200: { description: 'Inventory item updated' }, 404: { description: 'Not found' } },
        },
        delete: {
          summary: 'Soft-delete an inventory item (sets status to discontinued) (admin/shop_manager)',
          tags: ['Inventory'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Inventory item deleted' }, 404: { description: 'Not found' } },
        },
      },
      // ═══════════════════════════════════════════════════════════════════
      // SUPPLIERS — new endpoints
      // ═══════════════════════════════════════════════════════════════════
      '/api/suppliers/bulk': {
        put: {
          summary: 'Bulk-update multiple suppliers in one call (admin)',
          tags: ['Suppliers'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['suppliers'],
                  properties: {
                    suppliers: { type: 'array', items: { type: 'object', required: ['id'], properties: { id: { type: 'string' } }, description: 'Any other Supplier fields to update' } },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Updated suppliers (entries with an invalid id are skipped, not errored)' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // PROFILE ACCESS — new endpoints
      // ═══════════════════════════════════════════════════════════════════
      '/api/profile-access/regenerate/{userId}': {
        post: {
          summary: 'Regenerate QR code token for a user',
          tags: ['ProfileAccess'],
          parameters: [{ in: 'path', name: 'userId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'New token generated' }, 404: { description: 'User not found' } },
        },
      },
      '/api/profile-access/expire/{userId}': {
        delete: {
          summary: 'Immediately expire a user\'s QR code token',
          tags: ['ProfileAccess'],
          parameters: [{ in: 'path', name: 'userId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Token expired' }, 404: { description: 'User not found' } },
        },
      },
      '/api/profile-access/activity/{userId}': {
        get: {
          summary: 'QR scan activity log for a user',
          tags: ['ProfileAccess'],
          parameters: [{ in: 'path', name: 'userId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'List of QR scan events' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // SUPPLIERS — new endpoints
      // ═══════════════════════════════════════════════════════════════════
      '/api/suppliers/{id}/evaluations': {
        get: {
          summary: 'List evaluations for a supplier',
          tags: ['Suppliers'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Supplier evaluations' } },
        },
        post: {
          summary: 'Submit a supplier evaluation',
          tags: ['Suppliers'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['rating'], properties: { rating: { type: 'integer', minimum: 1, maximum: 5 }, comment: { type: 'string' } } },
              },
            },
          },
          responses: { 201: { description: 'Evaluation submitted and supplier rating recalculated' } },
        },
      },
      '/api/suppliers/{id}/history': {
        get: {
          summary: 'Supplier order and procurement history',
          tags: ['Suppliers'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Supplier history' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // REPORTS — new endpoints
      // ═══════════════════════════════════════════════════════════════════
      '/api/reports/{id}/attachments': {
        post: {
          summary: 'Upload file attachments to a report (agent/admin). Agents may only upload to reports they own.',
          tags: ['Reports'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            required: true,
            content: { 'multipart/form-data': { schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } } } } },
          },
          responses: { 200: { description: 'Attachment URLs appended to the report' }, 400: { description: 'No files uploaded' }, 403: { description: 'Access denied (agent does not own this report)' }, 404: { description: 'Report not found' } },
        },
      },
      '/api/reports/export': {
        get: {
          summary: 'Export reports as CSV (default) or JSON file download',
          description: 'Returns a file attachment. Use `format=json` for a JSON array, otherwise returns CSV. Capped at 1000 rows.',
          tags: ['Reports'],
          parameters: [
            { in: 'query', name: 'format', schema: { type: 'string', enum: ['csv', 'json'], default: 'csv' }, description: 'Output format' },
            { in: 'query', name: 'report_type', schema: { type: 'string', enum: ['inspection', 'audit', 'assessment', 'survey', 'other'] } },
            { in: 'query', name: 'status', schema: { type: 'string' } },
            { in: 'query', name: 'agent_id', schema: { type: 'string' } },
            { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' }, description: 'Filter created_at >= from' },
            { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' }, description: 'Filter created_at <= to' },
          ],
          responses: {
            200: {
              description: 'File download (text/csv or application/json)',
              content: {
                'text/csv': { schema: { type: 'string', format: 'binary' } },
                'application/json': { schema: { type: 'array', items: { type: 'object' } } },
              },
            },
          },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // ANALYTICS — new endpoints
      // ═══════════════════════════════════════════════════════════════════
      '/api/analytics/sales': {
        get: {
          summary: 'Sales analytics with daily revenue trend and top products (admin/shop_manager)',
          tags: ['Analytics'],
          parameters: [
            { in: 'query', name: 'start_date', schema: { type: 'string', format: 'date' }, description: 'Defaults to 30 days before end_date' },
            { in: 'query', name: 'end_date', schema: { type: 'string', format: 'date' }, description: 'Defaults to now' },
          ],
          responses: { 200: { description: 'Period totals, daily sales trend, and top 10 products by revenue' }, 400: { description: 'start_date must be before end_date' } },
        },
      },
      '/api/analytics/orders/monthly': {
        get: {
          summary: 'Monthly order count and revenue trends (admin/shop_manager)',
          tags: ['Analytics'],
          parameters: [
            { in: 'query', name: 'start_date', schema: { type: 'string', format: 'date' }, description: 'Defaults to 11 months before end_date' },
            { in: 'query', name: 'end_date', schema: { type: 'string', format: 'date' }, description: 'Defaults to now' },
          ],
          responses: { 200: { description: 'Monthly trend entries (orders, revenue, averageOrderValue) plus an overall summary' } },
        },
      },
      '/api/welcome/stats': {
        get: {
          summary: 'Detailed system statistics — user/product/order counts and process memory/uptime (public)',
          tags: ['Welcome'],
          security: [],
          responses: { 200: { description: 'User, product, order counts plus system memory/uptime info' } },
        },
      },
      '/api/logs/export': {
        get: {
          summary: 'Export logs as a CSV file (admin)',
          tags: ['Logs'],
          parameters: [
            { in: 'query', name: 'level', schema: { type: 'string', enum: ['error', 'warn', 'info', 'http', 'debug'] } },
            { in: 'query', name: 'start_date', schema: { type: 'string', format: 'date' } },
            { in: 'query', name: 'end_date', schema: { type: 'string', format: 'date' } },
          ],
          responses: { 200: { description: 'CSV file download', content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } } } },
        },
      },
      '/api/logs/cleanup': {
        delete: {
          summary: 'Delete logs older than a given number of days (admin)',
          tags: ['Logs'],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { older_than_days: { type: 'integer', default: 30 } } } } } },
          responses: { 200: { description: 'Old logs deleted' } },
        },
      },
      '/api/profile-access/update-profile': {
        put: {
          summary: 'Update a user profile using a one-time access key (public). Marks the access key as used.',
          tags: ['ProfileAccess'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['access_key', 'profile_data'],
                  properties: {
                    access_key: { type: 'string', example: 'ABCD-1234-EFGH' },
                    profile_data: { type: 'object', properties: { full_name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, profile: { type: 'object' } } },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Profile updated' }, 400: { description: 'Invalid access key format' }, 404: { description: 'Access key invalid, already used, or expired' } },
        },
      },
      '/api/profile-access/generate-qr/{userId}': {
        get: {
          summary: 'Generate a QR code containing a fresh 7-day access key for a user (agent/admin)',
          tags: ['ProfileAccess'],
          parameters: [{ in: 'path', name: 'userId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Access key, base64 QR image, and expiry' }, 404: { description: 'User not found' } },
        },
      },
      '/api/monitoring/usage': {
        get: {
          summary: 'Request/log volume broken down by log level over a time window (admin)',
          tags: ['Monitoring'],
          parameters: [{ in: 'query', name: 'period', schema: { type: 'string', enum: ['24h', '7d', '30d'], default: '24h' } }],
          responses: { 200: { description: 'Total request count and counts grouped by log level for the period' } },
        },
      },
      '/api/monitoring/database': {
        get: {
          summary: 'Database connectivity check and row counts for key tables (admin)',
          tags: ['Monitoring'],
          responses: { 200: { description: 'DB status, query time in ms, and row counts' } },
        },
      },
      '/api/analytics/regional': {
        get: {
          summary: 'Farm and harvest stats broken down by province/district',
          tags: ['Analytics'],
          responses: { 200: { description: 'Regional analytics' } },
        },
      },
      '/api/analytics/agents': {
        get: {
          summary: 'Per-agent performance metrics (visits, service requests, reports)',
          tags: ['Analytics'],
          responses: { 200: { description: 'Agent performance data' } },
        },
      },
      '/api/analytics/farmers': {
        get: {
          summary: 'Farmer engagement stats (farm size, tree count, verification rate)',
          tags: ['Analytics'],
          responses: { 200: { description: 'Farmer analytics' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // TREES
      // ═══════════════════════════════════════════════════════════════════
      '/api/trees/farm/{farmId}/summary': {
        get: {
          summary: 'Get a tree summary for a farm — latest tree record, untreated disease count, and all reported disease names',
          tags: ['Trees'],
          parameters: [{ in: 'path', name: 'farmId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Returns { latest_record, untreated_diseases_count, all_disease_names }' }, 404: { description: 'Farm not found' } },
        },
      },
      '/api/trees/farm/{farmId}': {
        get: {
          summary: 'List all tree records for a farm',
          tags: ['Trees'],
          parameters: [{ in: 'path', name: 'farmId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Tree records', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } } },
        },
        post: {
          summary: 'Add a tree record to a farm',
          tags: ['Trees'],
          parameters: [{ in: 'path', name: 'farmId', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['tree_number'],
                  properties: {
                    tree_number: { type: 'string' },
                    variety: { type: 'string' },
                    planted_at: { type: 'string', format: 'date' },
                    age_years: { type: 'number' },
                    height_m: { type: 'number' },
                    canopy_m: { type: 'number' },
                    health_status: { type: 'string', enum: ['healthy', 'stressed', 'diseased', 'dead'] },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Tree record created' } },
        },
      },
      '/api/trees/farm/{farmId}/diseases': {
        get: {
          summary: 'List tree-level disease records for a farm',
          tags: ['Trees'],
          parameters: [{ in: 'path', name: 'farmId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Tree disease records' } },
        },
        post: {
          summary: 'Report a tree-level disease',
          tags: ['Trees'],
          parameters: [{ in: 'path', name: 'farmId', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['tree_id', 'disease_name', 'severity'],
                  properties: {
                    tree_id: { type: 'string' },
                    disease_name: { type: 'string' },
                    severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                    detected_at: { type: 'string', format: 'date' },
                    treatment_notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Tree disease reported' } },
        },
      },
      '/api/trees/diseases/{id}': {
        put: {
          summary: 'Update a tree disease record (mark treated/resolved)',
          tags: ['Trees'],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TreeDisease' } } } },
          responses: { 200: { description: 'Tree disease updated' } },
        },
      },
      // ═══════════════════════════════════════════════════════════════════
      // DISEASES
      // ═══════════════════════════════════════════════════════════════════
      '/api/diseases/registry': {
        get: {
          summary: 'List disease registry entries',
          tags: ['Diseases'],
          responses: { 200: { description: 'Disease registry' } },
        },
        post: {
          summary: 'Add a disease to the registry (admin)',
          tags: ['Diseases'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    symptoms: { type: 'string' },
                    treatment: { type: 'string' },
                    prevention: { type: 'string' },
                    severity_default: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Disease created' } },
        },
      },
      '/api/diseases/registry/{id}': {
        put: {
          summary: 'Update a disease registry entry (admin)',
          tags: ['Diseases'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/DiseaseRegistry' } } } },
          responses: { 200: { description: 'Disease updated' } },
        },
        delete: {
          summary: 'Delete a disease registry entry (admin)',
          tags: ['Diseases'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Disease deleted' } },
        },
      },
      '/api/diseases/cases': {
        get: {
          summary: 'List all disease cases',
          tags: ['Diseases'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['open', 'in_treatment', 'resolved', 'closed'] } },
            { in: 'query', name: 'farm_id', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Paginated disease cases' } },
        },
        post: {
          summary: 'Report a disease case on a farm',
          tags: ['Diseases'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['farm_id', 'disease_id', 'severity'],
                  properties: {
                    farm_id: { type: 'string' },
                    disease_id: { type: 'string' },
                    severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                    affected_trees: { type: 'integer' },
                    detected_at: { type: 'string', format: 'date' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Disease case reported' } },
        },
      },
      '/api/diseases/cases/{id}': {
        get: {
          summary: 'Get a disease case by ID, including farm and outbreak details',
          tags: ['Diseases'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Disease case detail' }, 404: { description: 'Disease case not found' } },
        },
        put: {
          summary: 'Update a disease case status',
          tags: ['Diseases'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/DiseaseCase' } } } },
          responses: { 200: { description: 'Case updated' } },
        },
      },
      '/api/diseases/outbreaks/{id}': {
        get: {
          summary: 'Get a disease outbreak by ID, including all linked disease cases',
          tags: ['Diseases'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Disease outbreak detail with cases' }, 404: { description: 'Disease outbreak not found' } },
        },
        put: {
          summary: 'Update a disease outbreak (admin/agent). Auto-sets end_date when status is set to resolved.',
          tags: ['Diseases'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['active', 'contained', 'resolved', 'monitoring'] }, end_date: { type: 'string', format: 'date-time' }, response_plan: { type: 'string' }, affected_farms: { type: 'integer' }, description: { type: 'string' } } } } } },
          responses: { 200: { description: 'Disease outbreak updated' }, 404: { description: 'Disease outbreak not found' } },
        },
      },
      '/api/diseases/outbreaks': {
        get: {
          summary: 'List disease outbreaks',
          tags: ['Diseases'],
          responses: { 200: { description: 'Outbreaks list' } },
        },
        post: {
          summary: 'Declare a disease outbreak (admin)',
          tags: ['Diseases'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['disease_id', 'location', 'started_at'],
                  properties: { disease_id: { type: 'string' }, location: { type: 'string' }, started_at: { type: 'string', format: 'date' }, notes: { type: 'string' } },
                },
              },
            },
          },
          responses: { 201: { description: 'Outbreak declared' } },
        },
      },
      '/api/diseases/statistics': {
        get: {
          summary: 'Disease statistics — case counts by status and severity',
          tags: ['Diseases'],
          responses: { 200: { description: 'Disease statistics' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // FORECASTING
      // ═══════════════════════════════════════════════════════════════════
      '/api/forecasting': {
        get: {
          summary: 'List harvest forecasts',
          tags: ['Forecasting'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'farm_id', schema: { type: 'string' } },
            { in: 'query', name: 'province', schema: { type: 'string' } },
            { in: 'query', name: 'district', schema: { type: 'string' } },
            { in: 'query', name: 'forecast_year', schema: { type: 'integer' } },
          ],
          responses: { 200: { description: 'Harvest forecasts' } },
        },
        post: {
          summary: 'Create a harvest forecast',
          tags: ['Forecasting'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['forecast_year', 'predicted_kg'],
                  properties: {
                    farm_id: { type: 'string' },
                    province: { type: 'string' },
                    district: { type: 'string' },
                    forecast_year: { type: 'integer' },
                    forecast_season: { type: 'string' },
                    predicted_kg: { type: 'number' },
                    confidence_pct: { type: 'number', default: 70 },
                    basis: { type: 'string' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Forecast created' } },
        },
      },
      '/api/forecasting/compare': {
        get: {
          summary: 'List forecasts that have actual_kg recorded, with a computed accuracy_rating (admin/agent)',
          tags: ['Forecasting'],
          parameters: [
            { in: 'query', name: 'forecast_year', schema: { type: 'integer' } },
            { in: 'query', name: 'province', schema: { type: 'string' } },
          ],
          responses: { 200: { description: "Forecasts with accuracy_rating: 'on_track' | 'over' | 'under'" } },
        },
      },
      '/api/forecasting/{id}': {
        get: {
          summary: 'Get a single harvest forecast by ID',
          tags: ['Forecasting'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Forecast detail' }, 404: { description: 'Forecast not found' } },
        },
        put: {
          summary: 'Update a forecast (including actual kg when harvested)',
          tags: ['Forecasting'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/HarvestForecast' } } } },
          responses: { 200: { description: 'Forecast updated' }, 404: { description: 'Forecast not found' } },
        },
        delete: {
          summary: 'Delete a forecast',
          tags: ['Forecasting'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Forecast deleted' } },
        },
      },
      '/api/forecasting/regional': {
        get: {
          summary: 'Aggregated forecast vs actual by district/province',
          tags: ['Forecasting'],
          responses: { 200: { description: 'Regional forecast summary' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // PROCUREMENT
      // ═══════════════════════════════════════════════════════════════════
      '/api/procurement': {
        get: {
          summary: 'List purchase orders with supplier details, paginated (admin/shop_manager)',
          tags: ['Procurement'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['draft', 'submitted', 'approved', 'ordered', 'partially_received', 'fully_received', 'cancelled'] } },
            { in: 'query', name: 'supplier_id', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Paginated purchase orders' } },
        },
        post: {
          summary: 'Create a draft purchase order with line items (admin/shop_manager)',
          tags: ['Procurement'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['supplier_id', 'items'],
                  properties: {
                    supplier_id: { type: 'string' },
                    expected_date: { type: 'string', format: 'date-time' },
                    notes: { type: 'string' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['product_name', 'quantity_ordered', 'unit_price'],
                        properties: {
                          product_name: { type: 'string' },
                          product_id: { type: 'string', description: 'Optional link to an existing Product' },
                          quantity_ordered: { type: 'number' },
                          unit_price: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Purchase order created with a generated po_number and computed total_amount' }, 400: { description: 'supplier_id and a non-empty items array are required' }, 404: { description: 'Supplier not found' } },
        },
      },
      '/api/procurement/{id}': {
        get: {
          summary: 'Get a purchase order with items, supplier, and goods receipts (admin/shop_manager)',
          tags: ['Procurement'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Purchase order detail' }, 404: { description: 'Purchase order not found' } },
        },
        put: {
          summary: 'Update a purchase order — only allowed while status is draft (admin/shop_manager)',
          tags: ['Procurement'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { expected_date: { type: 'string', format: 'date-time' }, notes: { type: 'string' } } } } } },
          responses: { 200: { description: 'Purchase order updated' }, 400: { description: 'Purchase order cannot be modified after submission' }, 404: { description: 'Purchase order not found' } },
        },
      },
      '/api/procurement/{id}/submit': {
        put: {
          summary: 'Submit a draft purchase order for approval: draft → submitted (admin/shop_manager)',
          tags: ['Procurement'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Purchase order submitted' }, 400: { description: 'Purchase order must be in draft status to submit' }, 404: { description: 'Purchase order not found' } },
        },
      },
      '/api/procurement/{id}/approve': {
        put: {
          summary: 'Approve a submitted purchase order: submitted → approved (admin only)',
          tags: ['Procurement'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Purchase order approved' }, 400: { description: 'Purchase order must be in submitted status to approve' }, 404: { description: 'Purchase order not found' } },
        },
      },
      '/api/procurement/{id}/cancel': {
        put: {
          summary: 'Cancel a purchase order (admin only). Cannot cancel once fully received.',
          tags: ['Procurement'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Purchase order cancelled' }, 400: { description: 'Cannot cancel a fully received purchase order' }, 404: { description: 'Purchase order not found' } },
        },
      },
      '/api/procurement/{id}/receive': {
        post: {
          summary: 'Record a goods receipt against a purchase order and increment product stock (admin/shop_manager)',
          tags: ['Procurement'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['items'],
                  properties: {
                    notes: { type: 'string' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['product_name', 'quantity', 'unit_price'],
                        properties: {
                          product_name: { type: 'string' },
                          product_id: { type: 'string', description: 'When set, increments Product.quantity and matches against the PO item' },
                          quantity: { type: 'number' },
                          unit_price: { type: 'number' },
                          notes: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Goods receipt created; PO status becomes partially_received or fully_received' }, 400: { description: 'items array is required, or PO is not approved/ordered' }, 404: { description: 'Purchase order not found' } },
        },
      },
      '/api/procurement/{id}/receipts': {
        get: {
          summary: 'List goods receipts recorded against a purchase order (admin/shop_manager)',
          tags: ['Procurement'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Goods receipts for the purchase order' }, 404: { description: 'Purchase order not found' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // TRAINING
      // ═══════════════════════════════════════════════════════════════════
      '/api/training/all': {
        get: {
          summary: 'List all training content regardless of status (admin)',
          tags: ['Training'],
          responses: { 200: { description: 'Training content list, including drafts and archived items' } },
        },
      },
      '/api/training': {
        get: {
          summary: 'List training content (published only for farmers)',
          tags: ['Training'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'content_type', schema: { type: 'string', enum: ['article', 'video', 'pdf', 'quiz'] } },
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['draft', 'published', 'archived'] } },
          ],
          responses: { 200: { description: 'Training content list' } },
        },
        post: {
          summary: 'Create training content (admin)',
          tags: ['Training'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'content_type'],
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    content_type: { type: 'string', enum: ['article', 'video', 'pdf', 'quiz'] },
                    content_url: { type: 'string' },
                    thumbnail_url: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Content created as draft' } },
        },
      },
      '/api/training/{id}': {
        get: {
          summary: 'Get a training content item (records access for farmers)',
          tags: ['Training'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Training content detail' }, 404: { description: 'Not found' } },
        },
        put: {
          summary: 'Update training content (admin)',
          tags: ['Training'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TrainingContent' } } } },
          responses: { 200: { description: 'Content updated' } },
        },
        delete: {
          summary: 'Delete training content (admin)',
          tags: ['Training'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Content deleted' } },
        },
      },
      '/api/training/{id}/publish': {
        put: {
          summary: 'Publish a draft training item (admin)',
          tags: ['Training'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Content published' } },
        },
      },
      '/api/training/{id}/archive': {
        put: {
          summary: 'Archive a training item (admin)',
          tags: ['Training'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Content archived' } },
        },
      },
      // ═══════════════════════════════════════════════════════════════════
      // GEOGRAPHY
      // ═══════════════════════════════════════════════════════════════════
      '/api/geography/provinces': {
        get: {
          summary: 'List all provinces',
          tags: ['Geography'],
          security: [],
          responses: { 200: { description: 'Provinces with district count' } },
        },
        post: {
          summary: 'Add a province (admin)',
          tags: ['Geography'],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, code: { type: 'string' } } } } },
          },
          responses: { 201: { description: 'Province created' }, 409: { description: 'Name already exists' } },
        },
      },
      '/api/geography/provinces/{id}': {
        put: {
          summary: 'Update a province (admin)',
          tags: ['Geography'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Province' } } } },
          responses: { 200: { description: 'Province updated' } },
        },
        delete: {
          summary: 'Delete a province — only if it has no districts (admin)',
          tags: ['Geography'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Province deleted' }, 400: { description: 'Has existing districts' } },
        },
      },
      '/api/geography/provinces/{provinceId}/districts': {
        get: {
          summary: 'List districts in a province',
          tags: ['Geography'],
          security: [],
          parameters: [{ in: 'path', name: 'provinceId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Districts list' } },
        },
      },
      '/api/geography/districts': {
        post: {
          summary: 'Add a district to a province (admin)',
          tags: ['Geography'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['name', 'province_id'],
                  properties: { name: { type: 'string' }, province_id: { type: 'string' }, code: { type: 'string' } },
                },
              },
            },
          },
          responses: { 201: { description: 'District created' } },
        },
      },
      '/api/geography/districts/{id}': {
        put: {
          summary: 'Update a district (admin)',
          tags: ['Geography'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/District' } } } },
          responses: { 200: { description: 'District updated' } },
        },
      },
      '/api/geography/districts/{districtId}/sectors': {
        get: {
          summary: 'List sectors in a district',
          tags: ['Geography'],
          security: [],
          parameters: [{ in: 'path', name: 'districtId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Sectors list' } },
        },
      },
      '/api/geography/sectors': {
        post: {
          summary: 'Add a sector to a district (admin)',
          tags: ['Geography'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['name', 'district_id'], properties: { name: { type: 'string' }, district_id: { type: 'string' } } },
              },
            },
          },
          responses: { 201: { description: 'Sector created' } },
        },
      },
      '/api/geography/sectors/{sectorId}/cells': {
        get: {
          summary: 'List cells in a sector',
          tags: ['Geography'],
          security: [],
          parameters: [{ in: 'path', name: 'sectorId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Cells list' } },
        },
      },
      '/api/geography/cells': {
        post: {
          summary: 'Add a cell to a sector (admin)',
          tags: ['Geography'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['name', 'sector_id'], properties: { name: { type: 'string' }, sector_id: { type: 'string' } } },
              },
            },
          },
          responses: { 201: { description: 'Cell created' } },
        },
      },
      '/api/geography/cells/{cellId}/villages': {
        get: {
          summary: 'List villages in a cell',
          tags: ['Geography'],
          security: [],
          parameters: [{ in: 'path', name: 'cellId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Villages list' } },
        },
      },
      '/api/geography/villages': {
        post: {
          summary: 'Add a village to a cell (admin)',
          tags: ['Geography'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['name', 'cell_id'], properties: { name: { type: 'string' }, cell_id: { type: 'string' } } },
              },
            },
          },
          responses: { 201: { description: 'Village created' } },
        },
      },
      '/api/geography/full': {
        get: {
          summary: 'Full geography tree (Province → District → Sector → Cell → Village)',
          tags: ['Geography'],
          responses: { 200: { description: 'Complete hierarchy' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // SETTINGS
      // ═══════════════════════════════════════════════════════════════════
      '/api/settings': {
        get: {
          summary: 'List all system settings, optionally filtered by category (admin)',
          tags: ['Settings'],
          parameters: [{ in: 'query', name: 'category', schema: { type: 'string' } }],
          responses: { 200: { description: 'All settings key-value pairs' } },
        },
        post: {
          summary: 'Create a new system setting (admin)',
          tags: ['Settings'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['key', 'value'],
                  properties: {
                    key: { type: 'string' },
                    value: { type: 'string' },
                    description: { type: 'string' },
                    category: { type: 'string' },
                    data_type: { type: 'string', default: 'string' },
                    is_editable: { type: 'boolean', default: true },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Setting created' }, 409: { description: 'A setting with this key already exists' } },
        },
      },
      '/api/settings/{key}': {
        get: {
          summary: 'Get a single setting by key',
          tags: ['Settings'],
          parameters: [{ in: 'path', name: 'key', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Setting value' }, 404: { description: 'Key not found' } },
        },
        put: {
          summary: 'Set or update a setting value (admin)',
          tags: ['Settings'],
          parameters: [{ in: 'path', name: 'key', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['value'], properties: { value: { type: 'string' }, description: { type: 'string' } } },
              },
            },
          },
          responses: { 200: { description: 'Setting updated' } },
        },
        delete: {
          summary: 'Delete a setting (admin)',
          tags: ['Settings'],
          parameters: [{ in: 'path', name: 'key', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Setting deleted' } },
        },
      },
      '/api/settings/initialize': {
        get: {
          summary: 'Seed default system settings if none exist yet (admin). No-op if settings already exist.',
          tags: ['Settings'],
          responses: { 200: { description: 'Returns { created, message } — created is 0 if defaults already existed' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // CART
      // ═══════════════════════════════════════════════════════════════════
      '/api/cart': {
        get: {
          summary: 'Get the current user\'s cart',
          tags: ['Cart'],
          responses: { 200: { description: 'Cart with items and totals', content: { 'application/json': { schema: { $ref: '#/components/schemas/Cart' } } } } },
        },
        delete: {
          summary: 'Clear all items from the cart',
          tags: ['Cart'],
          responses: { 200: { description: 'Cart cleared' } },
        },
      },
      '/api/cart/items': {
        post: {
          summary: 'Add a product to the cart (or increment quantity)',
          tags: ['Cart'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['product_id', 'quantity'],
                  properties: { product_id: { type: 'string' }, quantity: { type: 'integer', minimum: 1 } },
                },
              },
            },
          },
          responses: { 201: { description: 'Item added to cart' } },
        },
      },
      '/api/cart/items/{productId}': {
        put: {
          summary: 'Update quantity of a cart item',
          tags: ['Cart'],
          parameters: [{ in: 'path', name: 'productId', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['quantity'], properties: { quantity: { type: 'integer', minimum: 0 } } } } },
          },
          responses: { 200: { description: 'Cart item updated (quantity 0 removes the item)' } },
        },
        delete: {
          summary: 'Remove a single item from the cart',
          tags: ['Cart'],
          parameters: [{ in: 'path', name: 'productId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Item removed' } },
        },
      },
      '/api/cart/checkout': {
        post: {
          summary: 'Checkout — converts cart to an Order',
          tags: ['Cart'],
          requestBody: {
            required: false,
            content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: 'string' } } } } },
          },
          responses: { 201: { description: 'Order created and cart cleared' }, 400: { description: 'Cart is empty or stock insufficient' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // VISITS
      // ═══════════════════════════════════════════════════════════════════
      '/api/visits/farm/{farmId}': {
        get: {
          summary: 'List all visits for a specific farm',
          tags: ['Visits'],
          parameters: [{ in: 'path', name: 'farmId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Visits for the farm' } },
        },
      },
      '/api/visits': {
        get: {
          summary: 'List farm visits (admin sees all; agents see their own)',
          tags: ['Visits'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['scheduled', 'completed', 'cancelled'] } },
            { in: 'query', name: 'farm_id', schema: { type: 'string' } },
            { in: 'query', name: 'agent_id', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Paginated visits' } },
        },
        post: {
          summary: 'Schedule a farm visit',
          tags: ['Visits'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['farm_id', 'scheduled_at'],
                  properties: {
                    farm_id: { type: 'string' },
                    scheduled_at: { type: 'string', format: 'date-time' },
                    purpose: { type: 'string' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Visit scheduled' } },
        },
      },
      '/api/visits/{id}': {
        get: {
          summary: 'Get a single farm visit',
          tags: ['Visits'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Visit detail' }, 404: { description: 'Not found' } },
        },
        put: {
          summary: 'Update visit details',
          tags: ['Visits'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/FarmVisit' } } } },
          responses: { 200: { description: 'Visit updated' } },
        },
      },
      '/api/visits/{id}/start': {
        put: {
          summary: 'Mark a scheduled visit as in-progress',
          tags: ['Visits'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Visit marked in-progress' }, 404: { description: 'Not found' } },
        },
      },
      '/api/visits/{id}/complete': {
        put: {
          summary: 'Mark a visit as completed with notes',
          tags: ['Visits'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            required: false,
            content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: 'string' } } } } },
          },
          responses: { 200: { description: 'Visit completed' } },
        },
      },
      '/api/visits/{id}/cancel': {
        put: {
          summary: 'Cancel a scheduled visit',
          tags: ['Visits'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            required: false,
            content: { 'application/json': { schema: { type: 'object', properties: { reason: { type: 'string' } } } } },
          },
          responses: { 200: { description: 'Visit cancelled' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // DOCUMENTS
      // ═══════════════════════════════════════════════════════════════════
      '/api/documents': {
        get: {
          summary: 'List documents owned by the current user (admin may pass owner_id to view another user\'s documents)',
          tags: ['Documents'],
          parameters: [
            { $ref: '#/components/parameters/pageParam' },
            { $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'type', schema: { type: 'string', enum: ['profile_card', 'contract', 'ipm_form', 'notarized_upload', 'other'] } },
            { in: 'query', name: 'owner_id', schema: { type: 'string' }, description: 'Admin only' },
          ],
          responses: { 200: { description: 'Paginated documents' } },
        },
      },
      '/api/documents/{id}': {
        get: {
          summary: "Get a document's metadata",
          tags: ['Documents'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Document' }, 403: { description: 'Access denied' }, 404: { description: 'Not found' } },
        },
      },
      '/api/documents/{id}/download': {
        get: {
          summary: "Download a document's file (streamed from private object storage)",
          tags: ['Documents'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'File stream', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } }, 403: { description: 'Access denied' } },
        },
      },
      '/api/documents/{id}/signature': {
        post: {
          summary: 'Attach a captured signature image to a document',
          tags: ['Documents'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            required: true,
            content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } },
          },
          responses: { 201: { description: 'Signature attached' }, 400: { description: 'Document already has a signature, or no file provided' } },
        },
      },
      '/api/documents/{id}/notarize': {
        post: {
          summary: 'Upload a physically notarized copy of a document for admin review (agent/admin)',
          tags: ['Documents'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            required: true,
            content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } },
          },
          responses: { 200: { description: 'Document moved to pending_notarization; version incremented' } },
        },
      },
      '/api/documents/{id}/notarize-review': {
        put: {
          summary: 'Approve or reject a document pending notarization review (admin only)',
          tags: ['Documents'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['approved'],
                  properties: { approved: { type: 'boolean' }, rejection_reason: { type: 'string', description: 'Required when approved is false' } },
                },
              },
            },
          },
          responses: { 200: { description: 'Document notarized or rejected' }, 400: { description: 'Document is not pending_notarization, or missing rejection_reason' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // PENDING FARMERS
      // ═══════════════════════════════════════════════════════════════════
      '/api/pending-farmers': {
        get: {
          summary: 'List farmers registered without a login account yet (admin, agent)',
          tags: ['PendingFarmers'],
          parameters: [{ in: 'query', name: 'status', schema: { type: 'string', enum: ['pending', 'approved', 'rejected'], default: 'pending' } }],
          responses: { 200: { description: 'Pending farmers' } },
        },
        post: {
          summary: "Register a farmer's basic info without creating a login account (admin, agent)",
          tags: ['PendingFarmers'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['full_name', 'email', 'phone'],
                  properties: { full_name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' } },
                },
              },
            },
          },
          responses: { 201: { description: 'Pending farmer created' }, 409: { description: 'A user or pending farmer with this email already exists' } },
        },
      },
      '/api/pending-farmers/{id}/approve': {
        put: {
          summary: 'Approve a pending farmer, creating their real login account with a temporary password (admin only)',
          tags: ['PendingFarmers'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Farmer approved; response includes temp_password (also emailed/texted to the farmer)' } },
        },
      },
      '/api/pending-farmers/{id}/reject': {
        put: {
          summary: 'Reject a pending farmer (admin only)',
          tags: ['PendingFarmers'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Pending farmer rejected' } },
        },
      },
      '/api/pending-farmers/{id}': {
        delete: {
          summary: 'Remove a pending farmer record (admin only)',
          tags: ['PendingFarmers'],
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          responses: { 200: { description: 'Pending farmer removed' } },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // SMS
      // ═══════════════════════════════════════════════════════════════════
      '/api/sms/send': {
        post: {
          summary: 'Send an ad-hoc SMS via Africa\'s Talking (admin only). Thin passthrough over the internal SMS service used by auth/pending-farmer flows — no template or history tracking.',
          tags: ['SMS'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['to', 'message'],
                  properties: {
                    to: {
                      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
                      description: 'Recipient phone number(s), e.g. +250788123456',
                    },
                    message: { type: 'string', minLength: 1, maxLength: 1600 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'SMS sent' },
            400: { description: 'Validation failed' },
            502: { description: 'SMS provider not configured or send failed' },
          },
        },
      },
    },
  },
  apis: [],
};
