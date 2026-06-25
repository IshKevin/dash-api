# Dashboard Avocado — API

Agricultural management platform for Rwanda's avocado supply chain. Connects four user roles — **Admin**, **Agent**, **Farmer**, **Shop Manager** — across farm management, service requests, product inventory, orders, and analytics.

---

## Quick Start

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) (for PostgreSQL)
- Node.js 18+
- npm

### 1. Clone and install

```bash
git clone <repo-url>
cd dash-api
npm install
```

### 2. Configure environment

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://dashuser:dashpassword@localhost:5432/dashboard_avocado?schema=public"
PORT=5000
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

### 3. Start PostgreSQL

```bash
docker compose up -d postgres
```

### 4. Run database migration

```bash
npx prisma migrate dev --name init
```

### 5. Seed sample data

```bash
npx ts-node src/scripts/seed.ts
```

### 6. Start the server

```bash
npm run dev         # ts-node-dev with hot reload
# or
npm start           # ts-node (no reload)
```

Server runs at **http://localhost:5000**

Interactive API docs (Swagger UI): **http://localhost:5000/api-docs**

---

## Default Credentials (after seed)

| Role          | Email                            | Password      |
|---------------|----------------------------------|---------------|
| Admin         | admin@dashboardavocado.com       | admin123456   |
| Agent         | agent@dashboardavocado.com       | agent123456   |
| Farmer        | farmer@dashboardavocado.com      | farmer123456  |
| Shop Manager  | shop@dashboardavocado.com        | shop123456    |

---

## Architecture

```
src/
├── config/
│   ├── database.ts       # Prisma connection health check
│   ├── environment.ts    # Zod-validated env vars
│   └── logger.ts         # Winston logger (file + console)
├── lib/
│   └── prisma.ts         # Prisma client singleton
├── middleware/
│   ├── auth.ts           # JWT authenticate + role authorize
│   ├── errorHandler.ts   # asyncHandler + global error handler
│   ├── requestLogger.ts  # Per-request Winston logging
│   └── validation.ts     # express-validator rules
├── routes/               # 23 route modules (see table below)
├── scripts/
│   ├── seed.ts           # Sample data seeding
│   └── cleanup.ts        # Cleanup expired tokens/logs
├── types/                # TypeScript interfaces
└── utils/
    ├── jwt.ts            # generateToken / verifyToken
    └── responses.ts      # sendSuccess / sendError / sendPaginated
```

### Database (PostgreSQL + Prisma)

All data lives in PostgreSQL (Docker: `postgres:16-alpine`). Prisma ORM provides type-safe queries and migrations.

Key design decisions:
- **CUID IDs** — URL-safe, collision-resistant strings (`@id @default(cuid())`)
- **JSON columns** — `location`, `profile`, `address`, `harvest_details` etc. stored as jsonb for schema flexibility
- **Normalized OrderItem** — separate table replaces embedded items arrays in Orders
- **AgentProfile / FarmerProfile** — separate tables linked to User via `user_id @unique`
- **ProductCategory enum** — `pest_management` stored as `"pest-management"` in DB (`@map("pest-management")`) to preserve the original API contract
- **StockHistory** — every inventory change is recorded with before/after quantities, reason, and created_by

---

## API Reference

Base URL: `http://localhost:5000/api`

All authenticated routes require: `Authorization: Bearer <jwt_token>`

### Authentication — `/api/auth`

| Method | Path               | Auth | Description                    |
|--------|--------------------|------|--------------------------------|
| POST   | `/register`        | —    | Register new user              |
| POST   | `/login`           | —    | Login, returns JWT             |
| GET    | `/me`              | ✓    | Current user profile           |
| PUT    | `/me`              | ✓    | Update own profile             |
| POST   | `/change-password` | ✓    | Change password                |

### Users — `/api/users`

| Method | Path       | Role  | Description             |
|--------|------------|-------|-------------------------|
| GET    | `/`        | Admin | List all users          |
| GET    | `/:id`     | Admin | Get user by ID          |
| PUT    | `/:id`     | Admin | Update user             |
| DELETE | `/:id`     | Admin | Delete user             |

### Products — `/api/products`

| Method | Path           | Role        | Description              |
|--------|----------------|-------------|--------------------------|
| GET    | `/`            | Any auth    | List products (filtered) |
| POST   | `/`            | Admin       | Create product           |
| GET    | `/:id`         | Any auth    | Get product              |
| PUT    | `/:id`         | Admin       | Update product           |
| DELETE | `/:id`         | Admin       | Delete product           |
| POST   | `/:id/stock`   | Admin/Agent | Update stock + history   |

**Category values:** `seeds`, `fertilizers`, `tools`, `irrigation`, `harvesting`, `containers`, `pest-management`, `protection`

### Orders — `/api/orders`

| Method | Path              | Role        | Description                     |
|--------|-------------------|-------------|---------------------------------|
| GET    | `/`               | Admin/Agent | List orders                     |
| POST   | `/`               | Any auth    | Create order (validates stock)  |
| GET    | `/:id`            | Any auth    | Get order with items            |
| PUT    | `/:id/status`     | Admin/Agent | Update order status             |
| DELETE | `/:id`            | Admin       | Cancel order                    |

Order creation auto-decrements product stock per item.

### Customers — `/api/customers`

| Method | Path                | Role        | Description               |
|--------|---------------------|-------------|---------------------------|
| GET    | `/`                 | Admin/Agent | List customers            |
| POST   | `/`                 | Admin/Agent | Create customer           |
| GET    | `/:id`              | Admin/Agent | Get customer              |
| PUT    | `/:id`              | Admin/Agent | Update customer           |
| DELETE | `/:id`              | Admin       | Delete customer           |
| GET    | `/:id/orders`       | Admin/Agent | Customer's orders         |
| GET    | `/:id/statistics`   | Admin/Agent | Spend stats, order counts |

### Suppliers — `/api/suppliers`

| Method | Path            | Role  | Description           |
|--------|-----------------|-------|-----------------------|
| GET    | `/`             | Admin | List suppliers        |
| POST   | `/`             | Admin | Create supplier       |
| GET    | `/:id`          | Admin | Get supplier          |
| PUT    | `/:id`          | Admin | Update supplier       |
| DELETE | `/:id`          | Admin | Delete supplier       |
| GET    | `/:id/products` | Admin | Supplier's products   |

### Farms — `/api/farms`

| Method | Path                    | Role                | Description             |
|--------|-------------------------|---------------------|-------------------------|
| GET    | `/`                     | Admin/Agent         | List farms              |
| GET    | `/overview`             | Admin/Agent         | Aggregate stats         |
| POST   | `/`                     | Admin/Agent         | Register farm           |
| GET    | `/:id`                  | Admin/Agent/Farmer  | Get farm                |
| GET    | `/:id/details`          | Admin/Agent/Farmer  | Extended farm info      |
| GET    | `/:id/production-stats` | Admin/Agent/Farmer  | Yield estimates         |
| PUT    | `/:id`                  | Admin/Agent/Farmer  | Update farm             |
| DELETE | `/:id`                  | Admin               | Delete farm             |

### Service Requests — `/api/service-requests`

Three types: `harvest`, `pest_control`, `other` (property evaluation).

| Method | Path                 | Role           | Description               |
|--------|----------------------|----------------|---------------------------|
| GET    | `/`                  | Any auth       | List (role-scoped)        |
| POST   | `/harvest`           | Farmer/Agent   | Create harvest request    |
| POST   | `/pest-control`      | Farmer         | Create pest control req   |
| POST   | `/other`             | Farmer/Agent   | Create other request      |
| GET    | `/:id`               | Any auth       | Get request               |
| PUT    | `/:id`               | Any auth       | Update request            |
| POST   | `/:id/approve`       | Admin/Agent    | Approve request           |
| POST   | `/:id/complete`      | Admin/Agent    | Mark completed            |
| DELETE | `/:id`               | Admin          | Delete request            |

### Shops — `/api/shops`

| Method | Path                       | Role            | Description            |
|--------|----------------------------|-----------------|------------------------|
| GET    | `/`                        | Any auth        | List shops             |
| POST   | `/`                        | Admin           | Create shop            |
| GET    | `/:shopNumber`             | Any auth        | Get by shop number (int)|
| PUT    | `/:shopNumber`             | Admin/Manager   | Update shop            |
| DELETE | `/:shopNumber`             | Admin           | Delete shop            |
| GET    | `/:shopNumber/inventory`   | Any auth        | Shop's products        |
| GET    | `/:shopNumber/orders`      | Admin/Manager   | Shop's orders          |

### Inventory — `/api/inventory`

| Method | Path            | Role  | Description              |
|--------|-----------------|-------|--------------------------|
| GET    | `/`             | Admin | Full inventory list      |
| GET    | `/low-stock`    | Admin | Items below threshold    |
| GET    | `/summary`      | Admin | Category totals          |
| POST   | `/:id/restock`  | Admin | Restock + log history    |

### Notifications — `/api/notifications`

| Method | Path            | Auth | Description              |
|--------|-----------------|------|--------------------------|
| GET    | `/`             | ✓    | User's notifications     |
| PUT    | `/:id/read`     | ✓    | Mark one as read         |
| PUT    | `/read-all`     | ✓    | Mark all as read         |
| DELETE | `/:id`          | ✓    | Delete notification      |
| DELETE | `/clear-all`    | ✓    | Clear all notifications  |

### Transactions — `/api/transactions`

| Method | Path            | Role  | Description              |
|--------|-----------------|-------|--------------------------|
| GET    | `/`             | Admin | All transactions         |
| POST   | `/`             | Any   | Create transaction       |
| GET    | `/:id`          | Any   | Get (own or admin)       |
| PUT    | `/:id/status`   | Admin | Update status            |
| GET    | `/summary`      | Admin | Financial summary        |

### Reports — `/api/reports`

| Method | Path    | Role        | Description              |
|--------|---------|-------------|--------------------------|
| GET    | `/`     | Admin/Agent | List reports             |
| POST   | `/`     | Agent/Admin | Create report            |
| GET    | `/:id`  | Admin/Agent | Get report               |
| PUT    | `/:id`  | Agent/Admin | Update report            |
| DELETE | `/:id`  | Admin       | Delete report            |

### Analytics — `/api/analytics`

| Method | Path                | Role  | Description              |
|--------|---------------------|-------|--------------------------|
| GET    | `/overview`         | Admin | Platform-wide KPIs       |
| GET    | `/users`            | Admin | User role breakdown      |
| GET    | `/service-requests` | Admin | Request type trends      |
| GET    | `/products`         | Admin | Top products, categories |
| GET    | `/farms`            | Admin | Farm status distribution |

### Profile Access (QR System) — `/api/profile-access`

Agents generate QR codes for farmers. Farmers (or agents scanning on-site) use the QR token or a one-time access key to view/edit profiles without a login.

| Method | Path                       | Auth        | Description                      |
|--------|----------------------------|-------------|----------------------------------|
| GET    | `/qr/:userId`              | Agent/Admin | Generate QR code for user        |
| GET    | `/scan/:token`             | —           | Get profile by QR token (public) |
| PUT    | `/scan/:token`             | Agent/Admin | Update profile via QR scan       |
| POST   | `/bulk-import`             | Admin       | Import users from Excel file     |
| POST   | `/verify-access-key`       | —           | Verify XXXX-XXXX-XXXX access key |
| POST   | `/update-profile-with-key` | —           | Update profile using access key  |

### Agent Information — `/api/agent-information`

| Method | Path    | Role        | Description                  |
|--------|---------|-------------|------------------------------|
| GET    | `/`     | Admin       | List all agents + profiles   |
| GET    | `/me`   | Agent       | Own profile                  |
| GET    | `/:id`  | Admin/Agent | Get agent profile            |
| POST   | `/`     | Admin/Agent | Create/upsert agent profile  |
| PUT    | `/:id`  | Admin/Agent | Update agent profile         |

### Farmer Information — `/api/farmer-information`

| Method | Path    | Role        | Description                  |
|--------|---------|-------------|------------------------------|
| GET    | `/`     | Admin/Agent | List all farmers + profiles  |
| GET    | `/:id`  | Admin/Agent | Get farmer profile           |
| POST   | `/`     | Agent/Admin | Create farmer profile        |
| PUT    | `/:id`  | Agent/Admin | Update farmer profile        |

### Monitoring — `/api/monitoring`

| Method | Path      | Role  | Description              |
|--------|-----------|-------|--------------------------|
| GET    | `/health` | Admin | DB + system health check |
| GET    | `/stats`  | Admin | Request and usage stats  |
| GET    | `/system` | Admin | CPU, memory, uptime      |

### Logs — `/api/logs`

| Method | Path          | Role  | Description              |
|--------|---------------|-------|--------------------------|
| GET    | `/`           | Admin | Paginated log entries    |
| GET    | `/statistics` | Admin | Log level breakdown      |

### Welcome — `/api/welcome`

| Method | Path | Auth | Description                  |
|--------|------|------|------------------------------|
| GET    | `/`  | —    | Public platform stats (counts)|

---

## Docker

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: dashuser
      POSTGRES_PASSWORD: dashpassword
      POSTGRES_DB: dashboard_avocado
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dashuser -d dashboard_avocado"]
      interval: 10s
      timeout: 5s
      retries: 5
```

```bash
# Start database
docker compose up -d postgres

# Stop
docker compose down

# Destroy all data and start fresh
docker compose down -v
docker compose up -d postgres
npx prisma migrate dev
```

---

## Prisma

```bash
# Apply schema changes (creates migration file + updates DB)
npx prisma migrate dev --name <description>

# Push schema without creating a migration file (dev only)
npx prisma db push

# Open Prisma Studio (browser GUI for your data)
npx prisma studio

# Regenerate TypeScript client after schema change
npx prisma generate

# Reset database to a clean state
npx prisma migrate reset
```

---

## Scripts

```bash
# Seed sample data (admin, agent, farmer, shop manager, supplier, products)
npx ts-node src/scripts/seed.ts

# Clean up expired access keys and logs older than 30 days
npx ts-node src/scripts/cleanup.ts
```

---

## Environment Variables

| Variable          | Required | Default       | Description                             |
|-------------------|----------|---------------|-----------------------------------------|
| `DATABASE_URL`    | Yes      | —             | PostgreSQL connection string            |
| `PORT`            | No       | `5000`        | HTTP server port                        |
| `NODE_ENV`        | No       | `development` | `development` \| `production` \| `test` |
| `JWT_SECRET`      | Yes      | —             | Secret for signing JWT tokens           |
| `JWT_EXPIRES_IN`  | No       | `7d`          | Token expiry (`1d`, `7d`, `30d`, etc.)  |
| `BCRYPT_ROUNDS`   | No       | `12`          | Password hashing cost factor            |
| `ALLOWED_ORIGINS` | No       | `*`           | Comma-separated CORS allowed origins    |
| `LOG_LEVEL`       | No       | `info`        | Winston log level                       |

---

## Response Envelope

All responses use a consistent JSON shape:

```json
// Success (single resource)
{
  "success": true,
  "message": "User retrieved successfully",
  "data": { "id": "...", "email": "..." }
}

// Success (paginated list)
{
  "success": true,
  "message": "Products retrieved successfully",
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 142,
    "totalPages": 8
  }
}

// Error
{
  "success": false,
  "message": "User not found"
}
```

**HTTP status codes used:** `200 OK`, `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `422 Unprocessable Entity`, `500 Internal Server Error`

---

## Tech Stack

| Layer        | Technology                          |
|-------------|-------------------------------------|
| Runtime     | Node.js 18 + TypeScript             |
| Framework   | Express 5                           |
| ORM         | Prisma 5                            |
| Database    | PostgreSQL 16 (Docker)              |
| Auth        | JWT (`jsonwebtoken`) + `bcryptjs`   |
| Validation  | `express-validator`                 |
| Logging     | Winston (console + file transports) |
| File upload | Multer + XLSX (bulk user import)    |
| Testing     | Mocha + Chai                        |
