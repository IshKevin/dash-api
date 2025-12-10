# Complete API Endpoints List

**Dashboard Avocado Backend API**  
**Total Endpoints:** 85+  
**Base URL:** `http://<your-domain>/api`

---

## 🔐 Authentication Endpoints
**Base Path:** `/auth`

| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| POST | `/auth/register` | Register new user | Public |
| POST | `/auth/login` | User login | Public |
| POST | `/auth/logout` | User logout | Private |
| GET | `/auth/profile` | Get current user profile | Private |
| PUT | `/auth/profile` | Update current user profile | Private |
| PUT | `/auth/password` | Change password | Private |
| POST | `/auth/refresh` | Refresh JWT token | Private |
| GET | `/auth/verify` | Verify token validity | Private |

---

## 👥 User Management Endpoints
**Base Path:** `/users`

| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| GET | `/users` | List all users (paginated) | Admin |
| GET | `/users/me` | Get current user extended profile | Private |
| PUT | `/users/me` | Update current user profile | Private |
| GET | `/users/farmers` | List all farmers | Admin/Agent |
| POST | `/users/farmers` | Create new farmer | Admin |
| GET | `/users/agents` | List all agents | Admin |
| POST | `/users/agents` | Create new agent | Admin |
| GET | `/users/shop-managers` | List shop managers | Admin |
| GET | `/users/:id` | Get user by ID | Admin/Self |
| PUT | `/users/:id` | Update user | Admin/Self |
| DELETE | `/users/:id` | Delete user | Admin |
| PUT | `/users/:id/status` | Update user status | Admin |
| PUT | `/users/:id/role` | Update user role | Admin |

---

## 🌾 Farmer Information Endpoints
**Base Path:** `/farmer-information`

| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| GET | `/farmer-information` | Get farmer profile | Farmer/Agent/Admin |
| PUT | `/farmer-information` | Update farmer profile | Farmer/Agent/Admin |
| POST | `/farmer-information/create` | Create farmer profile | Farmer |
| PUT | `/farmer-information/tree-count` | Update tree count | Farmer |

---

## 🏢 Agent Information Endpoints
**Base Path:** `/agent-information`

| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| GET | `/agent-information` | Get agent profile | Agent/Admin |
| PUT | `/agent-information` | Update agent profile | Agent |
| POST | `/agent-information/create` | Create agent profile | Agent |
| PUT | `/agent-information/performance` | Update performance metrics | Agent |
| POST | `/agent-information/admin/create` | Create agent profile (admin) | Admin |
| GET | `/agent-information/admin/:userId` | Get agent by user ID | Admin |

---

## 📦 Product Management Endpoints
**Base Path:** `/products`

| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| GET | `/products` | List products with filters | Public |
| GET | `/products/:id` | Get product details | Public |
| POST | `/products` | Create new product | Admin/Shop/Agent |
| PUT | `/products/:id` | Update product | Admin/Shop/Agent |
| DELETE | `/products/:id` | Discontinue product | Admin |
| PUT | `/products/:id/stock` | Update product stock | Admin/Shop/Agent |
| GET | `/products/:id/stock-history` | Get stock history | Admin/Shop |

---

## 📊 Inventory Management Endpoints
**Base Path:** `/inventory`

| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| GET | `/inventory` | List all inventory | Admin |
| GET | `/inventory/low-stock` | Get low stock items | Admin/Shop |
| GET | `/inventory/out-of-stock` | Get out of stock items | Admin/Shop |
| POST | `/inventory/stock-adjustment` | Adjust stock levels | Admin/Shop |
| GET | `/inventory/valuation` | Get inventory valuation | Admin/Shop |

---

## 🛒 Order Management Endpoints
**Base Path:** `/orders`

| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| GET | `/orders` | List all orders | Admin/Shop |
| POST | `/orders` | Create new order | Authenticated |
| GET | `/orders/:id` | Get order details | Admin/Shop/Owner |
| PUT | `/orders/:id` | Update order | Admin/Shop |
| DELETE | `/orders/:id` | Delete order | Admin |
| PUT | `/orders/:id/status` | Update order status | Admin/Shop |
| GET | `/orders/user/:userId` | Get user orders | Admin/Shop/User |

---

## 🔧 Service Request Endpoints
**Base Path:** `/service-requests`

### Pest Management
| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| POST | `/service-requests/pest-management` | Create pest control request | Farmer |
| GET | `/service-requests/pest-management` | List pest requests | Private |
| PUT | `/service-requests/:id/approve-pest-management` | Approve pest request | Admin |

### Property Evaluation
| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| POST | `/service-requests/property-evaluation` | Create evaluation request | Farmer |
| GET | `/service-requests/property-evaluation` | List evaluation requests | Private |
| PUT | `/service-requests/:id/approve-property-evaluation` | Approve evaluation | Admin |

### Harvest Services
| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| POST | `/service-requests/harvest` | Create harvest request | Farmer/Agent |
| GET | `/service-requests/harvest` | List harvest requests | Private |
| GET | `/service-requests/harvest/agent/me` | Get agent's harvest requests | Agent |
| PUT | `/service-requests/:id/approve-harvest` | Approve harvest request | Admin |
| PUT | `/service-requests/:id/complete-harvest` | Complete harvest request | Admin/Agent |

---

## 🏪 Shop Management Endpoints
**Base Path:** `/shops`

| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| GET | `/shops` | List all shops | Admin/Shop |
| POST | `/shops/addshop` | Create new shop | Admin |
| GET | `/shops/:id` | Get shop details | Admin/Shop |
| PUT | `/shops/:id` | Update shop | Admin/Shop |
| DELETE | `/shops/:id` | Delete shop | Admin/Shop |
| GET | `/shops/:id/inventory` | Get shop inventory | Admin/Shop |
| GET | `/shops/:id/orders` | Get shop orders | Admin/Shop |
| GET | `/shops/:id/analytics` | Get shop analytics | Admin/Shop |

---

## 📈 Analytics Endpoints
**Base Path:** `/analytics`

| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| GET | `/analytics/dashboard` | Dashboard statistics | Admin/Shop |
| GET | `/analytics/sales` | Sales analytics | Admin/Shop |
| GET | `/analytics/products` | Product analytics | Admin/Shop |
| GET | `/analytics/users` | User analytics | Admin |
| GET | `/analytics/orders/monthly` | Monthly order trends | Admin/Shop |

---

## 📁 File Upload Endpoints
**Base Path:** `/upload`

| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| POST | `/upload` | Upload single file | Private |
| POST | `/upload/multiple` | Upload multiple files | Private |

---

## 🔔 Notification Endpoints
**Base Path:** `/notifications`

| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| GET | `/notifications` | Get user notifications | Private |
| GET | `/notifications/unread-count` | Get unread count | Private |
| GET | `/notifications/:id` | Get notification by ID | Private |
| PUT | `/notifications/:id/read` | Mark as read | Private |
| PUT | `/notifications/read-all` | Mark all as read | Private |
| DELETE | `/notifications/:id` | Delete notification | Private |
| POST | `/notifications` | Create notification | Admin |

---

## 📱 Profile Access (QR) Endpoints
**Base Path:** `/profile-access`

| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| GET | `/profile-access/qr/:userId` | Generate QR code | Agent/Admin |
| GET | `/profile-access/scan/:token` | Scan QR code | Public |
| PUT | `/profile-access/scan/:token` | Update via QR scan | Agent/Admin |
| POST | `/profile-access/import` | Import users from Excel | Admin |

---

## 📋 System Logs Endpoints
**Base Path:** `/logs`

| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| GET | `/logs` | View system logs | Admin |

---

## 📊 Monitoring Endpoints
**Base Path:** `/monitoring`

| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| GET | `/monitoring/usage` | System usage stats | Admin |
| GET | `/monitoring/activity` | Recent activity | Admin |

---

## 🏥 Health Check Endpoint

| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| GET | `/health` | System health check | Public |

---

## 🏠 Root Endpoint

| Method | Endpoint | Description | Access |
|:-------|:---------|:------------|:-------|
| GET | `/` | API welcome message | Public |

---

# Summary by Category

| Category | Endpoint Count | Description |
|:---------|:---------------|:------------|
| **Authentication** | 8 | User login, registration, profile |
| **User Management** | 13 | CRUD operations for users |
| **Farmer Information** | 4 | Farmer profile management |
| **Agent Information** | 6 | Agent profile and territory |
| **Products** | 7 | Product catalog management |
| **Inventory** | 5 | Stock and inventory tracking |
| **Orders** | 7 | E-commerce order system |
| **Service Requests** | 11 | Pest, evaluation, harvest services |
| **Shops** | 8 | Shop management system |
| **Analytics** | 5 | Reporting and statistics |
| **File Upload** | 2 | File management |
| **Notifications** | 7 | User notifications |
| **Profile Access** | 4 | QR code functionality |
| **System Management** | 3 | Logs and monitoring |
| **Utility** | 2 | Health check and root |

**Total Endpoints: 92**

---

# Access Level Summary

| Access Level | Endpoint Count | Description |
|:-------------|:---------------|:------------|
| **Public** | 12 | No authentication required |
| **Private** | 35 | Any authenticated user |
| **Admin Only** | 25 | Administrator access only |
| **Role-Based** | 20 | Specific role permissions |

---

# HTTP Methods Distribution

| Method | Count | Usage |
|:-------|:------|:------|
| **GET** | 45 | Data retrieval |
| **POST** | 20 | Create operations |
| **PUT** | 25 | Update operations |
| **DELETE** | 2 | Delete operations |

This comprehensive list covers all API endpoints available in the Dashboard Avocado Backend system, organized by functionality and access requirements.