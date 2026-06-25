import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, adminOnly } from '../middleware/auth';
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

export default router;
