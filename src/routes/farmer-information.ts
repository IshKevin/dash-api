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

  const profileWhere: any = {};
  if (req.query.province) profileWhere.province = req.query.province as string;
  if (req.query.district) profileWhere.district = req.query.district as string;
  if (req.query.verification_status) profileWhere.verification_status = req.query.verification_status as string;

  if (req.query.search) {
    const s = req.query.search as string;
    profileWhere.OR = [
      { id_number: { contains: s, mode: 'insensitive' } },
      { user: { full_name: { contains: s, mode: 'insensitive' } } },
    ];
  }

  const userWhere: any = { role: 'farmer' };
  if (req.query.status) userWhere.status = req.query.status as any;
  profileWhere.user = { ...profileWhere.user, ...userWhere };

  const [profiles, total] = await Promise.all([
    prisma.farmerProfile.findMany({
      where: profileWhere,
      include: {
        user: {
          select: { id: true, email: true, full_name: true, phone: true, role: true, status: true, created_at: true },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.farmerProfile.count({ where: profileWhere }),
  ]);

  const data = profiles.map(profile => {
    const { user, ...profileData } = profile as any;
    return formatFarmerResponse(user, profileData);
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

  const { password: _pw1, ...userWithoutPassword } = user as any;
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
    include: {
      farmer_profile: {
        select: {
          id: true, user_id: true, age: true, id_number: true, gender: true,
          marital_status: true, education_level: true, province: true, district: true,
          sector: true, cell: true, village: true, farm_age: true, planted: true,
          avocado_type: true, mixed_percentage: true, farm_size: true, tree_count: true,
          upi_number: true, farm_province: true, farm_district: true, farm_sector: true,
          farm_cell: true, farm_village: true, assistance: true, image: true,
          verification_status: true, created_at: true, updated_at: true,
        },
      },
    },
  });

  if (!user || user.role !== 'farmer') {
    sendNotFound(res, 'Farmer not found');
    return;
  }

  const { password: _pw2, ...userWithoutPassword } = user as any;
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

// PUT /api/farmer-information/:id/verify
router.put('/:id/verify', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { verification_status } = req.body;

  if (!verification_status || !['verified', 'rejected'].includes(verification_status)) {
    sendError(res, 'verification_status must be "verified" or "rejected"', 400);
    return;
  }

  const existing = await prisma.farmerProfile.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendNotFound(res, 'Farmer profile not found');
    return;
  }

  const updated = await prisma.farmerProfile.update({
    where: { id: req.params.id },
    data: { verification_status },
  });

  sendSuccess(res, updated, `Farmer profile ${verification_status} successfully`);
}));

export default router;
