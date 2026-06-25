import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { validateIdParam, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

function formatFarmerResponse(user: any, profile: any) {
  const userProfile = user.profile || {};
  return {
    farmer_id: user.id,
    user_info: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      status: user.status,
      created_at: user.created_at,
      updated_at: user.updated_at,
    },
    farmer_profile: profile || userProfile,
  };
}

// GET /api/farmer-information
router.get('/', authenticate, authorize('admin', 'agent'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const where: any = { role: 'farmer' };

  if (req.query.status) where.status = req.query.status as any;
  if (req.query.search) {
    const s = req.query.search as string;
    where.OR = [
      { full_name: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [farmers, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { farmer_profile: true },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  const data = farmers.map(farmer => {
    const { password, ...user } = farmer as any;
    return formatFarmerResponse(user, (farmer as any).farmer_profile);
  });

  sendPaginatedResponse(res, data, total, page, limit, 'Farmers retrieved successfully');
}));

// GET /api/farmer-information/me
router.get('/me', authenticate, authorize('farmer'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { farmer_profile: true },
  });

  if (!user) {
    sendNotFound(res, 'Farmer not found');
    return;
  }

  const { password, ...userWithoutPassword } = user as any;
  sendSuccess(res, formatFarmerResponse(userWithoutPassword, (user as any).farmer_profile), 'Farmer profile retrieved');
}));

// GET /api/farmer-information/:id
router.get('/:id', authenticate, authorize('admin', 'agent', 'farmer'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role === 'farmer' && req.user.id !== req.params.id) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { farmer_profile: true },
  });

  if (!user || user.role !== 'farmer') {
    sendNotFound(res, 'Farmer not found');
    return;
  }

  const { password, ...userWithoutPassword } = user as any;
  sendSuccess(res, formatFarmerResponse(userWithoutPassword, (user as any).farmer_profile), 'Farmer information retrieved');
}));

// POST /api/farmer-information (create/update profile)
router.post('/', authenticate, authorize('admin', 'agent', 'farmer'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const farmerId = req.user?.role === 'farmer'
    ? req.user.id
    : (req.body.farmer_id || req.user!.id);

  const farmer = await prisma.user.findUnique({ where: { id: farmerId } });
  if (!farmer || farmer.role !== 'farmer') {
    sendNotFound(res, 'Farmer not found');
    return;
  }

  const {
    age, id_number, gender, marital_status, education_level,
    province, district, sector, cell, village,
    farm_age, planted, avocado_type, mixed_percentage, farm_size, tree_count, upi_number,
    farm_province, farm_district, farm_sector, farm_cell, farm_village,
    assistance, image,
  } = req.body;

  const profile = await prisma.farmerProfile.upsert({
    where: { user_id: farmerId },
    create: {
      user_id: farmerId,
      age, id_number, gender, marital_status, education_level,
      province, district, sector, cell, village,
      farm_age, planted, avocado_type, mixed_percentage, farm_size, tree_count, upi_number,
      farm_province, farm_district, farm_sector, farm_cell, farm_village,
      assistance: assistance || [],
      image,
    },
    update: {
      age, id_number, gender, marital_status, education_level,
      province, district, sector, cell, village,
      farm_age, planted, avocado_type, mixed_percentage, farm_size, tree_count, upi_number,
      farm_province, farm_district, farm_sector, farm_cell, farm_village,
      assistance: assistance || [],
      image,
    },
  });

  sendCreated(res, profile, 'Farmer profile created/updated successfully');
}));

// PUT /api/farmer-information/:id
router.put('/:id', authenticate, authorize('admin', 'agent', 'farmer'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const farmerId = req.params.id;

  if (req.user?.role === 'farmer' && req.user.id !== farmerId) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const updateData = { ...req.body };
  delete updateData.farmer_id;
  delete updateData.user_id;

  const profile = await prisma.farmerProfile.upsert({
    where: { user_id: farmerId },
    create: { user_id: farmerId, ...updateData },
    update: updateData,
  });

  sendSuccess(res, profile, 'Farmer profile updated successfully');
}));

export default router;
