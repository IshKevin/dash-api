# Complete API Documentation

**Version:** 2.0.0  
**Last Updated:** December 10, 2025

## Overview
This document provides comprehensive documentation for the Dashboard Avocado Backend API. It details all available endpoints, authentication requirements, request/response formats, and access permissions for frontend integration.

## Base URL
All API requests should be prefixed with:
```
http://<your-domain>/api
```

## Authentication
Most endpoints require authentication using a Bearer Token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

Tokens are obtained via the `/auth/login` endpoint and contain user information including role and permissions.

## Response Format
All API responses follow this standard structure:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "meta": {
    "timestamp": "2025-12-10T10:30:00.000Z",
    "version": "2.0.0"
  }
}
```

## Status Codes
- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `400 Bad Request` - Validation error or invalid input
- `401 Unauthorized` - Missing or invalid authentication token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server-side error

---

# 1. Authentication & User Management

## Authentication Endpoints
**Base Path:** `/auth`

| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **POST** | `/register` | Register a new user account | Public | `email`, `password`, `full_name`, `phone`, `role` (optional), `profile` (optional) |
| **POST** | `/login` | Authenticate user and retrieve token | Public | `email`, `password` |
| **POST** | `/logout` | Invalidate current session | Private | - |
| **GET** | `/profile` | Get current user's profile | Private | - |
| **PUT** | `/profile` | Update current user's profile | Private | `full_name`, `phone`, `profile` |
| **PUT** | `/password` | Change user password | Private | `currentPassword`, `newPassword` |
| **POST** | `/refresh` | Refresh JWT token | Private | - |
| **GET** | `/verify` | Verify token validity | Private | - |

### Login Response Example
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "full_name": "John Doe",
      "role": "farmer",
      "status": "active"
    }
  },
  "message": "Login successful"
}
```

## User Management Endpoints
**Base Path:** `/users`

| Method | Endpoint | Description | Access | Query Parameters |
|:-------|:---------|:------------|:-------|:-----------------|
| **GET** | `/` | List all users (paginated) | Admin | `page`, `limit`, `role`, `status`, `search` |
| **GET** | `/me` | Get current user's extended profile | Private | - |
| **PUT** | `/me` | Update current user's profile | Private | - |
| **GET** | `/farmers` | List all farmers | Admin/Agent | `page`, `limit`, `status`, `search` |
| **POST** | `/farmers` | Create new farmer account | Admin | Farmer profile data |
| **GET** | `/agents` | List all agents | Admin | `page`, `limit`, `status`, `search` |
| **POST** | `/agents` | Create new agent account | Admin | Agent profile data |
| **GET** | `/shop-managers` | List all shop managers | Admin | `page`, `limit`, `status`, `search` |
| **GET** | `/:id` | Get user by ID | Admin/Self | - |
| **PUT** | `/:id` | Update user | Admin/Self | User fields |
| **DELETE** | `/:id` | Delete user | Admin | - |
| **PUT** | `/:id/status` | Update user status | Admin | `status` |
| **PUT** | `/:id/role` | Update user role | Admin | `role` |
---


# 2. Profile Management

## Farmer Information
**Base Path:** `/farmer-information`

| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **GET** | `/` | Get farmer's profile and farm details | Farmer/Agent/Admin | Query: `farmerId` (for Agents/Admins) |
| **PUT** | `/` | Update farmer/farm details | Farmer/Agent/Admin | Profile fields, `farmerId` (optional) |
| **POST** | `/create` | Initialize farmer profile | Farmer | Profile fields |
| **PUT** | `/tree-count` | Quick update for tree count | Farmer | `tree_count` |

### Farmer Profile Structure
```json
{
  "farmer_id": "507f1f77bcf86cd799439011",
  "user_info": {
    "id": "507f1f77bcf86cd799439011",
    "email": "farmer@example.com",
    "full_name": "John Farmer",
    "phone": "+250788123456",
    "status": "active",
    "created_at": "2025-01-01T00:00:00.000Z",
    "updated_at": "2025-01-01T00:00:00.000Z"
  },
  "farmer_profile": {
    "age": 35,
    "gender": "male",
    "marital_status": "married",
    "education_level": "secondary",
    "province": "Eastern Province",
    "district": "Gatsibo",
    "sector": "Kiramuruzi",
    "farm_age": 5,
    "planted": "2020",
    "avocado_type": "hass",
    "farm_size": 2.5,
    "tree_count": 150,
    "farm_province": "Eastern Province",
    "farm_district": "Gatsibo",
    "farm_sector": "Kiramuruzi"
  }
}
```

## Agent Information
**Base Path:** `/agent-information`

| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **GET** | `/` | Get agent's profile and territory | Agent/Admin | - |
| **PUT** | `/` | Update agent profile and territory | Agent | Profile fields with `agent_profile` object |
| **POST** | `/create` | Initialize agent profile | Agent | Profile fields |
| **PUT** | `/performance` | Update performance metrics | Agent | `statistics` object |
| **POST** | `/admin/create` | Create agent profile (admin) | Admin | `userId`, `agent_profile` |
| **GET** | `/admin/:userId` | Get agent profile by user ID | Admin | - |

### Agent Profile Structure
```json
{
  "user_info": {
    "id": "507f1f77bcf86cd799439011",
    "full_name": "Jane Agent",
    "email": "agent@example.com",
    "phone": "+250788654321",
    "role": "agent",
    "status": "active"
  },
  "agent_profile": {
    "agentId": "AGT000001",
    "province": "Eastern Province",
    "territory": [
      {
        "district": "Gatsibo",
        "sector": "Kiramuruzi",
        "isPrimary": true,
        "assignedDate": "2025-01-01T00:00:00.000Z"
      }
    ],
    "territoryCoverage": {
      "totalDistricts": 1,
      "totalSectors": 1,
      "districts": ["Gatsibo"]
    },
    "specialization": "Avocado Farming Expert",
    "experience": "5 years",
    "statistics": {
      "farmersAssisted": 150,
      "totalTransactions": 350,
      "performance": "85%",
      "activeFarmers": 142,
      "territoryUtilization": "78%"
    }
  }
}
```

---

# 3. Product & Inventory Management

## Products
**Base Path:** `/products`

| Method | Endpoint | Description | Access | Query Parameters |
|:-------|:---------|:------------|:-------|:-----------------|
| **GET** | `/` | List products with filters | Public | `page`, `limit`, `category`, `supplier_id`, `status`, `price_min`, `price_max`, `in_stock`, `search` |
| **GET** | `/:id` | Get product details | Public | - |
| **POST** | `/` | Create new product | Admin/Shop/Agent | Product data |
| **PUT** | `/:id` | Update product | Admin/Shop/Agent | Product fields |
| **DELETE** | `/:id` | Discontinue product | Admin | - |
| **PUT** | `/:id/stock` | Update product stock | Admin/Shop/Agent | `quantity`, `reason`, `notes` |
| **GET** | `/:id/stock-history` | Get stock history | Admin/Shop | `page`, `limit` |

### Product Categories
- `irrigation` - Irrigation equipment
- `harvesting` - Harvesting tools
- `containers` - Storage containers
- `pest-management` - Pest control products

### Product Structure
```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "Drip Irrigation Kit",
  "description": "Complete drip irrigation system for avocado farms",
  "price": 150000,
  "category": "irrigation",
  "quantity": 25,
  "status": "available",
  "supplier_id": "1",
  "images": ["https://example.com/image1.jpg"],
  "specifications": {
    "coverage": "1 hectare",
    "material": "PVC"
  }
}
```

## Inventory Management
**Base Path:** `/inventory`

| Method | Endpoint | Description | Access | Query Parameters |
|:-------|:---------|:------------|:-------|:-----------------|
| **GET** | `/` | List all inventory items | Admin | `page`, `limit` |
| **GET** | `/low-stock` | Get low stock items | Admin/Shop | `threshold`, `shopId` |
| **GET** | `/out-of-stock` | Get out of stock items | Admin/Shop | `shopId` |
| **POST** | `/stock-adjustment` | Adjust stock levels | Admin/Shop | `productId`, `quantity`, `reason`, `notes` |
| **GET** | `/valuation` | Get inventory valuation | Admin/Shop | `shopId` |-
--

# 4. Order Management

## Orders
**Base Path:** `/orders`

| Method | Endpoint | Description | Access | Query Parameters |
|:-------|:---------|:------------|:-------|:-----------------|
| **GET** | `/` | List all orders | Admin/Shop | `page`, `status`, `customer_id`, `date_from`, `date_to` |
| **POST** | `/` | Create new order | Authenticated | Order data |
| **GET** | `/:id` | Get order details | Admin/Shop/Owner | - |
| **PUT** | `/:id` | Update order | Admin/Shop | Order fields |
| **DELETE** | `/:id` | Delete order | Admin | - |
| **PUT** | `/:id/status` | Update order status | Admin/Shop | `status` |
| **GET** | `/user/:userId` | Get user's orders | Admin/Shop/User | `page`, `limit`, `status` |

### Order Statuses
- `pending` - Order placed, awaiting confirmation
- `confirmed` - Order confirmed by shop
- `processing` - Order being prepared
- `shipped` - Order shipped to customer
- `delivered` - Order delivered successfully
- `cancelled` - Order cancelled
- `returned` - Order returned

### Order Structure
```json
{
  "id": "507f1f77bcf86cd799439011",
  "order_number": "ORD-2025-001",
  "customer_id": "507f1f77bcf86cd799439012",
  "items": [
    {
      "product_id": "507f1f77bcf86cd799439013",
      "product_name": "Drip Irrigation Kit",
      "quantity": 2,
      "unit_price": 150000,
      "total_price": 300000
    }
  ],
  "subtotal": 300000,
  "tax_amount": 30000,
  "shipping_cost": 10000,
  "total_amount": 340000,
  "status": "pending",
  "payment_method": "mobile_money",
  "shipping_address": {
    "province": "Eastern Province",
    "district": "Gatsibo",
    "sector": "Kiramuruzi"
  }
}
```

---

# 5. Service Requests

## Service Request Types
**Base Path:** `/service-requests`

### Pest Management
| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **POST** | `/pest-management` | Request pest control service | Farmer | Pest management details |
| **GET** | `/pest-management` | List pest requests | Private | `page`, `status`, `priority` |
| **PUT** | `/:id/approve-pest-management` | Approve pest request | Admin | `agent_id`, `scheduled_date`, `cost_estimate` |

### Property Evaluation
| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **POST** | `/property-evaluation` | Request property evaluation | Farmer | Evaluation details |
| **GET** | `/property-evaluation` | List evaluation requests | Private | `page`, `status`, `visit_date` |
| **PUT** | `/:id/approve-property-evaluation` | Approve evaluation | Admin | `agent_id`, `scheduled_date`, `cost_estimate` |

### Harvest Services
| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **POST** | `/harvest` | Request harvest service | Farmer/Agent | Harvest details |
| **GET** | `/harvest` | List harvest requests | Private | `page`, `status`, `date` |
| **GET** | `/harvest/agent/me` | Get agent's harvest requests | Agent | `page`, `status` |
| **PUT** | `/:id/approve-harvest` | Approve harvest request | Admin | `agent_id`, `scheduled_date`, `approved_workers` |
| **PUT** | `/:id/complete-harvest` | Mark harvest complete | Admin/Agent | `completion_notes`, `actual_harvest_amount` |

### Service Request Statuses
- `pending` - Request submitted, awaiting review
- `approved` - Request approved and assigned
- `in_progress` - Service being performed
- `completed` - Service completed successfully
- `cancelled` - Request cancelled
- `rejected` - Request rejected

---

# 6. Shop Management

## Shops
**Base Path:** `/shops`

| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **GET** | `/` | List all shops | Admin/Shop | - |
| **POST** | `/addshop` | Create new shop | Admin | Shop details |
| **GET** | `/:id` | Get shop details | Admin/Shop | - |
| **PUT** | `/:id` | Update shop | Admin/Shop | Shop fields |
| **DELETE** | `/:id` | Delete shop | Admin/Shop | - |
| **GET** | `/:id/inventory` | Get shop's products | Admin/Shop | `page` |
| **GET** | `/:id/orders` | Get shop's orders | Admin/Shop | `page` |
| **GET** | `/:id/analytics` | Get shop analytics | Admin/Shop | - |

### Shop Structure
```json
{
  "id": 1,
  "shopName": "Green Valley Avocado Shop",
  "description": "Premium avocado sales and distribution center",
  "province": "Eastern Province",
  "district": "Rwamagana",
  "ownerName": "John Doe",
  "ownerEmail": "john.doe@example.com",
  "ownerPhone": "+250788123456",
  "createdBy": "admin_user_id",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```---

#
 7. Analytics & Reporting

## Analytics
**Base Path:** `/analytics`

| Method | Endpoint | Description | Access | Query Parameters |
|:-------|:---------|:------------|:-------|:-----------------|
| **GET** | `/dashboard` | Main dashboard statistics | Admin/Shop | - |
| **GET** | `/sales` | Sales analytics over time | Admin/Shop | `start_date`, `end_date` |
| **GET** | `/products` | Product performance analytics | Admin/Shop | `start_date`, `end_date` |
| **GET** | `/users` | User analytics | Admin | `start_date`, `end_date` |
| **GET** | `/orders/monthly` | Monthly order trends | Admin/Shop | `start_date`, `end_date` |

### Dashboard Response Example
```json
{
  "users": {
    "total": 1250,
    "recent": 45,
    "byRole": {
      "farmer": 1000,
      "agent": 200,
      "admin": 25,
      "shop_manager": 25
    }
  },
  "orders": {
    "total": 850,
    "recent": 120,
    "revenue": {
      "total": 45000000,
      "last30Days": 12000000
    }
  },
  "products": {
    "total": 150,
    "inStock": 120,
    "outOfStock": 30
  },
  "serviceRequests": {
    "total": 300,
    "byStatus": {
      "pending": 45,
      "approved": 80,
      "completed": 175
    }
  }
}
```

---

# 8. File Management & Utilities

## Upload
**Base Path:** `/upload`

| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **POST** | `/` | Upload single file | Private | Multipart form with `file` |
| **POST** | `/multiple` | Upload multiple files (max 5) | Private | Multipart form with `files[]` |

### Supported File Types
- Images: JPG, PNG, GIF (max 5MB)
- Documents: PDF (max 10MB)

### Upload Response
```json
{
  "success": true,
  "data": {
    "url": "https://cloudinary.com/path/to/file.jpg",
    "filename": "file_123456.jpg",
    "mimetype": "image/jpeg",
    "size": 1024000
  }
}
```

## Notifications
**Base Path:** `/notifications`

| Method | Endpoint | Description | Access | Query Parameters |
|:-------|:---------|:------------|:-------|:-----------------|
| **GET** | `/` | Get user notifications | Private | `page`, `limit` |
| **GET** | `/unread-count` | Get unread notification count | Private | - |
| **GET** | `/:id` | Get notification by ID | Private | - |
| **PUT** | `/:id/read` | Mark notification as read | Private | - |
| **PUT** | `/read-all` | Mark all notifications as read | Private | - |
| **DELETE** | `/:id` | Delete notification | Private | - |
| **POST** | `/` | Create notification (admin) | Admin | Notification data |

## Profile Access (QR Code)
**Base Path:** `/profile-access`

| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **GET** | `/qr/:userId` | Generate QR code for user | Agent/Admin | - |
| **GET** | `/scan/:token` | Get user info by QR token | Public | - |
| **PUT** | `/scan/:token` | Update user via QR scan | Agent/Admin | User data |
| **POST** | `/import` | Import users from Excel | Admin | Multipart form with Excel file |

---

# 9. System Management

## Logs
**Base Path:** `/logs`

| Method | Endpoint | Description | Access | Query Parameters |
|:-------|:---------|:------------|:-------|:-----------------|
| **GET** | `/` | View system logs | Admin | `level`, `limit`, `page` |

## Monitoring
**Base Path:** `/monitoring`

| Method | Endpoint | Description | Access | Query Parameters |
|:-------|:---------|:------------|:-------|:-----------------|
| **GET** | `/usage` | Get system usage statistics | Admin | `period` (24h, 7d, 30d) |
| **GET** | `/activity` | Get recent system activity | Admin | `limit` |

---

# Role-Based Access Control

## User Roles
- **Admin**: Full system access
- **Agent**: Agricultural extension agent with territory management
- **Farmer**: Avocado farmer with profile and service requests
- **Shop Manager**: Shop inventory and order management

## Permission Matrix

| Endpoint Category | Admin | Agent | Farmer | Shop Manager |
|:------------------|:------|:------|:-------|:-------------|
| User Management | ✅ Full | ❌ | ❌ | ❌ |
| Farmer Profiles | ✅ Full | ✅ View/Edit | ✅ Own Only | ❌ |
| Agent Profiles | ✅ Full | ✅ Own Only | ❌ | ❌ |
| Products | ✅ Full | ✅ Create/Edit | ✅ View | ✅ Full |
| Orders | ✅ Full | ❌ | ✅ Own Only | ✅ Full |
| Service Requests | ✅ Full | ✅ Assigned | ✅ Own Only | ❌ |
| Shops | ✅ Full | ❌ | ❌ | ✅ Assigned |
| Analytics | ✅ Full | ❌ | ❌ | ✅ Own Shop |
| System Logs | ✅ Only | ❌ | ❌ | ❌ |---


# Frontend Integration Guidelines

## Authentication Flow
1. **Login**: POST `/auth/login` with credentials
2. **Store Token**: Save JWT token in secure storage
3. **Include Token**: Add `Authorization: Bearer <token>` to all requests
4. **Handle Expiry**: Refresh token using POST `/auth/refresh`
5. **Logout**: Clear token and call POST `/auth/logout`

## Error Handling
```javascript
// Example error handling
try {
  const response = await fetch('/api/products', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.message);
  }
  
  return data.data;
} catch (error) {
  console.error('API Error:', error.message);
  // Handle specific error codes
  if (error.status === 401) {
    // Redirect to login
  }
}
```

## Pagination Handling
```javascript
// Example pagination request
const getProducts = async (page = 1, limit = 20) => {
  const response = await fetch(`/api/products?page=${page}&limit=${limit}`);
  const data = await response.json();
  
  return {
    items: data.data,
    pagination: {
      total: data.meta.total,
      page: data.meta.page,
      pages: Math.ceil(data.meta.total / limit)
    }
  };
};
```

## File Upload Example
```javascript
// Example file upload
const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  
  return response.json();
};
```

## Service Request Examples

### Create Pest Management Request
```javascript
const createPestRequest = async (pestData) => {
  const response = await fetch('/api/service-requests/pest-management', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      service_type: 'pest_control',
      title: 'Pest Control Needed',
      description: 'Aphids attacking my avocado trees',
      location: {
        province: 'Eastern Province',
        district: 'Gatsibo'
      },
      pest_management_details: {
        pests_diseases: [
          {
            name: 'Aphids',
            first_spotted_date: '2025-01-01'
          }
        ],
        first_noticed: 'Last week',
        damage_observed: 'high',
        damage_details: 'Leaves turning yellow',
        control_methods_tried: 'Organic spray',
        severity_level: 'medium'
      },
      farmer_info: {
        name: 'John Farmer',
        phone: '+250788123456',
        location: 'Kiramuruzi Sector'
      },
      priority: 'medium'
    })
  });
  
  return response.json();
};
```

### Create Harvest Request
```javascript
const createHarvestRequest = async (harvestData) => {
  const response = await fetch('/api/service-requests/harvest', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      workersNeeded: 5,
      treesToHarvest: 100,
      harvestDateFrom: '2025-02-01',
      harvestDateTo: '2025-02-05',
      location: {
        province: 'Eastern Province',
        district: 'Gatsibo',
        sector: 'Kiramuruzi'
      },
      priority: 'high'
    })
  });
  
  return response.json();
};
```

## Profile Management Examples

### Update Farmer Profile
```javascript
const updateFarmerProfile = async (profileData) => {
  const response = await fetch('/api/farmer-information', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      full_name: 'Updated Name',
      phone: '+250788654321',
      farm_size: 3.0,
      tree_count: 200,
      farm_province: 'Eastern Province',
      farm_district: 'Gatsibo'
    })
  });
  
  return response.json();
};
```

### Update Agent Territory
```javascript
const updateAgentTerritory = async (territoryData) => {
  const response = await fetch('/api/agent-information', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      agent_profile: {
        province: 'Eastern Province',
        territory: [
          {
            district: 'Gatsibo',
            sector: 'Kiramuruzi',
            isPrimary: true,
            assignedDate: new Date().toISOString()
          },
          {
            district: 'Gatsibo',
            sector: 'Kabarore',
            isPrimary: false,
            assignedDate: new Date().toISOString()
          }
        ],
        specialization: 'Avocado Farming Expert'
      }
    })
  });
  
  return response.json();
};
```

---

# API Testing

## Health Check
```bash
curl -X GET http://localhost:5000/health
```

## Authentication Test
```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'

# Use token in subsequent requests
curl -X GET http://localhost:5000/api/auth/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Product Management Test
```bash
# Get products
curl -X GET "http://localhost:5000/api/products?page=1&limit=10&category=irrigation" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Create product (Admin/Shop/Agent)
curl -X POST http://localhost:5000/api/products \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Advanced Irrigation System",
    "description": "High-efficiency drip irrigation",
    "price": 200000,
    "category": "irrigation",
    "quantity": 10,
    "supplier_id": "1"
  }'
```

## Order Management Test
```bash
# Create order
curl -X POST http://localhost:5000/api/orders \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "product_id": "507f1f77bcf86cd799439011",
        "quantity": 2
      }
    ],
    "shipping_address": {
      "province": "Eastern Province",
      "district": "Gatsibo",
      "sector": "Kiramuruzi"
    },
    "payment_method": "mobile_money"
  }'
```

---

# Common Query Parameters
- `page`: Page number for pagination (default: 1)
- `limit`: Items per page (default: 10-20 depending on endpoint)
- `search`: Search term for filtering
- `status`: Filter by status
- `start_date` / `end_date`: Date range filtering
- `category`: Filter by category (products)
- `role`: Filter by user role
- `priority`: Filter by priority level

---

# Rate Limiting & Security

## Rate Limiting
- **Limit**: 100 requests per 15 minutes per IP
- **Headers**: Rate limit info in `RateLimit-*` headers
- **Exceeded**: Returns 429 status with retry information

## Security Features
- **Helmet**: Security headers
- **CORS**: Configurable cross-origin requests
- **Sanitization**: NoSQL injection protection
- **Validation**: Input validation on all endpoints
- **Authentication**: JWT-based with role permissions

## CORS Configuration
The API supports both public and restricted CORS modes:
- **Public Mode**: Allows requests from any origin
- **Restricted Mode**: Only allows requests from specified origins

---

# Error Response Examples

## Validation Error (400)
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "type": "field",
      "value": "",
      "msg": "Email is required",
      "path": "email",
      "location": "body"
    }
  ]
}
```

## Authentication Error (401)
```json
{
  "success": false,
  "message": "Access token is required",
  "meta": {
    "timestamp": "2025-12-10T10:30:00.000Z",
    "version": "2.0.0"
  }
}
```

## Authorization Error (403)
```json
{
  "success": false,
  "message": "Access denied. Insufficient permissions",
  "meta": {
    "timestamp": "2025-12-10T10:30:00.000Z",
    "version": "2.0.0"
  }
}
```

## Not Found Error (404)
```json
{
  "success": false,
  "message": "Resource not found",
  "meta": {
    "timestamp": "2025-12-10T10:30:00.000Z",
    "version": "2.0.0"
  }
}
```

---

This comprehensive API documentation covers all available endpoints in the Dashboard Avocado Backend API. The API is designed to support a complete avocado farming management system with role-based access control, comprehensive profile management, e-commerce functionality, and service request management.

For specific implementation details, additional features, or technical support, please refer to the individual route files in the codebase or contact the development team.