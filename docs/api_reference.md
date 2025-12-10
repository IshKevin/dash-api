# API Reference Documentation

**Version:** 1.0.0
**Last Updated:** 2025-12-09

## Overview
This document provides a comprehensive reference for the Dash API. It details all available endpoints, their required parameters, request bodies, and expected responses.

## Getting Started

### Base URL
All API requests should be prefixed with:
`http://<your-domain>/api`

### Authentication
Most endpoints require authentication using a Bearer Token.
- **Header:** `Authorization: Bearer <your_jwt_token>`
- Tokens are obtained via the `/auth/login` endpoint.

### Response Format
Standard API responses follow this structure:
```json
{
  "success": true, // or false
  "message": "Operation successful",
  "data": { ... } // or null
}
```

### Common Status Codes
- `200 OK` - Request successful.
- `201 Created` - Resource created successfully.
- `400 Bad Request` - Validation error or invalid input.
- `401 Unauthorized` - Missing or invalid authentication token.
- `403 Forbidden` - Insufficient permissions.
- `404 Not Found` - Resource not found.
- `500 Internal Server Error` - Server-side error.

---

## 1. Authentication
**Base Path:** `/auth`

| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **POST** | `/register` | Register a new user account. | Public | `email`, `password`, `full_name`, `phone`, `role` (optional), `profile` (optional) |
| **POST** | `/login` | Authenticate user and retrieve token. | Public | `email`, `password` |
| **POST** | `/logout` | Invalidate current session (client-side). | Private | - |
| **GET** | `/profile` | Get current logged-in user's profile. | Private | - |
| **PUT** | `/profile` | Update current user's profile. | Private | `full_name`, `phone`, `profile` (object) |
| **PUT** | `/password` | Change user password. | Private | `currentPassword`, `newPassword` |
| **POST** | `/refresh` | Refresh JWT authentication token. | Private | - |
| **GET** | `/verify` | Verify if current token is valid. | Private | - |

## 2. Users & Profiles
**Base Path:** `/users`

| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **GET** | `/` | List all users (paginated). | Admin | Query: `page`, `limit`, `role`, `status`, `search` |
| **GET** | `/:id` | Get specific user details by ID. | Admin/Self | - |
| **PUT** | `/:id` | Update specific user details. | Admin/Self | User fields (Admin can update `role`/`status`) |
| **DELETE** | `/:id` | Delete a user account. | Admin | - |
| **GET** | `/me` | Get extended profile for current user. | Private | - |
| **PUT** | `/me` | Update extended profile for current user. | Private | Profile fields specific to role (Farmer/Agent) |

### Specific Roles
| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **GET** | `/farmers` | List all farmers. | Admin/Agent | Query: `page`, `limit`, `status`, `search` |
| **POST** | `/farmers` | Create a new farmer account. | Admin | `full_name`, `email`, `phone`, `gender`, `marital_status`, `education_level`, location fields, farm details |
| **GET** | `/agents` | List all agents. | Admin | Query: `page`, `limit`, `status`, `search` |
| **POST** | `/agents` | Create a new agent account. | Admin | `full_name`, `email`, `phone`, `province`, `district`, `sector` |
| **GET** | `/shop-managers` | List all shop managers. | Admin | Query: `page`, `limit`, `status`, `search` |

## 3. Agent Information
**Base Path:** `/agent-information`

| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **GET** | `/` | Get agent's own info & profile stats. | Agent | - |
| **PUT** | `/` | Update agent's territory or profile. | Agent | `full_name` (opt), `agent_profile`: { `territory`[], `province`, `specialization`, etc. } |
| **POST** | `/create` | Initialize agent profile. | Agent | Profile fields |
| **PUT** | `/performance` | Update key performance metrics. | Agent | `statistics`: { `farmersAssisted`, `performance`, `activeFarmers` } |
| **GET** | `/admin/:userId` | Get full agent profile. | Admin | - |
| **POST** | `/admin/create` | Create agent profile with full details. | Admin | `userId`, `agent_profile` (full object) |

## 4. Farmer Information
**Base Path:** `/farmer-information`

| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **GET** | `/` | Get farmer's info & farm details. | Farmer/Agent | Query: `farmerId` (for Agents/Admins) |
| **PUT** | `/` | Update farmer/farm details. | Farmer/Agent | `farmerId` (opt), `full_name`, `phone`, `farm_size`, `planted`, `location` fields |
| **POST** | `/create` | Initialize farmer profile. | Farmer | Profile fields |
| **PUT** | `/tree-count` | Quick update for tree count. | Farmer | `tree_count` |

## 5. Products & Inventory
**Base Path:** `/products` & `/inventory`

### Products
| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **GET** | `/products` | List products (filterable). | Public | Query: `page`, `limit`, `category`, `supplier_id`, `status`, `price_min/max`, `in_stock`, `search` |
| **GET** | `/products/:id` | Get product details. | Public | - |
| **POST** | `/products` | Create a new product. | Shop/Admin | `name`, `description`, `price`, `category`, `images`, `stock`, `unit`, `specifications` |
| **PUT** | `/products/:id` | Update product details. | Shop/Admin | Product fields |
| **DELETE** | `/products/:id` | Discontinue a product. | Admin | - |

### Inventory Management
| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **GET** | `/inventory` | List all inventory items. | Admin | Query: `page`, `limit` |
| **GET** | `/inventory/low-stock` | Get items with low stock. | Admin/Shop | Query: `threshold`, `shopId` |
| **PUT** | `/products/:id/stock` | Adjust product stock level. | Admin/Shop | `quantity` (new total), `reason`, `notes` |
| **POST** | `/inventory/stock-adjustment` | Delta stock adjustment. | Admin/Shop | `productId`, `quantity` (delta), `reason` |
| **GET** | `/inventory/valuation` | Get total inventory value. | Admin/Shop | Query: `shopId` |

## 6. Orders
**Base Path:** `/orders`

| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **GET** | `/` | List all orders. | Admin/Shop | Query: `page`, `status`, `date`, `customer_id` |
| **POST** | `/` | Place a new order. | User | `items`: [{`product_id`, `quantity`, `specifications`}], `shipping_address`, `payment_method` |
| **GET** | `/:id` | Get order details. | User/Admin | - |
| **PUT** | `/:id` | Update order details. | Admin/Shop | Update fields |
| **PUT** | `/:id/status` | Update order status. | Admin/Shop | `status` (pending/confirmed/shipped/delivered/etc) |
| **GET** | `/user/:userId` | Get orders for a user. | User/Admin | Query: `page`, `limit`, `status` |

## 7. Service Requests (Pest, Eval, Harvest)
**Base Path:** `/service-requests`

| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **POST** | `/pest-management` | Request pest control. | Farmer | `service_type`="pest_control", `title`, `description`, `preferred_date`, `location`, `pest_management_details` |
| **GET** | `/pest-management` | List pest requests. | Private | Query: `page`, `status`, `priority` |
| **PUT** | `/:id/approve-pest-management` | Approve pest request. | Admin | `agent_id`, `scheduled_date`, `cost_estimate`, `notes` |
| **POST** | `/property-evaluation` | Request property evaluation. | Farmer | `irrigationSource`, `irrigationTiming`, `visitStartDate`, `location`, `priority` |
| **GET** | `/property-evaluation` | List evaluation requests. | Private | Query: `page`, `status`, `visit_date` |
| **PUT** | `/:id/approve-property-evaluation`| Approve evaluation. | Admin | `agent_id`, `scheduled_date`, `cost_estimate`, `notes` |
| **POST** | `/harvest` | Request harvest service. | Farmer/Agent | `workersNeeded`, `treesToHarvest`, `harvestDateFrom`, `harvestDateTo`, `location`, `priority` |
| **GET** | `/harvest` | List harvest requests. | Private | Query: `page`, `status`, `date` |
| **GET** | `/harvest/agent/me` | My harvest requests. | Agent | Query: `page` |
| **PUT** | `/:id/approve-harvest` | Approve harvest. | Admin | `agent_id`, `scheduled_date`, `cost_estimate`, `approved_workers` |
| **PUT** | `/:id/complete-harvest` | mark harvest complete. | Admin/Agent | `completion_notes`, `actual_harvest_amount` |

## 8. Shops
**Base Path:** `/shops`

| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **GET** | `/` | List all shops. | Public | - |
| **POST** | `/addshop` | Create a new shop. | Admin | `shopName`, `description`, `province`, `ownerName`, `ownerEmail`, `ownerPhone` |
| **GET** | `/:id` | Get shop details. | Public | - |
| **GET** | `/:id/inventory` | Get shop's products. | Public | Query: `page` |
| **GET** | `/:id/analytics` | Get shop's performance. | Admin/Shop | - |

## 9. Analytics & Monitoring
**Base Path:** `/analytics` & `/monitoring`

| Method | Endpoint | Description | Access | Request Body |
|:-------|:---------|:------------|:-------|:-------------|
| **GET** | `/analytics/dashboard` | Main dashboard stats. | Admin | - |
| **GET** | `/analytics/sales` | Sales over time. | Admin | Query: `start_date`, `end_date` |
| **GET** | `/analytics/products` | Top performing products. | Admin | Query: `start_date`, `end_date` |
| **GET** | `/monitoring/usage` | System usage stats. | Admin | Query: `period` |
| **GET** | `/monitoring/activity` | Recent activity log. | Admin | Query: `limit` |

## 10. Utils (Upload, Notifications, QR, Logs)

### Upload (`/upload`)
- **POST** `/` - Upload single file (multipart).
- **POST** `/multiple` - Upload multiple files (multipart).

### Notifications (`/notifications`)
- **GET** `/` - List user notifications.
- **GET** `/unread-count` - Get count of unread notifications.
- **PUT** `/:id/read` - Mark notification as read.
- **PUT** `/read-all` - Mark all notifications as read.

### Profile Access (`/profile-access`)
- **GET** `/qr/:userId` - Generate QR token for user.
- **POST** `/import` - Import users from Excel file (multipart).

### Logs (`/logs`)
- **GET** `/` - View system logs (Admin only).
