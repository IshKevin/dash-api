import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError, sendNotFound } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { canAccessFarmer } from '../utils/agentScope';
import { parseUpi, ringAreaSqm, ringCentroid, canonicalDistrict } from '../services/rwandaGeo';
import { inRwanda } from '../services/surveyParser';
import { isRegistryEnabled, lookupParcel } from '../services/landRegistry';

const router = Router();

/** Largest believable parcel for one farm. Bigger usually means a mis-drawn boundary. */
const MAX_PARCEL_HA = 500;

/** Validate a GeoJSON Polygon inside Rwanda. Returns [polygon, error]. */
function validatePolygon(input: any): [{ type: 'Polygon'; coordinates: number[][][] } | null, string | null] {
  if (input === null) return [null, null];
  if (!input || input.type !== 'Polygon' || !Array.isArray(input.coordinates) || !Array.isArray(input.coordinates[0])) {
    return [null, 'parcel_boundary must be a GeoJSON Polygon'];
  }
  const ring: number[][] = input.coordinates[0];
  if (ring.length < 4) return [null, 'A parcel boundary needs at least 3 points'];
  for (const p of ring) {
    if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return [null, 'Invalid coordinate in parcel_boundary'];
    if (!inRwanda(p[1], p[0])) return [null, 'parcel_boundary must be inside Rwanda ([lng, lat] order)'];
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
  if (closed.length > 500) return [null, 'parcel_boundary has too many points (max 500)'];
  return [{ type: 'Polygon', coordinates: [closed] }, null];
}

async function loadFarm(req: AuthenticatedRequest, res: Response) {
  const farm = await prisma.farm.findUnique({ where: { id: req.params.farmId } });
  if (!farm || farm.archived_at) {
    sendNotFound(res, 'Farm not found');
    return null;
  }
  if (!(await canAccessFarmer(req, farm.farmer_id))) {
    sendError(res, 'Access denied', 403);
    return null;
  }
  return farm;
}

const landView = (farm: any) => ({
  farm_id: farm.id,
  farm_name: farm.farmName,
  farmer_name: farm.farmerName,
  location: farm.location,
  latitude: farm.latitude,
  longitude: farm.longitude,
  upi: farm.upi,
  upi_info: farm.upi ? parseUpi(farm.upi) : null,
  parcel_area_sqm: farm.parcel_area_sqm,
  parcel_area_ha: farm.parcel_area_sqm ? Math.round((farm.parcel_area_sqm / 10000) * 10000) / 10000 : null,
  land_use: farm.land_use,
  land_tenure: farm.land_tenure,
  parcel_boundary: farm.parcel_boundary,
  land_source: farm.land_source,
  land_verified_at: farm.land_verified_at,
});

/**
 * @route GET /api/land/status
 * @desc  Whether the national land registry connector is configured
 * @access Any authenticated user
 */
router.get('/status', authenticate, (_req, res) => {
  sendSuccess(res, { registry_enabled: isRegistryEnabled() }, 'Land registry status');
});

/**
 * @route GET /api/land/upi?upi=5/01/02/03/1234
 * @desc  Validate and decode a UPI (province/district from its codes), check
 *        whether another farm already uses it, and — if the registry connector
 *        is configured — fetch the parcel from the land registry.
 * @access Admin, Agent, Farmer
 */
router.get(
  '/upi',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const input = String(req.query.upi ?? '');
    const parsed = parseUpi(input);
    if (!parsed) {
      return sendError(res, 'Invalid UPI. Expected province/district/sector/cell/parcel, e.g. 5/01/02/03/1234', 400);
    }
    const usedBy = await prisma.farm.findMany({
      where: { upi: parsed.normalized, archived_at: null },
      select: { id: true, farmName: true, farmer_id: true },
    });
    const registry = await lookupParcel(parsed.normalized);
    // Farmers must not learn who owns other parcels.
    const safeRegistry =
      registry.status === 'found' && req.user!.role === 'farmer'
        ? { status: 'found', parcel: { ...registry.parcel, owners: registry.parcel.owners.map(() => ({ name: 'hidden' })) } }
        : registry;
    return sendSuccess(res, {
      valid: true,
      parsed,
      in_use_by: req.user!.role === 'farmer'
        ? usedBy.map((f) => ({ id: f.farmer_id === req.user!.id ? f.id : null, own: f.farmer_id === req.user!.id }))
        : usedBy,
      registry: safeRegistry,
    }, 'UPI checked');
  })
);

/**
 * @route GET /api/land/farms/:farmId
 * @desc  Land / parcel details of a farm
 * @access Admin, Agent, Farmer (own)
 */
router.get(
  '/farms/:farmId',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const farm = await loadFarm(req, res);
    if (!farm) return;
    return sendSuccess(res, landView(farm), 'Farm land details');
  })
);

/**
 * @route PUT /api/land/farms/:farmId
 * @desc  Set a farm's UPI, GPS point and/or parcel boundary (drawn on the map).
 *        Area is computed from the boundary when not given. Changing land data
 *        clears the verification stamp.
 *        Body: { upi?, latitude?, longitude?, parcel_boundary?: GeoJSON Polygon|null,
 *                parcel_area_sqm?, land_use?, land_tenure? }
 * @access Admin, Agent, Farmer (own)
 */
router.put(
  '/farms/:farmId',
  authenticate,
  authorize('admin', 'agent', 'farmer'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const farm = await loadFarm(req, res);
    if (!farm) return;
    const b = req.body || {};
    const data: Prisma.FarmUpdateInput = {};
    const warnings: string[] = [];

    if (b.upi !== undefined) {
      if (b.upi === null || b.upi === '') {
        data.upi = null;
      } else {
        const parsed = parseUpi(String(b.upi));
        if (!parsed) return sendError(res, 'Invalid UPI. Expected province/district/sector/cell/parcel, e.g. 5/01/02/03/1234', 400);
        const clash = await prisma.farm.findFirst({ where: { upi: parsed.normalized, id: { not: farm.id }, archived_at: null }, select: { id: true } });
        if (clash) return sendError(res, 'This UPI is already registered to another farm', 409);
        data.upi = parsed.normalized;
        const farmDistrict = canonicalDistrict((farm.location as any)?.district)?.name;
        if (farmDistrict && parsed.district && farmDistrict !== parsed.district) {
          warnings.push(`The UPI is in ${parsed.district} but the farm is recorded in ${farmDistrict}`);
        }
      }
    }

    if (b.latitude !== undefined || b.longitude !== undefined) {
      if (b.latitude === null && b.longitude === null) {
        data.latitude = null;
        data.longitude = null;
      } else {
        const lat = Number(b.latitude);
        const lng = Number(b.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inRwanda(lat, lng)) {
          return sendError(res, 'latitude/longitude must be a point inside Rwanda', 400);
        }
        data.latitude = lat;
        data.longitude = lng;
      }
    }

    if (b.parcel_boundary !== undefined) {
      const [polygon, err] = validatePolygon(b.parcel_boundary);
      if (err) return sendError(res, err, 400);
      data.parcel_boundary = polygon === null ? Prisma.DbNull : (polygon as unknown as Prisma.InputJsonValue);
      if (polygon) {
        const area = ringAreaSqm(polygon.coordinates[0]);
        if (area > MAX_PARCEL_HA * 10000) {
          return sendError(res, `The boundary covers ${Math.round(area / 10000).toLocaleString()} ha — too large for one farm (max ${MAX_PARCEL_HA} ha). Zoom in and draw around the field.`, 400);
        }
        if (area < 10) return sendError(res, 'The boundary is too small — check the corners', 400);
        if (b.parcel_area_sqm === undefined) data.parcel_area_sqm = Math.round(area);
        if (data.latitude === undefined && farm.latitude === null) {
          const c = ringCentroid(polygon.coordinates[0]);
          data.latitude = c.lat;
          data.longitude = c.lng;
        }
      }
      data.land_source = polygon ? 'map' : farm.land_source;
    }

    if (b.parcel_area_sqm !== undefined) {
      if (b.parcel_area_sqm === null) data.parcel_area_sqm = null;
      else {
        const a = Number(b.parcel_area_sqm);
        if (!Number.isFinite(a) || a <= 0) return sendError(res, 'parcel_area_sqm must be a positive number', 400);
        data.parcel_area_sqm = a;
      }
    }
    for (const k of ['land_use', 'land_tenure'] as const) {
      if (b[k] !== undefined) data[k] = b[k] === null ? null : String(b[k]).trim().slice(0, 100);
    }

    if (Object.keys(data).length === 0) return sendError(res, 'Nothing to update', 400);
    if (!data.land_source && (data.upi !== undefined || data.parcel_area_sqm !== undefined)) data.land_source = 'manual';
    // An agent's verification stamp only stands for the land it checked: drop
    // it when the UPI, GPS point or boundary really changes, not on every save.
    const newBoundary = data.parcel_boundary === Prisma.DbNull ? null : data.parcel_boundary;
    const landChanged =
      (data.upi !== undefined && data.upi !== farm.upi) ||
      (data.latitude !== undefined && data.latitude !== farm.latitude) ||
      (data.longitude !== undefined && data.longitude !== farm.longitude) ||
      (data.parcel_boundary !== undefined && JSON.stringify(newBoundary ?? null) !== JSON.stringify(farm.parcel_boundary ?? null));
    if (landChanged) data.land_verified_at = null;

    const updated = await prisma.farm.update({ where: { id: farm.id }, data });
    return sendSuccess(res, { ...landView(updated), warnings }, 'Land details saved');
  })
);

/**
 * @route POST /api/land/farms/:farmId/verify
 * @desc  Agent/admin confirms the land details after a field visit. If the
 *        registry connector is configured and the farm has a UPI, missing
 *        area/land-use/boundary are filled from the registry.
 * @access Admin, Agent
 */
router.post(
  '/farms/:farmId/verify',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const farm = await loadFarm(req, res);
    if (!farm) return;
    if (!farm.upi && !farm.parcel_boundary && farm.latitude === null) {
      return sendError(res, 'Add a UPI, GPS point or boundary before verifying', 400);
    }
    const data: Prisma.FarmUpdateInput = { land_verified_at: new Date() };
    let registry: any = { status: 'disabled' };
    if (farm.upi) {
      registry = await lookupParcel(farm.upi);
      if (registry.status === 'found') {
        const p = registry.parcel;
        if (!farm.parcel_area_sqm && p.area_sqm) data.parcel_area_sqm = p.area_sqm;
        if (!farm.land_use && p.land_use) data.land_use = p.land_use;
        if (!farm.land_tenure && p.tenure) data.land_tenure = p.tenure;
        if (!farm.parcel_boundary && p.geometry) data.parcel_boundary = p.geometry;
        data.land_source = 'registry';
      } else if (registry.status === 'not_found') {
        return sendError(res, 'The land registry has no parcel with this UPI', 422);
      }
    }
    const updated = await prisma.farm.update({ where: { id: farm.id }, data });
    return sendSuccess(res, { ...landView(updated), registry_status: registry.status }, 'Land details verified');
  })
);

export default router;
