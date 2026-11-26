import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, adminOnly, authorize } from '../middleware/auth';
import { farmerScope } from '../utils/agentScope';
import { boundaries, locate, divisions, sameArea, ADMIN_LEVELS, AdminLevel, BOUNDARY_ATTRIBUTION } from '../services/rwandaBoundaries';
import { sendSuccess, sendCreated, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// GET /api/geography/provinces (public)
router.get('/provinces', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const provinces = await prisma.province.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { districts: true } } },
  });
  sendSuccess(res, provinces, 'Provinces retrieved successfully');
}));

// POST /api/geography/provinces (admin only)
router.post('/provinces', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name, code } = req.body;

  if (!name) {
    sendError(res, 'Province name is required', 400);
    return;
  }

  const existing = await prisma.province.findFirst({ where: { name } });
  if (existing) {
    sendError(res, 'Province with this name already exists', 409);
    return;
  }

  const province = await prisma.province.create({
    data: { name, ...(code ? { code } : {}) },
  });

  sendCreated(res, province, 'Province created successfully');
}));

// PUT /api/geography/provinces/:id (admin only)
router.put('/provinces/:id', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, code } = req.body;

  const updateData: { name?: string; code?: string } = {};
  if (name !== undefined) updateData.name = name;
  if (code !== undefined) updateData.code = code;

  const province = await prisma.province.update({
    where: { id },
    data: updateData,
  }).catch(() => null);

  if (!province) {
    sendNotFound(res, 'Province not found');
    return;
  }

  sendSuccess(res, province, 'Province updated successfully');
}));

// DELETE /api/geography/provinces/:id (admin only)
router.delete('/provinces/:id', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const province = await prisma.province.findUnique({
    where: { id },
    include: { _count: { select: { districts: true } } },
  });

  if (!province) {
    sendNotFound(res, 'Province not found');
    return;
  }

  if (province._count.districts > 0) {
    sendError(res, 'Cannot delete province with existing districts', 400);
    return;
  }

  await prisma.province.delete({ where: { id } });

  sendSuccess(res, { id }, 'Province deleted successfully');
}));

// GET /api/geography/provinces/:provinceId/districts (public)
router.get('/provinces/:provinceId/districts', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { provinceId } = req.params;

  const province = await prisma.province.findUnique({ where: { id: provinceId } });
  if (!province) {
    sendNotFound(res, 'Province not found');
    return;
  }

  const districts = await prisma.district.findMany({
    where: { province_id: provinceId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { sectors: true } } },
  });

  sendSuccess(res, districts, 'Districts retrieved successfully');
}));

// POST /api/geography/districts (admin only)
router.post('/districts', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name, province_id, code } = req.body;

  if (!name || !province_id) {
    sendError(res, 'District name and province_id are required', 400);
    return;
  }

  const existing = await prisma.district.findFirst({ where: { name, province_id } });
  if (existing) {
    sendError(res, 'District with this name already exists in the province', 409);
    return;
  }

  const district = await prisma.district.create({
    data: { name, province_id, ...(code ? { code } : {}) },
  });

  sendCreated(res, district, 'District created successfully');
}));

// PUT /api/geography/districts/:id (admin only)
router.put('/districts/:id', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, code } = req.body;

  const updateData: { name?: string; code?: string } = {};
  if (name !== undefined) updateData.name = name;
  if (code !== undefined) updateData.code = code;

  const district = await prisma.district.update({
    where: { id },
    data: updateData,
  }).catch(() => null);

  if (!district) {
    sendNotFound(res, 'District not found');
    return;
  }

  sendSuccess(res, district, 'District updated successfully');
}));


// ── Edit/delete for districts, sectors, cells, villages (admin) ─────────────
// Deleting is refused while the unit still has children, like provinces.
type Level = { model: 'district' | 'sector' | 'cell' | 'village'; label: string; child?: 'sectors' | 'cells' | 'villages'; editCode: boolean };
const LEVELS: Record<string, Level> = {
  districts: { model: 'district', label: 'District', child: 'sectors', editCode: true },
  sectors: { model: 'sector', label: 'Sector', child: 'cells', editCode: false },
  cells: { model: 'cell', label: 'Cell', child: 'villages', editCode: false },
  villages: { model: 'village', label: 'Village', editCode: false },
};

for (const [path, level] of Object.entries(LEVELS)) {
  const delegate = () => (prisma as any)[level.model];

  if (path !== 'districts') {
    router.put(`/${path}/:id`, authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      if (!name) { sendError(res, 'name is required', 400); return; }
      const existing = await delegate().findUnique({ where: { id: req.params.id } });
      if (!existing) { sendNotFound(res, `${level.label} not found`); return; }
      const updated = await delegate().update({ where: { id: req.params.id }, data: { name } });
      sendSuccess(res, updated, `${level.label} updated successfully`);
    }));
  }

  router.delete(`/${path}/:id`, authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const existing = await delegate().findUnique({
      where: { id: req.params.id },
      ...(level.child ? { include: { _count: { select: { [level.child]: true } } } } : {}),
    });
    if (!existing) { sendNotFound(res, `${level.label} not found`); return; }
    if (level.child && existing._count[level.child] > 0) {
      sendError(res, `Cannot delete ${level.label.toLowerCase()} with existing ${level.child}`, 400);
      return;
    }
    await delegate().delete({ where: { id: req.params.id } });
    sendSuccess(res, null, `${level.label} deleted successfully`);
  }));
}

// GET /api/geography/districts/:districtId/sectors (public)
router.get('/districts/:districtId/sectors', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { districtId } = req.params;

  const district = await prisma.district.findUnique({ where: { id: districtId } });
  if (!district) {
    sendNotFound(res, 'District not found');
    return;
  }

  const sectors = await prisma.sector.findMany({
    where: { district_id: districtId },
    orderBy: { name: 'asc' },
  });

  sendSuccess(res, sectors, 'Sectors retrieved successfully');
}));

// POST /api/geography/sectors (admin only)
router.post('/sectors', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name, district_id } = req.body;

  if (!name || !district_id) {
    sendError(res, 'Sector name and district_id are required', 400);
    return;
  }

  const existing = await prisma.sector.findFirst({ where: { name, district_id } });
  if (existing) {
    sendError(res, 'Sector with this name already exists in the district', 409);
    return;
  }

  const sector = await prisma.sector.create({
    data: { name, district_id },
  });

  sendCreated(res, sector, 'Sector created successfully');
}));

// GET /api/geography/sectors/:sectorId/cells (public)
router.get('/sectors/:sectorId/cells', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sectorId } = req.params;

  const sector = await prisma.sector.findUnique({ where: { id: sectorId } });
  if (!sector) {
    sendNotFound(res, 'Sector not found');
    return;
  }

  const cells = await prisma.cell.findMany({
    where: { sector_id: sectorId },
    orderBy: { name: 'asc' },
  });

  sendSuccess(res, cells, 'Cells retrieved successfully');
}));

// POST /api/geography/cells (admin only)
router.post('/cells', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name, sector_id } = req.body;

  if (!name || !sector_id) {
    sendError(res, 'Cell name and sector_id are required', 400);
    return;
  }

  const existing = await prisma.cell.findFirst({ where: { name, sector_id } });
  if (existing) {
    sendError(res, 'Cell with this name already exists in the sector', 409);
    return;
  }

  const cell = await prisma.cell.create({
    data: { name, sector_id },
  });

  sendCreated(res, cell, 'Cell created successfully');
}));

// GET /api/geography/cells/:cellId/villages (public)
router.get('/cells/:cellId/villages', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { cellId } = req.params;

  const cell = await prisma.cell.findUnique({ where: { id: cellId } });
  if (!cell) {
    sendNotFound(res, 'Cell not found');
    return;
  }

  const villages = await prisma.village.findMany({
    where: { cell_id: cellId },
    orderBy: { name: 'asc' },
  });

  sendSuccess(res, villages, 'Villages retrieved successfully');
}));

// POST /api/geography/villages (admin only)
router.post('/villages', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name, cell_id } = req.body;

  if (!name || !cell_id) {
    sendError(res, 'Village name and cell_id are required', 400);
    return;
  }

  const existing = await prisma.village.findFirst({ where: { name, cell_id } });
  if (existing) {
    sendError(res, 'Village with this name already exists in the cell', 409);
    return;
  }

  const village = await prisma.village.create({
    data: { name, cell_id },
  });

  sendCreated(res, village, 'Village created successfully');
}));

// GET /api/geography/full (authenticate)
router.get('/full', authenticate, asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const provinces = await prisma.province.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      districts: {
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          sectors: {
            orderBy: { name: 'asc' },
            select: {
              id: true,
              name: true,
              cells: {
                orderBy: { name: 'asc' },
                select: {
                  id: true,
                  name: true,
                  villages: {
                    orderBy: { name: 'asc' },
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  sendSuccess(res, provinces, 'Full geography hierarchy retrieved successfully');
}));

// ── Official divisions, boundaries and per-area statistics ───────────────────

/**
 * @route POST /api/geography/sync
 * @desc  Fill the province → village tables with Rwanda's official divisions
 *        (5 / 30 / 416 / 2,148 / 14,837). Idempotent: existing rows are kept,
 *        missing ones added.
 * @access Admin
 */
router.post('/sync', authenticate, adminOnly, asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const data = divisions();
  const before = await Promise.all([prisma.province.count(), prisma.district.count(), prisma.sector.count(), prisma.cell.count(), prisma.village.count()]);
  await prisma.province.createMany({ data: data.map((p) => ({ name: p.name })), skipDuplicates: true });
  const provinces = new Map((await prisma.province.findMany()).map((p) => [p.name, p.id]));
  await prisma.district.createMany({
    data: data.flatMap((p) => p.districts.map((d) => ({ name: d.name, province_id: provinces.get(p.name)! }))),
    skipDuplicates: true,
  });
  const districts = new Map((await prisma.district.findMany()).map((d) => [`${d.province_id}|${d.name}`, d.id]));
  const districtId = (p: string, d: string) => districts.get(`${provinces.get(p)}|${d}`)!;
  await prisma.sector.createMany({
    data: data.flatMap((p) => p.districts.flatMap((d) => d.sectors.map((s) => ({ name: s.name, district_id: districtId(p.name, d.name) })))),
    skipDuplicates: true,
  });
  const sectors = new Map((await prisma.sector.findMany()).map((s) => [`${s.district_id}|${s.name}`, s.id]));
  const sectorId = (p: string, d: string, s: string) => sectors.get(`${districtId(p, d)}|${s}`)!;
  await prisma.cell.createMany({
    data: data.flatMap((p) => p.districts.flatMap((d) => d.sectors.flatMap((s) => s.cells.map((c) => ({ name: c.name, sector_id: sectorId(p.name, d.name, s.name) }))))),
    skipDuplicates: true,
  });
  const cells = new Map((await prisma.cell.findMany()).map((c) => [`${c.sector_id}|${c.name}`, c.id]));
  const villages = data.flatMap((p) => p.districts.flatMap((d) => d.sectors.flatMap((s) => s.cells.flatMap((c) => {
    const cell_id = cells.get(`${sectorId(p.name, d.name, s.name)}|${c.name}`)!;
    return [...new Set(c.villages)].map((v) => ({ name: v, cell_id }));
  }))));
  for (let i = 0; i < villages.length; i += 5000) {
    await prisma.village.createMany({ data: villages.slice(i, i + 5000), skipDuplicates: true });
  }
  const after = await Promise.all([prisma.province.count(), prisma.district.count(), prisma.sector.count(), prisma.cell.count(), prisma.village.count()]);
  const names = ['provinces', 'districts', 'sectors', 'cells', 'villages'];
  sendSuccess(
    res,
    Object.fromEntries(names.map((n, i) => [n, { total: after[i], added: after[i] - before[i] }])),
    `Official divisions loaded: ${after.map((n, i) => `${n} ${names[i]}`).join(', ')}`
  );
}));

/**
 * @route GET /api/geography/boundaries/:level?district=&sector=
 * @desc  GeoJSON boundaries: province | district | sector | cell. Sectors and
 *        cells can be limited to one district (and sector) to keep it small.
 *        Attribution required: geoBoundaries (CC BY 4.0).
 * @access Any authenticated user
 */
router.get('/boundaries/:level', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const level = req.params.level as AdminLevel;
  if (!ADMIN_LEVELS.includes(level)) return sendError(res, `level must be one of ${ADMIN_LEVELS.join(', ')}`, 400);
  const district = typeof req.query.district === 'string' ? req.query.district : undefined;
  const sector = typeof req.query.sector === 'string' ? req.query.sector : undefined;
  if (level === 'cell' && !district) return sendError(res, 'Cell boundaries need ?district= (there are 2,148 cells)', 400);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  return sendSuccess(res, boundaries(level, { district, sector }), 'Boundaries');
}));

/**
 * @route GET /api/geography/locate?lat=&lng=
 * @desc  Province, district, sector and cell of a GPS point
 * @access Any authenticated user
 */
router.get('/locate', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return sendError(res, 'lat and lng are required', 400);
  const area = locate(lat, lng);
  return sendSuccess(res, { ...area, inside_rwanda: Boolean(area.district) }, area.district ? 'Location found' : 'This point is not inside Rwanda');
}));

/**
 * @route GET /api/geography/stats?level=district|sector&district=
 * @desc  Farmers, farms, trees, hectares and mapping progress per district (or
 *        per sector of one district), plus farms whose GPS point lies outside
 *        the district/sector recorded for them. Agents see only their area.
 * @access Admin, Agent
 */
router.get('/stats', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const level = req.query.level === 'sector' ? 'sector' : 'district';
  const district = typeof req.query.district === 'string' ? req.query.district : undefined;
  if (level === 'sector' && !district) return sendError(res, 'level=sector needs ?district=', 400);
  const scope = await farmerScope(req);
  const farms = await prisma.farm.findMany({
    where: {
      archived_at: null,
      ...(scope ? { farmer: scope } : {}),
      ...(district ? { location: { path: ['district'], equals: district } } : {}),
    },
    select: { farmer_id: true, location: true, tree_count: true, farm_size: true, latitude: true, longitude: true, parcel_boundary: true, farmer: { select: { credentials_claimed: true } } },
  });
  type Row = { area: string; farmers: Set<string>; activated: Set<string>; farms: number; trees: number; hectares: number; on_map: number; with_boundary: number; gps_elsewhere: number };
  const rows = new Map<string, Row>();
  let unassigned = 0;
  for (const f of farms) {
    const loc = (f.location as any) || {};
    const area = level === 'district' ? loc.district : loc.sector;
    if (!area) { unassigned++; continue; }
    const r = rows.get(area) ?? { area, farmers: new Set(), activated: new Set(), farms: 0, trees: 0, hectares: 0, on_map: 0, with_boundary: 0, gps_elsewhere: 0 };
    r.farmers.add(f.farmer_id);
    if (f.farmer.credentials_claimed) r.activated.add(f.farmer_id);
    r.farms++;
    r.trees += f.tree_count || 0;
    r.hectares += f.farm_size || 0;
    if (f.parcel_boundary) r.with_boundary++;
    if (f.latitude !== null && f.longitude !== null) {
      r.on_map++;
      const at = locate(f.latitude, f.longitude);
      if (at.district && !sameArea(at[level], area)) r.gps_elsewhere++;
    }
    rows.set(area, r);
  }
  const items = [...rows.values()]
    .map((r) => ({ ...r, farmers: r.farmers.size, activated: r.activated.size, hectares: Math.round(r.hectares * 100) / 100 }))
    .sort((a, b) => b.farms - a.farms);
  return sendSuccess(res, { level, district: district ?? null, items, farms_without_area: unassigned, attribution: BOUNDARY_ATTRIBUTION }, 'Area statistics');
}));

export default router;
