# Dashboard Avocado — API

Agricultural management platform for Rwanda's avocado supply chain. Connects four user roles — **Admin**, **Agent**, **Farmer**, **Shop Manager** — across farm management, service requests, product inventory, orders, and analytics.

---

## Quick Start

The backend runs as its **own Docker stack** — PostgreSQL, SeaweedFS (S3-compatible
object storage for images/documents) and the API. The frontend
(`Dashboard-avocado`) is a separate stack; the two talk over HTTP and share the
`avocado-net` Docker network.

```
 browser ──► dashboard-web :3000 (nginx, SPA)          ← Dashboard-avocado/docker-compose.yml
    │
    └──────► dash-api :5000 ──► dash-api-postgres :5432  ← dash-api/docker-compose.yml
                    └─────────► dash-api-seaweedfs :8333 (S3, private bucket)
```

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) with Compose v2
- Node.js 20+ and npm (only if you run the API outside Docker)

### Option A — everything in Docker (recommended for testing)

```bash
cd dash-api
cp .env.example .env            # then set JWT_SECRET and S3_SECRET_KEY to random values
docker compose up -d --build    # postgres + seaweedfs + api
docker compose ps               # all three should be "healthy"
```

On start the API container runs `prisma migrate deploy`, seeds demo data
(idempotent) and starts the server. SeaweedFS needs ~20 s on a cold start; the
API waits for it.

- API: **http://localhost:5000** · Swagger UI: **http://localhost:5000/api-docs**
- Then start the frontend stack: `cd ../Dashboard-avocado && docker compose up -d --build` → **http://localhost:3000**

### Option B — API on the host (hot reload), DB + storage in Docker

```bash
cp .env.example .env   # DATABASE_URL / S3_ENDPOINT already point at localhost
npm install
docker compose up -d --wait postgres seaweedfs
npx prisma migrate dev
npm run db:seed
npm run dev
```

### Running the tests

A separate, throwaway test stack (Postgres + SeaweedFS on tmpfs, ports 5433/8334,
project `avocado-backend-test`) never touches your dev data:

```bash
npm run test:docker
# = docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from tests
#   then tears it down with -v
```

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

The tables below are a quick reference; the full, current endpoint contracts live at `/api-docs` (Swagger), and the complete access-control model — roles, ownership-scoping rules, and deliberate exceptions — is documented in **[RBAC.md](./RBAC.md)**.

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

### Market Prices — `/api/market-prices`

Avocado price information per district/market, in the style of e-Soko (Rwanda's agricultural market price service), so farmers can see what buyers pay before selling. Prices in RWF/kg; `price_type` ∈ `farm_gate | wholesale | retail | export`; `grade` ∈ `export | grade_a | grade_b | processing | reject`.

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/` | Any auth | List observations (filters: `variety, grade, price_type, province, district, from, to`, paginated) |
| GET | `/latest` | Any auth | Most recent price per district × variety × grade × type (`days`, default 60) |
| GET | `/summary` | Any auth | National average per price type, last `days` (30) vs previous period, `% change` |
| GET | `/trends` | Any auth | Average/min/max per `interval=day|week` over `days` (90) — for charts |
| GET | `/:id` | Any auth | Single observation |
| POST | `/` | Admin, Agent | Record an observation |
| POST | `/bulk` | Admin | Import up to 200 observations (all-or-nothing) |
| PUT | `/:id` | Admin; Agent (own records) | Update |
| DELETE | `/:id` | Admin | Delete |

### Harvest Lots & Traceability — `/api/harvest-lots`, `/api/traceability`

Every harvest is recorded as a **lot** with a unique code (`AVO-YYYYMMDD-XXXXXX`), following the lot-level traceability that NAEB / GlobalGAP export buyers require. Workflow: `recorded → verified → sold → delivered` (or `rejected`). Verification records weighed kg, grade and **dry matter %** (maturity); export grade is refused below `DRY_MATTER_MIN_PCT`. Farmers are notified at each step.

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/harvest-lots` | Admin, Agent, Farmer (own) | List (filters: `status, grade, farm_id, farmer_id, variety, from, to, search`) |
| GET | `/api/harvest-lots/summary` | Admin, Agent, Farmer (own) | Totals by status/grade, kg, revenue, avg price |
| GET | `/api/harvest-lots/farm-options` | Admin, Agent, Farmer (own) | Farms selectable when recording a lot |
| GET | `/api/harvest-lots/:id` | Admin, Agent, Farmer (own) | Lot detail |
| GET | `/api/harvest-lots/:id/qr` | Admin, Agent, Farmer (own) | QR (PNG data URL) → `${FRONTEND_URL}/trace/<code>` |
| POST | `/api/harvest-lots` | Admin, Agent, Farmer (own farm) | Record a lot |
| PUT | `/api/harvest-lots/:id` | Farmer (while recorded); Agent/Admin (recorded/verified) | Edit |
| POST | `/api/harvest-lots/:id/verify` | Admin, Agent | Verify (kg, grade, dry matter) |
| POST | `/api/harvest-lots/:id/reject` | Admin, Agent | Reject (`reason` required) |
| POST | `/api/harvest-lots/:id/sell` | Admin, Agent, Farmer (own) | Record sale (`buyer_name`, `price_per_kg`) |
| POST | `/api/harvest-lots/:id/deliver` | Admin, Agent, Farmer (own) | Mark delivered |
| DELETE | `/api/harvest-lots/:id` | Farmer (own, recorded only), Admin | Delete |
| GET | `/api/traceability/:lotCode` | **Public** | Origin & quality for a scanned lot — no farmer name/phone, buyer or price |

### Farmer Surveys (Excel import) — `/api/surveys`

Baseline field-survey data (one row per farmer interview). Upload the spreadsheet,
review a validated preview, then commit. Every original column is kept in
`FarmSurvey.raw`; the commonly analysed answers are typed columns.

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/template` | Admin, Agent | Empty .xlsx with the expected columns |
| POST | `/import/preview` | Admin, Agent | Upload .xlsx/.xls/.csv (`file`, ≤5,000 rows) → validation report, farmer matching (national ID, then phone). Nothing is imported yet |
| GET | `/import/batches` | Admin, Agent | Previous imports |
| GET | `/import/batches/:id` | Admin, Agent | Preview rows (`filter=errors|warnings|all`) |
| POST | `/import/batches/:id/commit` | Admin | Import valid rows: link/create farmer accounts, profiles, farms (with GPS), survey records. Body `{ create_accounts=true, update_profiles=true }`. Runs once per batch |
| GET | `/` | Admin, Agent | List (filters: `province, district, sector, sex, batch_id, has_location, linked, search`) |
| GET | `/analytics` | Admin, Agent | Indicators: demographics, adoption rates, trees, production, top challenges/channels/credit sources |
| GET | `/export` | Admin, Agent | Filtered surveys as .xlsx |
| GET | `/:id` | Admin, Agent | Full record incl. raw columns |
| DELETE | `/:id` | Admin | Delete a survey record |

What the importer does with messy spreadsheets:
- It recognises both "Province/District" pairs: the first is the enumerator's area, the second is the farm's.
- It normalises phones to `+2507…`, reads y/n/yes/no/yego/oya, dd/mm/yyyy and Excel dates, and canonicalises province and district names, including Kinyarwanda province names.
- It fixes swapped lat/long, drops coordinates outside Rwanda, and treats farm areas over 100 as m² (converted to hectares).
- It warns when a 16-digit national ID was stored as a number, because Excel truncates those.

Rows without consent, without a name or without a district, and duplicate national IDs, are skipped.

Imported farmers get an account with a placeholder email (`credentials_claimed=false`). They activate it in the app ("Activate your account", which calls `POST /api/auth/verify-phone`) using the phone number from the survey.

### Land parcels & UPI — `/api/land`

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/status` | Any auth | Whether the national land-registry connector is configured |
| GET | `/upi?upi=5/01/02/03/1234` | Admin, Agent, Farmer | Validate + decode a UPI (province/district from its codes), check if another farm uses it, query the registry if connected |
| GET | `/farms/:farmId` | Admin, Agent, Farmer (own) | Land details of a farm |
| PUT | `/farms/:farmId` | Admin, Agent, Farmer (own) | Set `upi`, `latitude/longitude`, `parcel_boundary` (GeoJSON Polygon, must be in Rwanda; area computed), `land_use`, `land_tenure`. Clears verification |
| POST | `/farms/:farmId/verify` | Admin, Agent | Stamp as verified after a field visit; fills gaps from the registry when connected |

**Rwanda land registry (LAIS):** there is no public API. The connector in `src/services/landRegistry.ts` stays disabled until you obtain access from the National Land Authority (NLA/RLMUA) and set `LAND_REGISTRY_API_URL` and `LAND_REGISTRY_API_KEY`. The response format it expects is documented in that file; adjust `mapRegistryResponse()` to the real contract. Until then, UPIs are checked by format and by their province and district codes, and parcels are captured by drawing on the map.

### Farm map — `/api/map`

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/farms` | Admin, Agent, Farmer (own) | GeoJSON FeatureCollection of farms with GPS (+ parcel polygons with `boundaries=true`). Filters: `province, district, variety, status, has_upi, verified`. `meta` reports farms missing a location |

### Files — `/api/files`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/public/*` | — | Streams an uploaded public image from object storage |

---

## Docker

| File | Project | Services | Purpose |
|---|---|---|---|
| `docker-compose.yml` | `avocado-backend` | `postgres`, `seaweedfs`, `api` | Dev / staging / test environment |
| `docker-compose.test.yml` | `avocado-backend-test` | `postgres-test`, `seaweedfs-test`, `tests` | Isolated automated tests (tmpfs, nothing persisted) |

```bash
docker compose up -d --build        # start / rebuild
docker compose logs -f api          # follow API logs
docker compose down                 # stop (keeps volumes)
docker compose down -v              # stop and DELETE database + stored files
```

### Object storage (SeaweedFS)

- Image: `chrislusf/seaweedfs:3.97`, all-in-one `weed server -s3` (master + volume + filer + S3 gateway), started by `docker/seaweedfs/start.sh`, which writes the S3 credentials from `S3_ACCESS_KEY` / `S3_SECRET_KEY`.
- The bucket is **fully private** — there is no anonymous S3 identity. SeaweedFS doesn't support S3 bucket policies, so instead:
  - `public/…` objects (product/profile images) are streamed by the API at `GET /api/files/public/<key>` with long-lived cache headers and `Cross-Origin-Resource-Policy: cross-origin`, so the SPA on another origin can display them.
  - `private/…` objects (contracts, signatures) are only streamed by the authenticated documents endpoints after an ownership check.
- Any S3-compatible store works (MinIO, AWS S3, R2): set `S3_ENDPOINT` and credentials. The old `MINIO_*` variables are still accepted as fallbacks.
- ⚠️ SeaweedFS accepts writes into a bucket that doesn't exist and then can't read them back. `putObject()` therefore always ensures the bucket exists first (`ensureBucketReady()` in `src/config/storage.ts`). Keep that guard if you refactor uploads.

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

See `.env.example` for the full annotated list. The most important:

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string (set automatically under compose) |
| `JWT_SECRET` | Yes | — | Secret for signing JWTs — use a long random value |
| `PORT` | No | `5000` | HTTP port inside the container / process |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed browser origin (the frontend URL) |
| `S3_ENDPOINT` | No | `http://localhost:8333` | S3 API of SeaweedFS (compose uses `http://seaweedfs:8333`) |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | No | `seaweedadmin` / … | Storage credentials (also used by the SeaweedFS container) |
| `S3_BUCKET` | No | `avocado-dashboard` | Bucket name (created automatically) |
| `PUBLIC_API_URL` | No | `http://localhost:5000` | API base URL as browsers see it; public image URLs are built from it |
| `FRONTEND_URL` | No | `http://localhost:3000` | Used in emails and harvest-lot QR codes (`/trace/<code>`) |
| `DRY_MATTER_MIN_PCT` | No | `23` | Minimum dry matter % for an export-grade (Hass) lot to pass verification |
| `LAND_REGISTRY_API_URL` / `LAND_REGISTRY_API_KEY` | No | — | National land registry connector (disabled when unset) |
| `API_HOST_PORT` / `POSTGRES_HOST_PORT` / `S3_HOST_PORT` | No | `5000` / `5432` / `8333` | Host ports published by compose |

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
