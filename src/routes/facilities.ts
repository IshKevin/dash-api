import { Router, Response } from 'express';
import { FacilityType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { validateIdParam } from '../middleware/validation';
import { sendSuccess, sendCreated, sendError, sendNotFound, sendPaginatedResponse } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { canonicalDistrict, canonicalProvince } from '../services/rwandaGeo';
import { LatLng, districtCentre, haversineKm, isInRwanda, parseLatLng, roundKm } from '../services/proximity';

const router = Router();

const TYPES = Object.values(FacilityType) as string[];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Validate + normalise a facility payload. Returns [data, error]. */
function buildFacilityData(body: any, partial: boolean): [Record<string, any> | null, string | null] {
  const data: Record<string, any> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) return [null, 'name must be a non-empty string'];
    data.name = body.name.trim();
  } else if (!partial) return [null, 'name is required'];

  if (body.type !== undefined) {
    if (!TYPES.includes(body.type)) return [null, `type must be one of: ${TYPES.join(', ')}`];
    data.type = body.type;
  } else if (!partial) return [null, 'type is required'];

  if (body.district !== undefined) {
    const d = canonicalDistrict(body.district);
    if (!d) return [null, 'district must be a valid Rwanda district'];
    data.district = d.name;
    data.province = d.province;
  } else if (!partial) return [null, 'district is required'];
  if (body.province !== undefined && data.province === undefined) {
    const p = canonicalProvince(body.province);
    if (!p) return [null, 'province must be a valid Rwanda province'];
    data.province = p;
  }

  if (body.latitude !== undefined || body.longitude !== undefined) {
    const p = parseLatLng(body.latitude, body.longitude);
    if (!p) return [null, 'latitude and longitude must both be given and lie inside Rwanda'];
    data.latitude = p.lat;
    data.longitude = p.lng;
  } else if (!partial) return [null, 'latitude and longitude are required'];

  if (body.active !== undefined) data.active = body.active === true || body.active === 'true';

  for (const field of ['description', 'sector', 'contact_name', 'contact_phone', 'opening_hours'] as const) {
    if (body[field] !== undefined) data[field] = body[field] === null || body[field] === '' ? null : String(body[field]).trim();
  }
  return [data, null];
}

/**
 * @route GET /api/facilities
 * @desc  List facilities (filters: type, district, province, active, search)
 * @access Any authenticated user (non-staff only see active ones)
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = req.query as Record<string, string>;
    const where: Prisma.FacilityWhereInput = {};
    if (q.type) {
      if (!TYPES.includes(q.type)) return sendError(res, `type must be one of: ${TYPES.join(', ')}`, 400);
      where.type = q.type as FacilityType;
    }
    if (q.district) where.district = canonicalDistrict(q.district)?.name ?? q.district;
    if (q.province) where.province = canonicalProvince(q.province) ?? q.province;
    const staff = req.user!.role === 'admin' || req.user!.role === 'agent';
    if (!staff) where.active = true;
    else if (q.active === 'true' || q.active === 'false') where.active = q.active === 'true';
    if (q.search) where.name = { contains: q.search.trim(), mode: 'insensitive' };

    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
    const [items, total] = await Promise.all([
      prisma.facility.findMany({ where, orderBy: [{ district: 'asc' }, { name: 'asc' }], skip: (page - 1) * limit, take: limit }),
      prisma.facility.count({ where }),
    ]);
    return sendPaginatedResponse(res, items, total, page, limit, 'Facilities retrieved successfully');
  })
);

interface Origin extends LatLng {
  source: 'query' | 'farm_gps' | 'district_centre';
  label: string;
  district: string | null;
  sector: string | null;
}

/**
 * Where "near" is measured from. Explicit ?lat&lng wins (e.g. the phone's
 * GPS), then ?farm_id / the farmer's first farm with GPS, then the centre of
 * the farmer's district. Farmers can only use their own farms.
 */
async function resolveOrigin(req: AuthenticatedRequest): Promise<[Origin | null, string | null]> {
  const q = req.query as Record<string, string>;
  const isFarmer = req.user!.role === 'farmer';

  let district: string | null = null;
  let sector: string | null = null;
  let profile: { district: string | null; sector: string | null; farm_district: string | null; farm_sector: string | null } | null = null;
  if (isFarmer) {
    profile = await prisma.farmerProfile.findUnique({
      where: { user_id: req.user!.id },
      select: { district: true, sector: true, farm_district: true, farm_sector: true },
    });
    district = canonicalDistrict(profile?.farm_district || profile?.district)?.name ?? null;
    sector = profile?.farm_sector || profile?.sector || null;
  }

  if (q.lat !== undefined || q.lng !== undefined) {
    const p = parseLatLng(q.lat, q.lng);
    if (!p) return [null, 'lat and lng must both be given and lie inside Rwanda'];
    return [{ ...p, source: 'query', label: 'Your current location', district, sector }, null];
  }

  const farmWhere: Prisma.FarmWhereInput = { archived_at: null, latitude: { not: null }, longitude: { not: null } };
  if (q.farm_id) farmWhere.id = q.farm_id;
  if (isFarmer) farmWhere.farmer_id = req.user!.id;
  if (q.farm_id || isFarmer) {
    const farm = await prisma.farm.findFirst({ where: farmWhere, orderBy: { created_at: 'asc' }, select: { farmName: true, latitude: true, longitude: true, location: true } });
    if (farm && isInRwanda({ lat: farm.latitude!, lng: farm.longitude! })) {
      const loc = (farm.location ?? {}) as Record<string, any>;
      return [{
        lat: farm.latitude!, lng: farm.longitude!, source: 'farm_gps', label: farm.farmName,
        district: canonicalDistrict(loc.district)?.name ?? district, sector: loc.sector ?? sector,
      }, null];
    }
    if (q.farm_id && !isFarmer) return [null, 'That farm has no GPS location yet'];
  }

  const wantedDistrict = q.district ? canonicalDistrict(q.district)?.name ?? null : district;
  const centre = districtCentre(wantedDistrict);
  if (centre && wantedDistrict) {
    return [{ ...centre, source: 'district_centre', label: `${wantedDistrict} district (approximate)`, district: wantedDistrict, sector }, null];
  }
  return [null, isFarmer
    ? 'We could not find your farm location. Add GPS to your farm, set your district on your profile, or share your current location.'
    : 'Give lat & lng, a farm_id with GPS, or a district'];
}

/**
 * @route GET /api/facilities/nearby
 * @desc  What is close to the farm: field agents, input shops and facilities
 *        (markets, collection centres, airports…), nearest first.
 *        Query: lat, lng | farm_id | district; types (comma list); limit (per group, default 5, max 20)
 * @access Any authenticated user
 */
router.get(
  '/nearby',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = req.query as Record<string, string>;
    const [origin, err] = await resolveOrigin(req);
    if (!origin) return sendError(res, err!, 400);

    const limit = Math.min(20, Math.max(1, parseInt(q.limit, 10) || 5));
    const types = q.types ? q.types.split(',').map((t) => t.trim()).filter(Boolean) : [];
    const badType = types.find((t) => !TYPES.includes(t));
    if (badType) return sendError(res, `types must be among: ${TYPES.join(', ')}`, 400);

    const [agents, shops, facilities, prices] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'agent', status: 'active', agent_profile: { isNot: null } },
        select: {
          id: true, full_name: true, phone: true,
          agent_profile: { select: { district: true, sector: true, territory: true, specialization: true, profileImage: true } },
        },
        take: 2000,
      }),
      prisma.shop.findMany({
        where: { can_sell: true },
        select: { id: true, shopName: true, description: true, district: true, province: true, ownerPhone: true },
        take: 2000,
      }),
      prisma.facility.findMany({
        where: { active: true, ...(types.length && { type: { in: types as FacilityType[] } }) },
        take: 5000,
      }),
      prisma.marketPrice.groupBy({
        by: ['district'],
        where: { price_type: 'farm_gate', commodity: 'avocado', price_date: { gte: new Date(Date.now() - 60 * DAY_MS) } },
        _avg: { price_per_kg: true },
      }),
    ]);

    // Agents: closest of their home district and every territory district.
    const nearestAgents = agents
      .map((a) => {
        const p = a.agent_profile!;
        const territory = Array.isArray(p.territory) ? (p.territory as any[]) : [];
        const districts = [p.district, ...territory.map((t) => t?.district)]
          .map((d) => canonicalDistrict(d)?.name)
          .filter((d): d is string => Boolean(d));
        const sectors = [p.sector, ...territory.map((t) => t?.sector)].filter(Boolean).map((s) => String(s).toLowerCase());
        const dists = [...new Set(districts)]
          .map((d) => districtCentre(d))
          .filter((c): c is LatLng => c !== null)
          .map((c) => haversineKm(origin, c));
        if (!dists.length) return null;
        const coversDistrict = origin.district ? districts.includes(origin.district) : false;
        const coversSector = coversDistrict && origin.sector ? sectors.includes(origin.sector.toLowerCase()) : false;
        return {
          id: a.id,
          full_name: a.full_name,
          phone: a.phone,
          district: canonicalDistrict(p.district)?.name ?? p.district,
          sector: p.sector,
          specialization: p.specialization,
          profile_image: p.profileImage,
          covers_your_district: coversDistrict,
          covers_your_sector: coversSector,
          distance_km: roundKm(Math.min(...dists)),
          distance_approx: true,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .sort((a, b) => Number(b.covers_your_sector) - Number(a.covers_your_sector)
        || Number(b.covers_your_district) - Number(a.covers_your_district)
        || a.distance_km - b.distance_km)
      .slice(0, limit);

    const nearestShops = shops
      .map((s) => {
        const c = districtCentre(s.district);
        if (!c) return null;
        return {
          id: s.id, name: s.shopName, description: s.description, district: canonicalDistrict(s.district)?.name ?? s.district,
          province: s.province, phone: s.ownerPhone, distance_km: roundKm(haversineKm(origin, c)), distance_approx: true,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, limit);

    const priceByDistrict = new Map(prices.map((p) => [p.district, p._avg.price_per_kg]));
    const byType: Record<string, any[]> = {};
    for (const f of facilities) {
      const item = {
        ...f,
        distance_km: roundKm(haversineKm(origin, { lat: f.latitude, lng: f.longitude })),
        distance_approx: false,
        ...(f.type === 'market' && {
          farm_gate_price_60d: priceByDistrict.get(f.district) != null ? Math.round(priceByDistrict.get(f.district)!) : null,
        }),
      };
      (byType[f.type] ||= []).push(item);
    }
    for (const t of Object.keys(byType)) byType[t] = byType[t].sort((a, b) => a.distance_km - b.distance_km).slice(0, limit);

    return sendSuccess(res, {
      origin,
      agents: nearestAgents,
      shops: nearestShops,
      facilities: byType,
      facility_types: TYPES,
    }, 'Nearby services retrieved successfully');
  })
);

/**
 * @route GET /api/facilities/:id
 * @access Any authenticated user
 */
router.get(
  '/:id',
  authenticate,
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const f = await prisma.facility.findUnique({ where: { id: req.params.id } });
    const staff = req.user!.role === 'admin' || req.user!.role === 'agent';
    if (!f || (!f.active && !staff)) return sendNotFound(res, 'Facility not found');
    return sendSuccess(res, f, 'Facility retrieved successfully');
  })
);

/**
 * @route POST /api/facilities
 * @access Admin, Agent
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const [data, err] = buildFacilityData(req.body ?? {}, false);
    if (err) return sendError(res, err, 400);
    const f = await prisma.facility.create({ data: { ...(data as Prisma.FacilityCreateInput), created_by: req.user!.id } });
    return sendCreated(res, f, 'Facility created successfully');
  })
);

/**
 * @route PUT /api/facilities/:id
 * @access Admin, Agent
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'agent'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const [data, err] = buildFacilityData(req.body ?? {}, true);
    if (err) return sendError(res, err, 400);
    if (!Object.keys(data!).length) return sendError(res, 'Nothing to update', 400);
    const exists = await prisma.facility.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) return sendNotFound(res, 'Facility not found');
    const f = await prisma.facility.update({ where: { id: req.params.id }, data: data! });
    return sendSuccess(res, f, 'Facility updated successfully');
  })
);

/**
 * @route DELETE /api/facilities/:id
 * @access Admin
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const exists = await prisma.facility.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) return sendNotFound(res, 'Facility not found');
    await prisma.facility.delete({ where: { id: req.params.id } });
    return sendSuccess(res, null, 'Facility deleted successfully');
  })
);

export default router;
