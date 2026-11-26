import { Router, Response, Request } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { HarvestLotStatus, ProduceGrade, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/environment';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { validateIdParam } from '../middleware/validation';
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendPaginatedResponse,
} from '../utils/responses';
import { createNotification } from '../utils/notificationService';
import { AuthenticatedRequest } from '../types/auth';
import { canAccessFarmer, farmerScope } from '../utils/agentScope';

const router = Router();
export const traceabilityRouter = Router();

const GRADES = Object.values(ProduceGrade) as string[];
const STATUSES = Object.values(HarvestLotStatus) as string[];
const round = (n: number) => Math.round(n * 100) / 100;

const lotInclude = {
  farm: { select: { id: true, farmName: true, location: true, organic_certified: true } },
  farmer: { select: { id: true, full_name: true, phone: true } },
  verifier: { select: { id: true, full_name: true } },
} satisfies Prisma.HarvestLotInclude;

function generateLotCode(harvestDate: Date): string {
  const ymd = harvestDate.toISOString().slice(0, 10).replace(/-/g, '');
  return `AVO-${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function maturityFor(dryMatter: number | null | undefined): boolean | null {
  if (dryMatter === null || dryMatter === undefined) return null;
  return dryMatter >= env.DRY_MATTER_MIN_PCT;
}

function frontendBase(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

/** Scope a where-clause to what the caller may see (farmers: own lots only). */
async function scopeWhere(req: AuthenticatedRequest, where: Prisma.HarvestLotWhereInput): Promise<Prisma.HarvestLotWhereInput> {
  if (req.user!.role === 'farmer') return { ...where, farmer_id: req.user!.id };
  const scope = await farmerScope(req); // VBAs: only lots of farmers in their area
  return scope ? { AND: [where, { farmer: scope }] } : where;
}

async function loadLotForUser(req: AuthenticatedRequest, res: Response) {
  const lot = await prisma.harvestLot.findUnique({ where: { id: req.params.id }, include: lotInclude });
  if (!lot) {
    sendNotFound(res, 'Harvest lot not found');
    return null;
  }
  if (!(await canAccessFarmer(req, lot.farmer_id))) {
    sendError(res, 'Access denied', 403);
    return null;
  }
  return lot;
}

function parsePositive(value: unknown, field: string): [number | undefined, string | null] {
  if (value === undefined || value === null || value === '') return [undefined, null];
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return [undefined, `${field} must be a positive number`];
  return [n, null];
}

function parseDryMatter(value: unknown): [number | undefined, string | null] {
  if (value === undefined || value === null || value === '') return [undefined, null];
  const n = Number(value);
  if (!Number.isFinite(n) || n < 5 || n > 60) return [undefined, 'dry_matter_pct must be between 5 and 60'];
  return [n, null];
}

function notifyFarmer(farmerId: string, lotId: string, type: 'success' | 'warning' | 'info', title: string, message: string) {
  return createNotification(farmerId, type, title, message, lotId, 'system');
}

/**
 * @route GET /api/harvest-lots
 * @desc  List harvest lots. Farmers see only their own.
 *        Filters: status, farm_id, farmer_id, variety, grade, from, to, search (lot code)
 * @access Admin, Agent, Farmer
 */
router.get(
  '/',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = req.query as Record<string, string>;
    const where: Prisma.HarvestLotWhereInput = {};
    if (q.status) {
      if (!STATUSES.includes(q.status)) return sendError(res, `status must be one of: ${STATUSES.join(', ')}`, 400);
      where.status = q.status as HarvestLotStatus;
    }
    if (q.grade) {
      if (!GRADES.includes(q.grade)) return sendError(res, `grade must be one of: ${GRADES.join(', ')}`, 400);
      where.grade = q.grade as ProduceGrade;
    }
    if (q.farm_id) where.farm_id = q.farm_id;
    if (q.farmer_id) where.farmer_id = q.farmer_id;
    if (q.variety) where.variety = q.variety;
    if (q.search) where.lot_code = { contains: q.search.toUpperCase() };
    if (q.from || q.to) {
      where.harvest_date = {
        ...(q.from && { gte: new Date(q.from) }),
        ...(q.to && { lte: new Date(q.to) }),
      };
    }

    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
    const scoped = await scopeWhere(req, where);

    const [lots, total] = await Promise.all([
      prisma.harvestLot.findMany({
        where: scoped,
        include: lotInclude,
        orderBy: [{ harvest_date: 'desc' }, { created_at: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.harvestLot.count({ where: scoped }),
    ]);
    return sendPaginatedResponse(res, lots, total, page, limit, 'Harvest lots retrieved successfully');
  })
);

/** One month of the monthly breakdown — same figures as the overall totals. */
interface MonthRow { month: string; lots: number; total_kg: number; sold_kg: number; revenue: number; rejected_kg: number }

/**
 * Per-month lots / kg / sold kg / revenue / rejected kg for [from, to), keyed
 * YYYY-MM by harvest date (UTC). Months with no harvest are filled with zeros.
 */
async function monthlyBreakdown(from: Date, to: Date, farmerIds?: string[]) {
  const rows = await prisma.$queryRaw<
    { month: string; lots: number; total_kg: number | null; sold_kg: number | null; revenue: number | null; rejected_kg: number | null }[]
  >(Prisma.sql`
    SELECT to_char(date_trunc('month', "harvest_date"), 'YYYY-MM') AS month,
           COUNT(*)::int AS lots,
           SUM("quantity_kg") AS total_kg,
           SUM("quantity_kg") FILTER (WHERE "status" IN ('sold', 'delivered')) AS sold_kg,
           SUM("total_value") FILTER (WHERE "status" IN ('sold', 'delivered')) AS revenue,
           SUM("quantity_kg") FILTER (WHERE "status" = 'rejected') AS rejected_kg
      FROM "HarvestLot"
     WHERE "harvest_date" >= ${from} AND "harvest_date" < ${to}
       ${farmerIds ? Prisma.sql`AND "farmer_id" = ANY(${farmerIds})` : Prisma.empty}
     GROUP BY 1`);

  const byKey = new Map(rows.map((r) => [r.month, r]));
  const months: (MonthRow & { average_price_per_kg: number | null })[] = [];
  for (let d = new Date(from); d < to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const r = byKey.get(key);
    const soldKg = Number(r?.sold_kg ?? 0);
    const revenue = Number(r?.revenue ?? 0);
    months.push({
      month: key,
      lots: Number(r?.lots ?? 0),
      total_kg: round(Number(r?.total_kg ?? 0)),
      sold_kg: round(soldKg),
      revenue: round(revenue),
      rejected_kg: round(Number(r?.rejected_kg ?? 0)),
      average_price_per_kg: soldKg > 0 ? round(revenue / soldKg) : null,
    });
  }
  return months;
}

/**
 * @route GET /api/harvest-lots/summary
 * @desc  Totals by status/grade, total kg, sold kg, revenue and average price (scoped like the list),
 *        plus `by_month`: the same figures for each month.
 *        ?year=YYYY → totals for that year, by_month = its 12 months.
 *        ?year=YYYY&month=1..12 → totals for that month (by_month still the whole year).
 *        Neither → all-time totals, by_month = the last 12 months.
 * @access Admin, Agent, Farmer
 */
router.get(
  '/summary',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = req.query as Record<string, string>;
    const base: Prisma.HarvestLotWhereInput = {};
    if (q.farmer_id) base.farmer_id = q.farmer_id;

    const now = new Date();
    let year: number | null = null;
    let month: number | null = null;
    if (q.year !== undefined && q.year !== '') {
      year = parseInt(q.year, 10);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) return sendError(res, 'year must be between 2000 and 2100', 400);
    }
    if (q.month !== undefined && q.month !== '') {
      month = parseInt(q.month, 10);
      if (!Number.isInteger(month) || month < 1 || month > 12) return sendError(res, 'month must be between 1 and 12', 400);
      if (year === null) year = now.getUTCFullYear();
    }
    if (year !== null && month !== null) {
      base.harvest_date = { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) };
    } else if (year !== null) {
      base.harvest_date = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
    }
    const where = await scopeWhere(req, base);

    const [monthsFrom, monthsTo] = year !== null
      ? [new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1))]
      : [new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)), new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))];
    let monthlyFarmers: string[] | undefined;
    if (req.user!.role === 'farmer') monthlyFarmers = [req.user!.id];
    else {
      const scope = await farmerScope(req);
      if (scope) {
        const ids = (await prisma.user.findMany({ where: { AND: [{ role: 'farmer' }, scope] }, select: { id: true } })).map((u) => u.id);
        monthlyFarmers = q.farmer_id ? ids.filter((id) => id === q.farmer_id) : ids;
      } else if (q.farmer_id) monthlyFarmers = [q.farmer_id];
    }

    const [byStatus, byGrade, sold, byMonth] = await Promise.all([
      prisma.harvestLot.groupBy({ by: ['status'], where, _count: { _all: true }, _sum: { quantity_kg: true } }),
      prisma.harvestLot.groupBy({ by: ['grade'], where, _count: { _all: true }, _sum: { quantity_kg: true } }),
      prisma.harvestLot.aggregate({
        where: { ...where, status: { in: ['sold', 'delivered'] } },
        _sum: { quantity_kg: true, total_value: true },
      }),
      monthlyBreakdown(monthsFrom, monthsTo, monthlyFarmers),
    ]);

    const totalKg = byStatus.reduce((s, r) => s + (r._sum.quantity_kg ?? 0), 0);
    const totalLots = byStatus.reduce((s, r) => s + r._count._all, 0);
    const soldKg = sold._sum.quantity_kg ?? 0;
    const revenue = sold._sum.total_value ?? 0;

    return sendSuccess(
      res,
      {
        period: { year, month },
        total_lots: totalLots,
        total_kg: round(totalKg),
        sold_kg: round(soldKg),
        revenue: round(revenue),
        average_price_per_kg: soldKg > 0 ? round(revenue / soldKg) : null,
        by_status: STATUSES.map((s) => {
          const r = byStatus.find((b) => b.status === s);
          return { status: s, lots: r?._count._all ?? 0, quantity_kg: round(r?._sum.quantity_kg ?? 0) };
        }),
        by_grade: GRADES.map((g) => {
          const r = byGrade.find((b) => b.grade === g);
          return { grade: g, lots: r?._count._all ?? 0, quantity_kg: round(r?._sum.quantity_kg ?? 0) };
        }),
        by_month: byMonth,
      },
      'Harvest lot summary retrieved successfully'
    );
  })
);

/**
 * @route GET /api/harvest-lots/farm-options
 * @desc  Farms the caller may record a lot against (farmers: their own active
 *        farms; agents/admins: all active farms, optional ?search=). Minimal fields.
 * @access Admin, Agent, Farmer
 */
router.get(
  '/farm-options',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const where: Prisma.FarmWhereInput = { archived_at: null };
    if (req.user!.role === 'farmer') where.farmer_id = req.user!.id;
    else {
      const scope = await farmerScope(req);
      if (scope) where.farmer = scope;
    }
    if (search) {
      where.OR = [
        { farmName: { contains: search, mode: 'insensitive' } },
        { farmerName: { contains: search, mode: 'insensitive' } },
      ];
    }
    const farms = await prisma.farm.findMany({
      where,
      select: { id: true, farmName: true, farmerName: true, farmer_id: true, varieties: true },
      orderBy: { farmName: 'asc' },
      take: 200,
    });
    return sendSuccess(res, farms, 'Farm options retrieved successfully');
  })
);

/**
 * @route GET /api/harvest-lots/:id
 * @access Admin, Agent, Farmer (own)
 */
router.get(
  '/:id',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const lot = await loadLotForUser(req, res);
    if (!lot) return;
    return sendSuccess(res, lot, 'Harvest lot retrieved successfully');
  })
);

/**
 * @route GET /api/harvest-lots/:id/qr
 * @desc  QR code (PNG data URL) pointing to the public trace page for this lot
 * @access Admin, Agent, Farmer (own)
 */
router.get(
  '/:id/qr',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const lot = await loadLotForUser(req, res);
    if (!lot) return;
    const traceUrl = `${frontendBase()}/trace/${lot.lot_code}`;
    const qr_code = await QRCode.toDataURL(traceUrl, { margin: 1, width: 320 });
    return sendSuccess(res, { lot_code: lot.lot_code, trace_url: traceUrl, qr_code }, 'QR code generated');
  })
);

/**
 * @route POST /api/harvest-lots
 * @desc  Record a new harvest lot. Farmers may only record against their own farms;
 *        agents/admins record on behalf of the farm's farmer.
 * @access Admin, Agent, Farmer
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = req.body || {};
    if (!b.farm_id) return sendError(res, 'farm_id is required', 400);
    if (!b.harvest_date) return sendError(res, 'harvest_date is required', 400);
    const harvestDate = new Date(b.harvest_date);
    if (Number.isNaN(harvestDate.getTime())) return sendError(res, 'harvest_date must be a valid date', 400);
    if (harvestDate.getTime() > Date.now() + 24 * 3600 * 1000) return sendError(res, 'harvest_date cannot be in the future', 400);

    const [quantity, qErr] = parsePositive(b.quantity_kg, 'quantity_kg');
    if (qErr) return sendError(res, qErr, 400);
    if (quantity === undefined) return sendError(res, 'quantity_kg is required', 400);
    const [dryMatter, dErr] = parseDryMatter(b.dry_matter_pct);
    if (dErr) return sendError(res, dErr, 400);
    if (b.grade !== undefined && !GRADES.includes(b.grade)) return sendError(res, `grade must be one of: ${GRADES.join(', ')}`, 400);
    let crates: number | undefined;
    if (b.crates !== undefined && b.crates !== null && b.crates !== '') {
      crates = Number(b.crates);
      if (!Number.isInteger(crates) || crates < 0) return sendError(res, 'crates must be a non-negative integer', 400);
    }

    const farm = await prisma.farm.findUnique({ where: { id: String(b.farm_id) } });
    if (!farm || farm.archived_at) return sendNotFound(res, 'Farm not found');
    if (!(await canAccessFarmer(req, farm.farmer_id))) {
      return sendError(res, 'You can only record harvests for your own farms', 403);
    }

    const variety = b.variety ? String(b.variety).trim() : farm.varieties?.[0] || 'Hass';

    // Retry on the (very unlikely) lot code collision.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const lot = await prisma.harvestLot.create({
          data: {
            lot_code: generateLotCode(harvestDate),
            farm_id: farm.id,
            farmer_id: farm.farmer_id,
            variety,
            harvest_date: harvestDate,
            quantity_kg: quantity,
            crates,
            grade: (b.grade as ProduceGrade) ?? 'grade_a',
            dry_matter_pct: dryMatter,
            maturity_passed: maturityFor(dryMatter),
            notes: b.notes ? String(b.notes) : undefined,
            created_by: req.user!.id,
          },
          include: lotInclude,
        });
        if (req.user!.id !== farm.farmer_id) {
          await notifyFarmer(farm.farmer_id, lot.id, 'info', 'Harvest lot recorded',
            `Lot ${lot.lot_code} (${quantity} kg ${variety}) was recorded for ${farm.farmName}.`);
        }
        return sendCreated(res, lot, 'Harvest lot recorded successfully');
      } catch (e: any) {
        if (e?.code === 'P2002' && attempt < 2) continue;
        throw e;
      }
    }
    return sendError(res, 'Could not allocate a unique lot code, please retry', 500);
  })
);

/**
 * @route PUT /api/harvest-lots/:id
 * @desc  Edit lot details. Farmers: own lots while status=recorded. Agents/admins: while recorded or verified.
 * @access Admin, Agent, Farmer (own)
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const lot = await loadLotForUser(req, res);
    if (!lot) return;
    const editable: HarvestLotStatus[] = req.user!.role === 'farmer' ? ['recorded'] : ['recorded', 'verified'];
    if (!editable.includes(lot.status)) return sendError(res, `Lot cannot be edited while ${lot.status}`, 409);

    const b = req.body || {};
    const data: Prisma.HarvestLotUpdateInput = {};
    const [quantity, qErr] = parsePositive(b.quantity_kg, 'quantity_kg');
    if (qErr) return sendError(res, qErr, 400);
    if (quantity !== undefined) data.quantity_kg = quantity;
    const [dryMatter, dErr] = parseDryMatter(b.dry_matter_pct);
    if (dErr) return sendError(res, dErr, 400);
    if (dryMatter !== undefined) {
      data.dry_matter_pct = dryMatter;
      data.maturity_passed = maturityFor(dryMatter);
    }
    if (b.grade !== undefined) {
      if (!GRADES.includes(b.grade)) return sendError(res, `grade must be one of: ${GRADES.join(', ')}`, 400);
      data.grade = b.grade;
    }
    if (b.harvest_date !== undefined) {
      const d = new Date(b.harvest_date);
      if (Number.isNaN(d.getTime())) return sendError(res, 'harvest_date must be a valid date', 400);
      data.harvest_date = d;
    }
    if (b.crates !== undefined) {
      const c = Number(b.crates);
      if (!Number.isInteger(c) || c < 0) return sendError(res, 'crates must be a non-negative integer', 400);
      data.crates = c;
    }
    if (b.variety !== undefined) data.variety = String(b.variety).trim();
    if (b.notes !== undefined) data.notes = b.notes === null ? null : String(b.notes);

    const updated = await prisma.harvestLot.update({ where: { id: lot.id }, data, include: lotInclude });
    return sendSuccess(res, updated, 'Harvest lot updated successfully');
  })
);

/**
 * @route POST /api/harvest-lots/:id/verify
 * @desc  Agent/admin confirms weighed quantity, grade and dry matter. An export-grade
 *        lot must pass the dry-matter maturity threshold (DRY_MATTER_MIN_PCT).
 * @access Admin, Agent
 */
router.post(
  '/:id/verify',
  authenticate,
  authorize('admin', 'agent'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const lot = await loadLotForUser(req, res);
    if (!lot) return;
    if (lot.status !== 'recorded') return sendError(res, `Only recorded lots can be verified (current: ${lot.status})`, 409);

    const b = req.body || {};
    const [quantity, qErr] = parsePositive(b.quantity_kg, 'quantity_kg');
    if (qErr) return sendError(res, qErr, 400);
    const [dryMatterIn, dErr] = parseDryMatter(b.dry_matter_pct);
    if (dErr) return sendError(res, dErr, 400);
    if (b.grade !== undefined && !GRADES.includes(b.grade)) return sendError(res, `grade must be one of: ${GRADES.join(', ')}`, 400);

    const grade = (b.grade as ProduceGrade) ?? lot.grade;
    const dryMatter = dryMatterIn ?? lot.dry_matter_pct ?? undefined;
    const passed = maturityFor(dryMatter);
    if (grade === 'export') {
      if (dryMatter === undefined) return sendError(res, 'dry_matter_pct is required to verify an export-grade lot', 400);
      if (!passed) {
        return sendError(res, `Export grade requires dry matter >= ${env.DRY_MATTER_MIN_PCT}% (measured ${dryMatter}%)`, 400);
      }
    }

    const updated = await prisma.harvestLot.update({
      where: { id: lot.id },
      data: {
        status: 'verified',
        grade,
        ...(quantity !== undefined && { quantity_kg: quantity }),
        ...(dryMatter !== undefined && { dry_matter_pct: dryMatter, maturity_passed: passed }),
        verified_by: req.user!.id,
        verified_at: new Date(),
        ...(b.notes && { notes: String(b.notes) }),
      },
      include: lotInclude,
    });
    await notifyFarmer(lot.farmer_id, lot.id, 'success', 'Harvest lot verified',
      `Lot ${lot.lot_code} was verified: ${updated.quantity_kg} kg, grade ${grade.replace('_', ' ')}.`);
    return sendSuccess(res, updated, 'Harvest lot verified successfully');
  })
);

/**
 * @route POST /api/harvest-lots/:id/reject
 * @desc  Reject a lot (e.g. immature fruit, pest damage). `reason` required.
 * @access Admin, Agent
 */
router.post(
  '/:id/reject',
  authenticate,
  authorize('admin', 'agent'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const lot = await loadLotForUser(req, res);
    if (!lot) return;
    if (!['recorded', 'verified'].includes(lot.status)) return sendError(res, `Lot cannot be rejected while ${lot.status}`, 409);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) return sendError(res, 'reason is required', 400);

    const updated = await prisma.harvestLot.update({
      where: { id: lot.id },
      data: { status: 'rejected', rejection_reason: reason, verified_by: req.user!.id, verified_at: new Date() },
      include: lotInclude,
    });
    await notifyFarmer(lot.farmer_id, lot.id, 'warning', 'Harvest lot rejected', `Lot ${lot.lot_code} was rejected: ${reason}`);
    return sendSuccess(res, updated, 'Harvest lot rejected');
  })
);

/**
 * @route POST /api/harvest-lots/:id/sell
 * @desc  Record the sale of a verified lot: buyer_name and price_per_kg required.
 * @access Admin, Agent, Farmer (own)
 */
router.post(
  '/:id/sell',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const lot = await loadLotForUser(req, res);
    if (!lot) return;
    if (lot.status !== 'verified') return sendError(res, `Only verified lots can be sold (current: ${lot.status})`, 409);

    const b = req.body || {};
    const buyerName = typeof b.buyer_name === 'string' ? b.buyer_name.trim() : '';
    if (!buyerName) return sendError(res, 'buyer_name is required', 400);
    const [price, pErr] = parsePositive(b.price_per_kg, 'price_per_kg');
    if (pErr) return sendError(res, pErr, 400);
    if (price === undefined) return sendError(res, 'price_per_kg is required', 400);

    const updated = await prisma.harvestLot.update({
      where: { id: lot.id },
      data: {
        status: 'sold',
        buyer_name: buyerName,
        buyer_contact: b.buyer_contact ? String(b.buyer_contact) : null,
        price_per_kg: price,
        total_value: round(price * lot.quantity_kg),
        sold_at: new Date(),
      },
      include: lotInclude,
    });
    if (req.user!.id !== lot.farmer_id) {
      await notifyFarmer(lot.farmer_id, lot.id, 'success', 'Harvest lot sold',
        `Lot ${lot.lot_code} sold to ${buyerName} at ${price} RWF/kg (total ${updated.total_value} RWF).`);
    }
    return sendSuccess(res, updated, 'Sale recorded successfully');
  })
);

/**
 * @route POST /api/harvest-lots/:id/deliver
 * @desc  Mark a sold lot as delivered to the buyer.
 * @access Admin, Agent, Farmer (own)
 */
router.post(
  '/:id/deliver',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const lot = await loadLotForUser(req, res);
    if (!lot) return;
    if (lot.status !== 'sold') return sendError(res, `Only sold lots can be delivered (current: ${lot.status})`, 409);
    const updated = await prisma.harvestLot.update({
      where: { id: lot.id },
      data: { status: 'delivered', delivered_at: new Date() },
      include: lotInclude,
    });
    return sendSuccess(res, updated, 'Lot marked as delivered');
  })
);

/**
 * @route DELETE /api/harvest-lots/:id
 * @desc  Delete a lot that has not progressed beyond "recorded".
 * @access Admin, Farmer (own)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin', 'farmer'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const lot = await loadLotForUser(req, res);
    if (!lot) return;
    if (lot.status !== 'recorded' && req.user!.role !== 'admin') {
      return sendError(res, 'Only lots that are still "recorded" can be deleted', 409);
    }
    await prisma.harvestLot.delete({ where: { id: lot.id } });
    return sendSuccess(res, null, 'Harvest lot deleted successfully');
  })
);

/**
 * @route GET /api/traceability/:lotCode
 * @desc  PUBLIC trace lookup for a lot code (what a buyer sees after scanning the QR).
 *        Returns origin and quality data only — no farmer name, phone, buyer or price.
 * @access Public
 */
traceabilityRouter.get(
  '/:lotCode',
  asyncHandler(async (req: Request, res: Response) => {
    const code = String(req.params.lotCode || '').toUpperCase();
    if (!/^AVO-\d{8}-[0-9A-F]{6}$/.test(code)) return sendError(res, 'Invalid lot code', 400);

    const lot = await prisma.harvestLot.findUnique({
      where: { lot_code: code },
      include: { farm: { select: { location: true, organic_certified: true, varieties: true } } },
    });
    if (!lot) return sendNotFound(res, 'Lot not found');

    const loc = (lot.farm.location ?? {}) as Record<string, any>;
    return sendSuccess(
      res,
      {
        lot_code: lot.lot_code,
        variety: lot.variety,
        harvest_date: lot.harvest_date,
        quantity_kg: lot.quantity_kg,
        grade: lot.grade,
        dry_matter_pct: lot.dry_matter_pct,
        maturity_passed: lot.maturity_passed,
        status: lot.status,
        verified: ['verified', 'sold', 'delivered'].includes(lot.status),
        verified_at: lot.verified_at,
        origin: {
          country: 'Rwanda',
          province: loc.province ?? null,
          district: loc.district ?? null,
          sector: loc.sector ?? null,
        },
        organic_certified: lot.farm.organic_certified,
      },
      'Lot trace information'
    );
  })
);

export default router;
