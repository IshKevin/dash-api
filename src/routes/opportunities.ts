import { Router, Response } from 'express';
import { OpportunityStatus, OpportunityType, ProduceGrade, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { validateIdParam } from '../middleware/validation';
import { sendSuccess, sendCreated, sendError, sendNotFound, sendPaginatedResponse } from '../utils/responses';
import { createNotification } from '../utils/notificationService';
import { AuthenticatedRequest } from '../types/auth';
import { canonicalDistrict, canonicalProvince } from '../services/rwandaGeo';
import logger from '../config/logger';
import { scoreMatch, loadFarmerSupply, farmGatePrices, nearbyDistricts, PRODUCE_TYPES } from '../services/opportunityMatching';
import { canAccessFarmer, farmerScope, OUTSIDE_TERRITORY } from '../utils/agentScope';

const router = Router();

const TYPES = Object.values(OpportunityType) as string[];
const STATUSES = Object.values(OpportunityStatus) as string[];
const GRADES = Object.values(ProduceGrade) as string[];
const DAY_MS = 24 * 60 * 60 * 1000;
const round = (n: number) => Math.round(n * 100) / 100;

const TYPE_LABELS: Record<string, string> = {
  buyer_demand: 'Buyer looking for avocados',
  export_contract: 'Export contract',
  grant_funding: 'Grant / funding',
  loan_credit: 'Loan / credit',
  input_subsidy: 'Subsidised inputs',
  training: 'Training',
  certification: 'Certification support',
  job: 'Job',
  tender: 'Tender',
  other: 'Opportunity',
};

const startOfToday = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/** The farmer's own district/province (farm address first, then home). */
async function farmerArea(userId: string) {
  const p = await prisma.farmerProfile.findUnique({
    where: { user_id: userId },
    select: { district: true, province: true, farm_district: true, farm_province: true },
  });
  const d = canonicalDistrict(p?.farm_district || p?.district);
  return {
    district: d?.name ?? null,
    province: d?.province ?? canonicalProvince(p?.farm_province || p?.province) ?? null,
  };
}

/** Opportunities a farmer may see: open, not expired, and nationwide or in their area. */
async function farmerVisibleWhere(userId: string): Promise<Prisma.OpportunityWhereInput> {
  const area = await farmerArea(userId);
  const areaFilters: Prisma.OpportunityWhereInput[] = [{ province: null, district: null }];
  if (area.province) areaFilters.push({ province: area.province, district: null });
  if (area.district) areaFilters.push({ district: area.district });
  return {
    status: 'open',
    OR: [{ deadline: null }, { deadline: { gte: startOfToday() } }],
    AND: [{ OR: areaFilters }],
  };
}

/**
 * What the matching engine may offer a farmer: everything they can see, plus
 * buyers / export / tenders posted for nearby districts (within NEARBY_KM) —
 * a buyer 40 km away across a district border is still a real opportunity.
 */
async function farmerMatchableWhere(userId: string): Promise<Prisma.OpportunityWhereInput> {
  const visible = await farmerVisibleWhere(userId);
  const near = nearbyDistricts((await farmerArea(userId)).district);
  if (!near.length) return visible;
  return {
    OR: [
      visible,
      {
        status: 'open',
        type: { in: PRODUCE_TYPES as OpportunityType[] },
        district: { in: near },
        OR: [{ deadline: null }, { deadline: { gte: startOfToday() } }],
      },
    ],
  };
}

function parseOptionalNumber(value: unknown, field: string): [number | null | undefined, string | null] {
  if (value === undefined) return [undefined, null];
  if (value === null || value === '') return [null, null];
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return [undefined, `${field} must be a positive number`];
  return [n, null];
}

function buildData(body: any, partial: boolean): [Record<string, any> | null, string | null] {
  const data: Record<string, any> = {};
  for (const field of ['title', 'description'] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'string' || !body[field].trim()) return [null, `${field} must be a non-empty string`];
      data[field] = body[field].trim();
    } else if (!partial) return [null, `${field} is required`];
  }
  if (body.type !== undefined) {
    if (!TYPES.includes(body.type)) return [null, `type must be one of: ${TYPES.join(', ')}`];
    data.type = body.type;
  } else if (!partial) return [null, 'type is required'];

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return [null, `status must be one of: ${STATUSES.join(', ')}`];
    data.status = body.status;
  }
  if (body.min_grade !== undefined) {
    if (body.min_grade === null || body.min_grade === '') data.min_grade = null;
    else if (!GRADES.includes(body.min_grade)) return [null, `min_grade must be one of: ${GRADES.join(', ')}`];
    else data.min_grade = body.min_grade;
  }

  // Area: a district implies its province; empty both = nationwide.
  if (body.district !== undefined) {
    if (body.district === null || body.district === '') data.district = null;
    else {
      const d = canonicalDistrict(body.district);
      if (!d) return [null, 'district must be a valid Rwanda district'];
      data.district = d.name;
      data.province = d.province;
    }
  }
  if (body.province !== undefined && data.province === undefined) {
    if (body.province === null || body.province === '') data.province = null;
    else {
      const p = canonicalProvince(body.province);
      if (!p) return [null, 'province must be a valid Rwanda province'];
      data.province = p;
    }
  }

  for (const field of ['quantity_kg', 'price_per_kg'] as const) {
    const [n, err] = parseOptionalNumber(body[field], field);
    if (err) return [null, err];
    if (n !== undefined) data[field] = n;
  }

  if (body.deadline !== undefined) {
    if (body.deadline === null || body.deadline === '') data.deadline = null;
    else {
      const d = new Date(String(body.deadline));
      if (Number.isNaN(d.getTime())) return [null, 'deadline must be a valid date'];
      if (!partial && d < startOfToday()) return [null, 'deadline cannot be in the past'];
      data.deadline = d;
    }
  }

  if (body.link !== undefined) {
    if (body.link === null || body.link === '') data.link = null;
    else if (!/^https?:\/\/\S+$/i.test(String(body.link).trim())) return [null, 'link must start with http:// or https://'];
    else data.link = String(body.link).trim();
  }
  if (body.contact_email !== undefined && body.contact_email !== null && body.contact_email !== '') {
    if (!/^\S+@\S+\.\S+$/.test(String(body.contact_email).trim())) return [null, 'contact_email must be a valid email'];
  }
  for (const field of ['organization', 'contact_name', 'contact_phone', 'contact_email'] as const) {
    if (body[field] !== undefined) data[field] = body[field] === null || body[field] === '' ? null : String(body[field]).trim();
  }
  return [data, null];
}

/** Tell farmers in the target area about a new opportunity (in-app only). */
async function announce(opp: { id: string; title: string; type: string; district: string | null; province: string | null }) {
  try {
    const profileWhere: Prisma.FarmerProfileWhereInput = opp.district
      ? { OR: [{ farm_district: opp.district }, { farm_district: null, district: opp.district }] }
      : opp.province
        ? { OR: [{ farm_province: opp.province }, { farm_province: null, province: opp.province }] }
        : {};
    const farmers = await prisma.user.findMany({
      where: { role: 'farmer', status: 'active', farmer_profile: { is: profileWhere } },
      select: { id: true },
      take: 20000,
    });
    if (!farmers.length) return 0;
    const where = opp.district ? ` in ${opp.district}` : opp.province ? ` in ${opp.province}` : '';
    await prisma.notification.createMany({
      data: farmers.map((f) => ({
        recipient_id: f.id,
        type: 'info' as const,
        title: `New opportunity: ${TYPE_LABELS[opp.type] ?? 'Opportunity'}`,
        message: `${opp.title}${where}. Open Opportunities on your dashboard to see details.`,
        related_entity_id: opp.id,
        related_entity_type: 'system' as const,
      })),
    });
    return farmers.length;
  } catch (error) {
    logger.error('Failed to announce opportunity', { error, opportunityId: opp.id });
    return 0;
  }
}

const creatorSelect = { select: { id: true, full_name: true, role: true } } as const;

/**
 * @route GET /api/opportunities
 * @desc  List opportunities. Farmers only see open, unexpired ones for their
 *        area (or nationwide), with `my_interest`. Staff see all.
 *        Filters: type, status (staff), district (staff), search, page, limit
 * @access Any authenticated user
 */
router.get(
  '/',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = req.query as Record<string, string>;
    const filters: Prisma.OpportunityWhereInput[] = [];
    if (q.type) {
      if (!TYPES.includes(q.type)) return sendError(res, `type must be one of: ${TYPES.join(', ')}`, 400);
      filters.push({ type: q.type as OpportunityType });
    }
    if (q.search) {
      const s = q.search.trim();
      filters.push({ OR: [{ title: { contains: s, mode: 'insensitive' } }, { organization: { contains: s, mode: 'insensitive' } }] });
    }
    const farmer = req.user!.role === 'farmer';
    if (farmer) filters.push(await farmerVisibleWhere(req.user!.id));
    else {
      if (q.status) {
        if (!STATUSES.includes(q.status)) return sendError(res, `status must be one of: ${STATUSES.join(', ')}`, 400);
        filters.push({ status: q.status as OpportunityStatus });
      }
      if (q.district) filters.push({ district: canonicalDistrict(q.district)?.name ?? q.district });
      if (q.mine === 'true') filters.push({ created_by: req.user!.id });
    }
    const where: Prisma.OpportunityWhereInput = filters.length ? { AND: filters } : {};

    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
    const [items, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        // Soonest deadline first, open-ended ones after, newest first within.
        orderBy: [{ status: 'asc' }, { deadline: { sort: 'asc', nulls: 'last' } }, { created_at: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          creator: creatorSelect,
          _count: { select: { interests: true } },
          ...(farmer && { interests: { where: { farmer_id: req.user!.id }, select: { id: true, created_at: true, message: true, quantity_kg: true } } }),
        },
      }),
      prisma.opportunity.count({ where }),
    ]);

    const data = items.map(({ interests, _count, ...o }: any) => ({
      ...o,
      interest_count: _count.interests,
      ...(farmer && { my_interest: interests?.[0] ?? null }),
    }));
    return sendPaginatedResponse(res, data, total, page, limit, 'Opportunities retrieved successfully');
  })
);

/**
 * @route GET /api/opportunities/insights
 * @desc  Market opportunities computed from recorded prices: districts where the
 *        average farm-gate / wholesale price over the last `days` (default 30)
 *        beats the farmer's own district by at least 5%.
 * @access Any authenticated user (farmers: their district; staff: ?district=)
 */
router.get(
  '/insights',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = req.query as Record<string, string>;
    const days = Math.min(180, Math.max(7, parseInt(q.days, 10) || 30));
    const district = req.user!.role === 'farmer'
      ? (await farmerArea(req.user!.id)).district
      : canonicalDistrict(q.district)?.name ?? null;

    const rows = await prisma.marketPrice.groupBy({
      by: ['district', 'price_type'],
      where: { commodity: 'avocado', price_type: { in: ['farm_gate', 'wholesale'] }, price_date: { gte: new Date(Date.now() - days * DAY_MS) } },
      _avg: { price_per_kg: true },
      _count: { _all: true },
    });

    const insights: any[] = [];
    for (const type of ['farm_gate', 'wholesale'] as const) {
      const ofType = rows.filter((r) => r.price_type === type && r._avg.price_per_kg != null);
      if (!ofType.length) continue;
      const nationalAvg = ofType.reduce((s, r) => s + r._avg.price_per_kg!, 0) / ofType.length;
      const own = district ? ofType.find((r) => canonicalDistrict(r.district)?.name === district) : undefined;
      const baseline = own?._avg.price_per_kg ?? nationalAvg;
      ofType
        .filter((r) => canonicalDistrict(r.district)?.name !== district && r._avg.price_per_kg! >= baseline * 1.05)
        .sort((a, b) => b._avg.price_per_kg! - a._avg.price_per_kg!)
        .slice(0, 3)
        .forEach((r) => insights.push({
          kind: 'better_price',
          price_type: type,
          district: r.district,
          average_price: round(r._avg.price_per_kg!),
          observations: r._count._all,
          compared_to: own ? 'your_district' : 'national_average',
          baseline_price: round(baseline),
          difference_pct: round(((r._avg.price_per_kg! - baseline) / baseline) * 100),
        }));
    }
    return sendSuccess(res, { district, period_days: days, insights }, 'Opportunity insights retrieved successfully');
  })
);

/**
 * @route GET /api/opportunities/matches
 * @desc  Matching engine: the opportunities a farmer can see, ranked by fit
 *        (location, supply vs quantity, price vs local farm-gate, grade,
 *        deadline) with plain-language reasons.
 * @access Farmer (own); Admin / Agent with ?farmer_id= (agents: farmers in their area)
 */
router.get(
  '/matches',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const isFarmer = req.user!.role === 'farmer';
    const farmerId = isFarmer ? req.user!.id : String(req.query.farmer_id || '');
    if (!farmerId) return sendError(res, 'farmer_id is required', 400);
    if (!isFarmer && !(await canAccessFarmer(req, farmerId))) return sendError(res, OUTSIDE_TERRITORY, 403);

    const [farmer] = await loadFarmerSupply({ id: farmerId }, 1);
    if (!farmer) return sendNotFound(res, 'Farmer not found');

    const [opps, prices, interests] = await Promise.all([
      prisma.opportunity.findMany({ where: await farmerMatchableWhere(farmerId), take: 500 }),
      farmGatePrices(),
      prisma.opportunityInterest.findMany({ where: { farmer_id: farmerId }, select: { opportunity_id: true } }),
    ]);
    const interested = new Set(interests.map((i) => i.opportunity_id));
    const local = (farmer.district && prices.byDistrict.get(farmer.district)) || prices.national;

    const matches = opps
      .map((o) => ({ opportunity: { ...o, type_label: TYPE_LABELS[o.type] ?? 'Opportunity' }, ...scoreMatch(o, farmer, local), interested: interested.has(o.id) }))
      .sort((a, b) => b.score - a.score || (a.opportunity.deadline?.getTime() ?? Infinity) - (b.opportunity.deadline?.getTime() ?? Infinity));

    const { phone: _p, ...profile } = farmer;
    return sendSuccess(res, { farmer: { ...profile, local_farm_gate_price: local ? round(local) : null }, matches }, 'Opportunity matches retrieved successfully');
  })
);

/**
 * @route GET /api/opportunities/:id
 * @access Any authenticated user (farmers: only ones visible to them)
 */
router.get(
  '/:id',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const farmer = req.user!.role === 'farmer';
    const where: Prisma.OpportunityWhereInput = farmer
      ? { AND: [{ id: req.params.id }, await farmerMatchableWhere(req.user!.id)] }
      : { id: req.params.id };
    const o: any = await prisma.opportunity.findFirst({
      where,
      include: {
        creator: creatorSelect,
        _count: { select: { interests: true } },
        ...(farmer && { interests: { where: { farmer_id: req.user!.id } } }),
      },
    });
    if (!o) return sendNotFound(res, 'Opportunity not found');
    const { interests, _count, ...rest } = o;
    return sendSuccess(res, { ...rest, interest_count: _count.interests, ...(farmer && { my_interest: interests?.[0] ?? null }) }, 'Opportunity retrieved successfully');
  })
);

/**
 * @route POST /api/opportunities
 * @desc  Post an opportunity; farmers in the area get an in-app notification
 *        (set notify=false to skip).
 * @access Admin, Agent
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const [data, err] = buildData(req.body ?? {}, false);
    if (err) return sendError(res, err, 400);
    const opp = await prisma.opportunity.create({
      data: { ...(data as any), created_by: req.user!.id },
      include: { creator: creatorSelect },
    });
    const notified = req.body?.notify === false || req.body?.notify === 'false' ? 0 : await announce(opp);
    return sendCreated(res, { ...opp, interest_count: 0, farmers_notified: notified }, 'Opportunity posted successfully');
  })
);

async function loadOwned(req: AuthenticatedRequest, res: Response) {
  const opp = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
  if (!opp) {
    sendNotFound(res, 'Opportunity not found');
    return null;
  }
  if (req.user!.role !== 'admin' && opp.created_by !== req.user!.id) {
    sendError(res, 'Only the person who posted this opportunity or an admin can change it', 403);
    return null;
  }
  return opp;
}

/**
 * @route PUT /api/opportunities/:id
 * @access Admin, Agent (own)
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'agent'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!(await loadOwned(req, res))) return;
    const [data, err] = buildData(req.body ?? {}, true);
    if (err) return sendError(res, err, 400);
    if (!Object.keys(data!).length) return sendError(res, 'Nothing to update', 400);
    const opp = await prisma.opportunity.update({ where: { id: req.params.id }, data: data!, include: { creator: creatorSelect } });
    return sendSuccess(res, opp, 'Opportunity updated successfully');
  })
);

/**
 * @route DELETE /api/opportunities/:id
 * @access Admin, Agent (own)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin', 'agent'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!(await loadOwned(req, res))) return;
    await prisma.opportunity.delete({ where: { id: req.params.id } });
    return sendSuccess(res, null, 'Opportunity deleted successfully');
  })
);

/**
 * @route GET /api/opportunities/:id/interests
 * @desc  Farmers who said they are interested (with phone, so the poster can call them)
 * @access Admin, Agent (own)
 */
router.get(
  '/:id/interests',
  authenticate,
  authorize('admin', 'agent'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!(await loadOwned(req, res))) return;
    const interests = await prisma.opportunityInterest.findMany({
      where: { opportunity_id: req.params.id },
      orderBy: { created_at: 'desc' },
      include: {
        farmer: {
          select: {
            id: true, full_name: true, phone: true,
            farmer_profile: { select: { district: true, sector: true, farm_district: true, farm_sector: true, tree_count: true, farm_size: true } },
          },
        },
      },
    });
    return sendSuccess(res, interests, 'Interested farmers retrieved successfully');
  })
);

/**
 * @route POST /api/opportunities/:id/interest
 * @desc  Farmer says "I'm interested" (optional message / quantity_kg). Idempotent;
 *        the poster is notified the first time.
 * @access Farmer
 */
router.post(
  '/:id/interest',
  authenticate,
  authorize('farmer'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Nearby buyers suggested by the matching engine are allowed too.
    const opp = await prisma.opportunity.findFirst({
      where: { AND: [{ id: req.params.id }, await farmerMatchableWhere(req.user!.id)] },
    });
    if (!opp) return sendNotFound(res, 'Opportunity not found or no longer open');

    const [quantity, qErr] = parseOptionalNumber(req.body?.quantity_kg, 'quantity_kg');
    if (qErr) return sendError(res, qErr, 400);
    const message = typeof req.body?.message === 'string' && req.body.message.trim() ? req.body.message.trim().slice(0, 1000) : null;

    const existing = await prisma.opportunityInterest.findUnique({
      where: { opportunity_id_farmer_id: { opportunity_id: opp.id, farmer_id: req.user!.id } },
    });
    const interest = await prisma.opportunityInterest.upsert({
      where: { opportunity_id_farmer_id: { opportunity_id: opp.id, farmer_id: req.user!.id } },
      create: { opportunity_id: opp.id, farmer_id: req.user!.id, message, quantity_kg: quantity ?? null },
      update: { message, quantity_kg: quantity ?? null },
    });

    if (!existing) {
      const farmer = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { full_name: true, phone: true } });
      await createNotification(
        opp.created_by,
        'info',
        'A farmer is interested',
        `${farmer?.full_name ?? 'A farmer'}${farmer?.phone ? ` (${farmer.phone})` : ''} is interested in "${opp.title}"${quantity ? ` — ${quantity} kg` : ''}.`,
        opp.id,
        'system'
      );
    }
    return existing
      ? sendSuccess(res, interest, 'Your interest has been updated')
      : sendCreated(res, interest, 'Your interest has been sent');
  })
);

/**
 * @route DELETE /api/opportunities/:id/interest
 * @desc  Farmer withdraws their interest
 * @access Farmer
 */
router.delete(
  '/:id/interest',
  authenticate,
  authorize('farmer'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { count } = await prisma.opportunityInterest.deleteMany({ where: { opportunity_id: req.params.id, farmer_id: req.user!.id } });
    if (!count) return sendNotFound(res, 'You had not expressed interest in this opportunity');
    return sendSuccess(res, null, 'Interest withdrawn');
  })
);

/**
 * @route GET /api/opportunities/:id/matching-farmers
 * @desc  Matching engine, reverse: the best-fit farmers for one opportunity,
 *        with how much of the requested quantity the top matches can cover.
 *        Searches the opportunity's province and, for buyers, districts within
 *        NEARBY_KM (so growers just across a border are found), or the whole
 *        country if nationwide.
 * @access Admin, Agent (only farmers in their area)
 */
router.get(
  '/:id/matching-farmers',
  authenticate,
  authorize('admin', 'agent'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const opp = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
    if (!opp) return sendNotFound(res, 'Opportunity not found');
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 25));

    // Same province, plus (for produce buyers) districts within NEARBY_KM.
    const districts = opp.district && PRODUCE_TYPES.includes(opp.type) ? [opp.district, ...nearbyDistricts(opp.district)] : [];
    const area: Prisma.UserWhereInput = opp.province
      ? {
        farmer_profile: {
          is: {
            OR: [
              { farm_province: opp.province }, { farm_province: null, province: opp.province },
              ...(districts.length ? [{ farm_district: { in: districts } }, { farm_district: null, district: { in: districts } }] : []),
            ],
          },
        },
      }
      : {};
    const scope = await farmerScope(req); // null for admins
    const candidates = await loadFarmerSupply(scope ? { AND: [area, scope] } : area);
    const prices = await farmGatePrices();

    const ranked = candidates
      .map((f) => ({ farmer: f, ...scoreMatch(opp, f, (f.district && prices.byDistrict.get(f.district)) || prices.national) }))
      .filter((m) => m.score >= 35)
      .sort((a, b) => b.score - a.score || (b.supply_kg ?? 0) - (a.supply_kg ?? 0));

    // How many of the best matches are needed to fill the order?
    let covered = 0; let needed: number | null = null;
    if (opp.quantity_kg) {
      for (let i = 0; i < ranked.length; i++) {
        covered += ranked[i].supply_kg ?? 0;
        if (covered >= opp.quantity_kg) { needed = i + 1; break; }
      }
    }
    const top = ranked.slice(0, limit);
    return sendSuccess(res, {
      opportunity_id: opp.id,
      candidates: candidates.length,
      matched: ranked.length,
      quantity_kg: opp.quantity_kg,
      total_supply_kg: Math.round(ranked.reduce((s, m) => s + (m.supply_kg ?? 0), 0)),
      farmers_needed_to_fill: needed,
      farmers: top.map(({ farmer, ...m }) => ({
        user_id: farmer.user_id, full_name: farmer.full_name, phone: farmer.phone, district: farmer.district,
        trees: farmer.trees, ready_kg: farmer.ready_kg, expected_kg: farmer.expected_kg, best_grade: farmer.best_grade, verified: farmer.verified,
        ...m,
      })),
    }, 'Matching farmers retrieved successfully');
  })
);

export default router;
