import { Router, Response } from 'express';
import { MarketPriceType, ProduceGrade, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
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
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

const PRICE_TYPES = Object.values(MarketPriceType) as string[];
const GRADES = Object.values(ProduceGrade) as string[];
const DAY_MS = 24 * 60 * 60 * 1000;

const round = (n: number) => Math.round(n * 100) / 100;

function parseDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Validate + normalise a price payload. Returns [data, error]. */
function buildPriceData(body: any, partial: boolean): [Record<string, any> | null, string | null] {
  const data: Record<string, any> = {};

  if (body.price_per_kg !== undefined) {
    const price = Number(body.price_per_kg);
    if (!Number.isFinite(price) || price <= 0) return [null, 'price_per_kg must be a positive number'];
    data.price_per_kg = price;
  } else if (!partial) return [null, 'price_per_kg is required'];

  for (const field of ['province', 'district'] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'string' || !body[field].trim()) return [null, `${field} must be a non-empty string`];
      data[field] = body[field].trim();
    } else if (!partial) return [null, `${field} is required`];
  }

  if (body.price_type !== undefined) {
    if (!PRICE_TYPES.includes(body.price_type)) return [null, `price_type must be one of: ${PRICE_TYPES.join(', ')}`];
    data.price_type = body.price_type;
  }
  if (body.grade !== undefined) {
    if (!GRADES.includes(body.grade)) return [null, `grade must be one of: ${GRADES.join(', ')}`];
    data.grade = body.grade;
  }
  if (body.price_date !== undefined) {
    const d = parseDate(body.price_date);
    if (!d) return [null, 'price_date must be a valid date'];
    if (d.getTime() > Date.now() + DAY_MS) return [null, 'price_date cannot be in the future'];
    data.price_date = d;
  }
  for (const field of ['commodity', 'variety', 'market_name', 'source', 'notes', 'currency'] as const) {
    if (body[field] !== undefined && body[field] !== null) data[field] = String(body[field]).trim();
  }
  return [data, null];
}

function buildWhere(query: Record<string, string>): [Prisma.MarketPriceWhereInput | null, string | null] {
  const where: Prisma.MarketPriceWhereInput = {};
  if (query.commodity) where.commodity = query.commodity;
  if (query.variety) where.variety = query.variety;
  if (query.province) where.province = query.province;
  if (query.district) where.district = query.district;
  if (query.price_type) {
    if (!PRICE_TYPES.includes(query.price_type)) return [null, `price_type must be one of: ${PRICE_TYPES.join(', ')}`];
    where.price_type = query.price_type as MarketPriceType;
  }
  if (query.grade) {
    if (!GRADES.includes(query.grade)) return [null, `grade must be one of: ${GRADES.join(', ')}`];
    where.grade = query.grade as ProduceGrade;
  }
  const from = parseDate(query.from);
  const to = parseDate(query.to);
  if (query.from && !from) return [null, 'from must be a valid date'];
  if (query.to && !to) return [null, 'to must be a valid date'];
  if (from || to) where.price_date = { ...(from && { gte: from }), ...(to && { lte: to }) };
  return [where, null];
}

/**
 * @route GET /api/market-prices
 * @desc  List price observations (filters: commodity, variety, grade, price_type, province, district, from, to)
 * @access Any authenticated user
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = req.query as Record<string, string>;
    const [where, err] = buildWhere(q);
    if (err) return sendError(res, err, 400);

    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));

    const [items, total] = await Promise.all([
      prisma.marketPrice.findMany({
        where: where!,
        orderBy: [{ price_date: 'desc' }, { created_at: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { recorder: { select: { id: true, full_name: true, role: true } } },
      }),
      prisma.marketPrice.count({ where: where! }),
    ]);
    return sendPaginatedResponse(res, items, total, page, limit, 'Market prices retrieved successfully');
  })
);

/**
 * @route GET /api/market-prices/latest
 * @desc  Most recent price per (variety, grade, price_type, district) within `days` (default 60)
 * @access Any authenticated user
 */
router.get(
  '/latest',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = req.query as Record<string, string>;
    const [where, err] = buildWhere(q);
    if (err) return sendError(res, err, 400);
    const days = Math.min(365, Math.max(1, parseInt(q.days, 10) || 60));
    where!.price_date = { gte: new Date(Date.now() - days * DAY_MS) };

    const latest = await prisma.marketPrice.findMany({
      where: where!,
      distinct: ['variety', 'grade', 'price_type', 'district'],
      orderBy: [{ price_date: 'desc' }, { created_at: 'desc' }],
    });
    latest.sort((a, b) => a.district.localeCompare(b.district) || a.price_type.localeCompare(b.price_type));
    return sendSuccess(res, latest, 'Latest market prices retrieved successfully');
  })
);

/**
 * @route GET /api/market-prices/summary
 * @desc  National average per price type: last `days` (default 30) vs the period before, with % change
 * @access Any authenticated user
 */
router.get(
  '/summary',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = req.query as Record<string, string>;
    const days = Math.min(365, Math.max(1, parseInt(q.days, 10) || 30));
    const variety = q.variety || undefined;
    const now = Date.now();
    const currentFrom = new Date(now - days * DAY_MS);
    const previousFrom = new Date(now - 2 * days * DAY_MS);

    const base: Prisma.MarketPriceWhereInput = { commodity: q.commodity || 'avocado', ...(variety && { variety }) };
    const [current, previous] = await Promise.all([
      prisma.marketPrice.groupBy({
        by: ['price_type'],
        where: { ...base, price_date: { gte: currentFrom } },
        _avg: { price_per_kg: true },
        _min: { price_per_kg: true },
        _max: { price_per_kg: true },
        _count: { _all: true },
      }),
      prisma.marketPrice.groupBy({
        by: ['price_type'],
        where: { ...base, price_date: { gte: previousFrom, lt: currentFrom } },
        _avg: { price_per_kg: true },
      }),
    ]);

    const summary = PRICE_TYPES.map((type) => {
      const cur = current.find((c) => c.price_type === type);
      const prev = previous.find((p) => p.price_type === type);
      const avg = cur?._avg.price_per_kg ?? null;
      const prevAvg = prev?._avg.price_per_kg ?? null;
      return {
        price_type: type,
        average_price: avg !== null ? round(avg) : null,
        min_price: cur?._min.price_per_kg ?? null,
        max_price: cur?._max.price_per_kg ?? null,
        observations: cur?._count._all ?? 0,
        previous_average: prevAvg !== null ? round(prevAvg) : null,
        change_pct: avg !== null && prevAvg ? round(((avg - prevAvg) / prevAvg) * 100) : null,
      };
    });

    return sendSuccess(res, { period_days: days, variety: variety ?? 'all', summary }, 'Market price summary retrieved successfully');
  })
);

/**
 * @route GET /api/market-prices/trends
 * @desc  Average/min/max price per day or week (interval=day|week, default week) over `days` (default 90)
 * @access Any authenticated user
 */
router.get(
  '/trends',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = req.query as Record<string, string>;
    const [where, err] = buildWhere(q);
    if (err) return sendError(res, err, 400);
    const days = Math.min(730, Math.max(7, parseInt(q.days, 10) || 90));
    const interval = q.interval === 'day' ? 'day' : 'week';
    where!.price_date = { gte: new Date(Date.now() - days * DAY_MS) };

    const rows = await prisma.marketPrice.findMany({
      where: where!,
      select: { price_date: true, price_per_kg: true, price_type: true },
      orderBy: { price_date: 'asc' },
    });

    // Bucket by period start (UTC) and price type.
    const buckets = new Map<string, { period: string; price_type: string; sum: number; count: number; min: number; max: number }>();
    for (const r of rows) {
      const d = new Date(Date.UTC(r.price_date.getUTCFullYear(), r.price_date.getUTCMonth(), r.price_date.getUTCDate()));
      if (interval === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
      const period = d.toISOString().slice(0, 10);
      const key = `${period}|${r.price_type}`;
      const b = buckets.get(key) ?? { period, price_type: r.price_type, sum: 0, count: 0, min: Infinity, max: -Infinity };
      b.sum += r.price_per_kg;
      b.count += 1;
      b.min = Math.min(b.min, r.price_per_kg);
      b.max = Math.max(b.max, r.price_per_kg);
      buckets.set(key, b);
    }

    const series = [...buckets.values()]
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((b) => ({
        period: b.period,
        price_type: b.price_type,
        average_price: round(b.sum / b.count),
        min_price: b.min,
        max_price: b.max,
        observations: b.count,
      }));

    return sendSuccess(res, { interval, days, series }, 'Market price trends retrieved successfully');
  })
);

/**
 * @route GET /api/market-prices/:id
 * @access Any authenticated user
 */
router.get(
  '/:id',
  authenticate,
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const price = await prisma.marketPrice.findUnique({
      where: { id: req.params.id },
      include: { recorder: { select: { id: true, full_name: true, role: true } } },
    });
    if (!price) return sendNotFound(res, 'Market price not found');
    return sendSuccess(res, price, 'Market price retrieved successfully');
  })
);

/**
 * @route POST /api/market-prices
 * @desc  Record a price observation
 * @access Admin, Agent
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const [data, err] = buildPriceData(req.body, false);
    if (err) return sendError(res, err, 400);
    const price = await prisma.marketPrice.create({
      data: { ...(data as any), recorded_by: req.user!.id },
    });
    return sendCreated(res, price, 'Market price recorded successfully');
  })
);

/**
 * @route POST /api/market-prices/bulk
 * @desc  Record up to 200 observations at once (e.g. weekly market survey import). All-or-nothing.
 * @access Admin
 */
router.post(
  '/bulk',
  authenticate,
  authorize('admin'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const items = req.body?.prices;
    if (!Array.isArray(items) || items.length === 0) return sendError(res, 'prices must be a non-empty array', 400);
    if (items.length > 200) return sendError(res, 'At most 200 prices per request', 400);

    const rows: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const [data, err] = buildPriceData(items[i], false);
      if (err) return sendError(res, `prices[${i}]: ${err}`, 400);
      rows.push({ ...data, recorded_by: req.user!.id });
    }
    const result = await prisma.marketPrice.createMany({ data: rows });
    return sendCreated(res, { created: result.count }, `${result.count} market prices recorded`);
  })
);

/**
 * @route PUT /api/market-prices/:id
 * @access Admin (any), Agent (only records they created)
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'agent'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.marketPrice.findUnique({ where: { id: req.params.id } });
    if (!existing) return sendNotFound(res, 'Market price not found');
    if (req.user!.role === 'agent' && existing.recorded_by !== req.user!.id) {
      return sendError(res, 'Agents can only edit prices they recorded', 403);
    }
    const [data, err] = buildPriceData(req.body, true);
    if (err) return sendError(res, err, 400);
    const updated = await prisma.marketPrice.update({ where: { id: existing.id }, data: data! });
    return sendSuccess(res, updated, 'Market price updated successfully');
  })
);

/**
 * @route DELETE /api/market-prices/:id
 * @access Admin
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.marketPrice.findUnique({ where: { id: req.params.id } });
    if (!existing) return sendNotFound(res, 'Market price not found');
    await prisma.marketPrice.delete({ where: { id: existing.id } });
    return sendSuccess(res, null, 'Market price deleted successfully');
  })
);

export default router;
