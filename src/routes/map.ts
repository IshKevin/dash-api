import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

/**
 * @route GET /api/map/farms
 * @desc  Farms as a GeoJSON FeatureCollection for the map. Point features for
 *        farms with GPS; parcel boundaries included when `boundaries=true`.
 *        Filters: province, district, variety, status, has_upi, verified.
 *        Farmers only get their own farms.
 *        `meta` also reports how many matching farms have no location yet.
 * @access Admin, Agent, Farmer
 */
router.get(
  '/farms',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = req.query as Record<string, string>;
    const where: Prisma.FarmWhereInput = { archived_at: null };
    if (req.user!.role === 'farmer') where.farmer_id = req.user!.id;
    const and: Prisma.FarmWhereInput[] = [];
    if (q.province) and.push({ location: { path: ['province'], equals: q.province } });
    if (q.district) and.push({ location: { path: ['district'], equals: q.district } });
    if (q.variety) where.varieties = { has: q.variety };
    if (q.status) where.status = q.status as any;
    if (q.has_upi === 'true') where.upi = { not: null };
    if (q.has_upi === 'false') where.upi = null;
    if (q.verified === 'true') where.land_verified_at = { not: null };
    if (and.length) where.AND = and;

    const farms = await prisma.farm.findMany({
      where,
      select: {
        id: true, farmName: true, farmerName: true, farmer_id: true, location: true, latitude: true, longitude: true,
        tree_count: true, farm_size: true, varieties: true, status: true, organic_certified: true,
        upi: true, parcel_area_sqm: true, parcel_boundary: true, land_verified_at: true,
        farmer: { select: { phone: true } },
        _count: { select: { harvest_lots: true } },
      },
      take: 10000,
    });

    const withBoundaries = q.boundaries === 'true';
    const staff = req.user!.role !== 'farmer';
    const features: any[] = [];
    let missingLocation = 0;
    for (const f of farms) {
      if (f.latitude === null || f.longitude === null) {
        missingLocation++;
        continue;
      }
      const loc = (f.location ?? {}) as Record<string, any>;
      const properties = {
        id: f.id,
        farm_name: f.farmName,
        farmer_name: f.farmerName,
        farmer_id: f.farmer_id,
        farmer_phone: staff ? f.farmer?.phone ?? null : undefined,
        province: loc.province ?? null,
        district: loc.district ?? null,
        sector: loc.sector ?? null,
        village: loc.village ?? null,
        tree_count: f.tree_count,
        farm_size_ha: f.farm_size,
        varieties: f.varieties,
        status: f.status,
        organic_certified: f.organic_certified,
        upi: f.upi,
        parcel_area_sqm: f.parcel_area_sqm,
        land_verified: Boolean(f.land_verified_at),
        harvest_lots: f._count.harvest_lots,
      };
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.longitude, f.latitude] }, properties });
      if (withBoundaries && f.parcel_boundary) {
        features.push({ type: 'Feature', geometry: f.parcel_boundary, properties: { ...properties, kind: 'parcel' } });
      }
    }

    const points = features.filter((x) => x.geometry.type === 'Point');
    return sendSuccess(res, {
      type: 'FeatureCollection',
      features,
      meta: {
        total_farms: farms.length,
        mapped: points.length,
        missing_location: missingLocation,
        total_trees: points.reduce((s, x) => s + (x.properties.tree_count ?? 0), 0),
        with_upi: farms.filter((f) => f.upi).length,
        verified: farms.filter((f) => f.land_verified_at).length,
      },
    }, 'Farm map data');
  })
);

export default router;
