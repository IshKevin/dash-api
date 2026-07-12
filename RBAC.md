# Role-Based Access Control (RBAC)

This is the authoritative reference for how access control works across the API. Swagger (`/api-docs`) documents each endpoint's shape; this document explains the *model* behind who can call what — the four roles, how ownership-scoping works, and the handful of deliberate exceptions to the general rules.

If this document and the code ever disagree, the code wins — but that should be treated as a bug in this document (or a regression), and reported.

## Roles

Every `User` has exactly one role: `admin`, `agent`, `farmer`, `shop_manager`. There is no sub-role or permission-flag system — access control is role + ownership only.

| Role | Who they are | Broad shape of their access |
|---|---|---|
| `admin` | Platform staff | Full access everywhere; the only role that bypasses ownership checks |
| `agent` | Field agronomists/advisors ("VBA") | Manage service requests, farms, trees/diseases, forecasts, training content; scoped to *assigned* records where an assignment concept exists (e.g. their own visits, their assigned service requests) — but broadly able to service *any* farmer (see "Agents serve any farmer" below) |
| `farmer` | Registered growers | Read/write only their own farm, service requests, documents, tree/disease records |
| `shop_manager` | Runs one input-supply shop | Read/write only their own shop's products, customers, orders, and wallet |

## Enforcement mechanism

Defined in `src/middleware/auth.ts`:

- **`authenticate`** — verifies the JWT, loads the user, rejects if the account isn't `active`. Attaches `req.user = {id, email, role, status}`.
- **`authorize(...roles)`** — must run after `authenticate`; 403s unless `req.user.role` is in the allowed list.
- **`adminOnly`** — equivalent to `authorize('admin')`. Both forms exist in the codebase; prefer `authorize('admin')` for new code (see "Legacy middleware" below).
- **Inline ownership checks** — for any resource with a natural owner (a farm's farmer, a shop's manager, a service request's assigned agent), the route handler does an explicit check *after* `authorize()`, e.g.:
  ```ts
  if (req.user?.role === 'farmer' && farm.farmer_id !== req.user.id) {
    sendError(res, 'Access denied', 403);
  }
  ```
  `admin` always skips these checks. This is deliberately inline per-route rather than a generic middleware, because what "ownership" means differs per resource (farmer on a Farm, manager on a Shop, agent on a ServiceRequest/Visit, shop_manager on a Customer/Product via `shop_id`/`supplier_id`).
- **`src/utils/shopScope.ts`**'s `getManagedShopId(req)` — shared helper resolving the `Shop.id` a `shop_manager` manages (via `Shop.manager_id`), used to scope `customers.ts` and `inventory.ts`/`products.ts` queries and writes to that manager's own shop.

### Legacy middleware — do not use

`authenticate`/`authorize`/`adminOnly` are the only auth primitives wired into any live route. Three additional exports in `auth.ts` are **unused by every route file** (only exercised by `test/simpleAuth.test.ts`) and should not be reached for in new code:

- `simpleAuth` — **does not verify the JWT signature at all**, it only checks that a Bearer header is present. A real gap if it were ever wired into a route.
- `simpleAdminOnly` — functionally fine, just redundant with `adminOnly`.
- `requireOwnership` — a generic `resourceId === userId` middleware; superseded everywhere by the inline ownership-check pattern above, which handles the more common case of an *indirect* owner field (`farmer_id`, `manager_id`, `agent_id`) rather than the resource's own `id`.

## Permission matrix by resource

`R`/`W` = read / write access. "Own" means scoped to the caller's own records (see ownership notes below the table).

| Resource | admin | agent | farmer | shop_manager |
|---|---|---|---|---|
| Users (`/api/users`) | R/W all | R own (`/me`), create/list farmers | R/W own (`/me`) | R/W own (`/me`) |
| Auth (`/api/auth`) | — | register/login/profile like any role | register/login/profile | register/login/profile |
| Farms (`/api/farms`) | R/W all | R/W all, assign agents | R/W own | — |
| Service Requests (`/api/service-requests`) | R/W all, approve/reject | R/W assigned (some types creatable on behalf of a farmer — see note) | create + R/W own | — |
| Documents (`/api/documents`) | R/W all | R/W (owner, or assigned via linked service request); notarize any (see note) | R/W own | — |
| Trees & Diseases (`/api/trees`, `/api/diseases`) | R/W all | R/W all | R own farm's only | — |
| Forecasting (`/api/forecasting`) | R/W all | R/W all | — | — |
| Visits (`/api/visits`) | R/W all | R/W own (assigned) | — | — |
| Reports (`/api/reports`) | R/W all | R/W own (`agent_id`) | — | — |
| Shops (`/api/shops`) | R/W all | — | — | R/W own shop |
| Shop wallet (`/api/shops/:id/wallet*`) | top-up + R history (any shop) | — | — | R own shop's history |
| Products / Inventory (`/api/products`, `/api/inventory`) | R/W all | R public catalog only | R public catalog only | R/W own shop's products |
| Customers (`/api/customers`) | R/W all | — | — | R/W own shop's customers |
| Orders (`/api/orders`) | R/W all | create own | create own | R/W all (staff) |
| Cart / Checkout (`/api/cart`) | own cart | own cart | own cart | own cart |
| Suppliers (`/api/suppliers`) | R/W all | — | — | R/W (not shop-scoped — shared supplier directory) |
| Transactions (`/api/transactions`) | R/W all | R own (payer/payee) | R own (payer/payee) | R own (payer/payee) |
| Notifications (`/api/notifications`) | R/W all, can create for anyone | R/W own | R/W own | R/W own |
| Profile Access / QR (`/api/profile-access`) | full | full (see "Agents serve any farmer") | scan/verify own token (public-by-token) | — |
| Pending Farmers (`/api/pending-farmers`) | full | list/create (not scoped to creator — see note) | — | — |
| Analytics / Reports (`/api/analytics`) | full | regional/farmers only | — | dashboard/sales/products/orders |
| Settings, Logs, Monitoring | admin only | — | — | — |
| Weather, Geography, Training, Welcome | mostly public/any-authenticated | same | same | same |

## Ownership-scoping notes

- **Farm → Farmer**: every farm-scoped endpoint (`farms.ts`, `weather.ts /farm-conditions`, `trees.ts`, `diseases.ts`) checks `farm.farmer_id === req.user.id` for the `farmer` role.
- **Shop → Shop Manager**: `Shop.manager_id` is unique per shop (one shop per manager). `customers.ts`, `inventory.ts`, and `products.ts` writes resolve the manager's shop via `getManagedShopId()` and scope by `Customer.shop_id` / `Product.supplier_id`.
- **Service Request → Agent**: `ServiceRequest.agent_id` gates agent access on assignment-dependent actions (`start`, `complete-*`, `cancel`). Unassigned requests (`agent_id: null`) are visible to any agent so they can be picked up.
- **Visit / Report → Agent**: same pattern via `FarmVisit.agent_id` / `Report.agent_id`.
- **Order / Cart checkout → Customer email match**: `Customer` has no `user_id` FK (customers aren't necessarily registered users). `cart.ts /checkout` and `orders.ts POST /` verify the supplied `customer_id`'s `email` matches the requester's own account email for non-staff roles, since there's no direct FK to check against.

## Deliberate exceptions (not bugs)

- **Agents serve any farmer.** `profile-access.ts` (QR/access-key generation) and `documents.ts POST /:id/notarize` intentionally let *any* active agent act on *any* farmer's records, not just farmers the agent is currently assigned to. Agents are field staff who may physically meet any farmer; scoping notarization or QR issuance to "your assigned farmers only" would break the common case of a registration document (profile card / contract) that has no service-request/agent assignment at all.
- **Asymmetric service-request creation.** `harvest`, `harvesting-plan`, and `ipm-routine` requests can be filed by an agent on a farmer's behalf (`farmer_id` in the body); `pest-management` and `property-evaluation` can currently only be filed by the farmer themselves. This wasn't changed during the RBAC audit because it looks like a product decision (these two types may be intended as farmer-initiated-only), not an oversight — flag to product/eng if that's wrong.
- **Pending-farmer list isn't creator-scoped.** Any agent can see pending farmers created by any other agent (`GET /api/pending-farmers` isn't filtered by `created_by`). Left as-is since it reads as a shared intake queue, not a per-agent one.

## Known Swagger accuracy notes

Fixed during this audit: `diseases.ts /registry` GET was documented as public (`security: []`) but requires auth; `forecasting.ts POST /` documented fields that didn't match the implementation (`forecast_date`/`forecast_kg` vs. the real `forecast_year`/`predicted_kg`/etc.); `pending-farmers.ts` had zero Swagger coverage. All fixed in `src/swagger.ts`.
