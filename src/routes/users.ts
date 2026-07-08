import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import {
  validateIdParam,
  validateUserProfileUpdate,
  validatePagination,
  validateFarmerProfile,
} from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize, adminOnly } from '../middleware/auth';
import { sendSuccess, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { env } from '../config/environment';
import { createFarmerProfileForUser, createAgentProfileForUser, createFarmForUser } from '../utils/profileCreation';

const router = Router();

const userSelect = {
  id: true, email: true, full_name: true, phone: true,
  role: true, status: true, profile: true,
  qr_code_token: true, created_at: true, updated_at: true,
};

// Farmer/agent detail fields live on the separate FarmerProfile/AgentProfile
// models, not on User.profile. Flatten the joined relation onto the user
// object so pages can read e.g. user.province directly.
function flattenProfile(user: any) {
  const { farmer_profile, agent_profile, ...rest } = user;
  const extra = farmer_profile || agent_profile;
  if (!extra) return rest;
  const { id: _id, user_id: _userId, user: _user, created_at: _createdAt, updated_at: _updatedAt, ...fields } = extra;
  return { ...rest, ...fields };
}

function buildSearchWhere(req: any, baseWhere: any = {}) {
  const where: any = { ...baseWhere };

  if (req.query.role) where.role = req.query.role;
  if (req.query.status) where.status = req.query.status;

  if (req.query.search) {
    const s = req.query.search as string;
    where.OR = [
      { full_name: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
    ];
  }

  return where;
}

// GET /api/users
router.get('/', authenticate, adminOnly, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const where = buildSearchWhere(req);

  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, select: userSelect, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.user.count({ where }),
  ]);

  sendPaginatedResponse(res, users, total, page, limit, 'Users retrieved successfully');
}));

// POST /api/users
router.post('/', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { full_name, email, phone, role } = req.body;

  if (!full_name || !email) {
    sendError(res, 'Full name and email are required', 400);
    return;
  }

  const allowedRoles = ['admin', 'agent', 'farmer', 'shop_manager'];
  const targetRole = role && allowedRoles.includes(role) ? role : 'shop_manager';

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    sendError(res, 'User with this email already exists', 400);
    return;
  }

  const defaultPassword = 'UserPass123!';
  const hashed = await bcrypt.hash(defaultPassword, env.BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: { email: email.toLowerCase(), password: hashed, full_name, phone, role: targetRole, status: 'active' },
    select: userSelect,
  });

  sendSuccess(res, { ...user, default_password: defaultPassword }, 'User created successfully');
}));

// GET /api/users/farmers
router.get('/farmers', authenticate, authorize('admin', 'agent'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const where = buildSearchWhere(req, { role: 'farmer' });

  const [farmers, total] = await Promise.all([
    prisma.user.findMany({ where, select: { ...userSelect, farmer_profile: true }, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.user.count({ where }),
  ]);

  sendPaginatedResponse(res, farmers.map(flattenProfile), total, page, limit, 'Farmers retrieved successfully');
}));

// POST /api/users/farmers
router.post('/farmers', authenticate, authorize('admin', 'agent'), validateFarmerProfile, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    full_name, email, age, phone, gender, marital_status, education_level,
    province, district, sector, cell, village,
    farm_province, farm_district, farm_sector, farm_cell, farm_village,
    farm_age, planted, avocado_type, mixed_percentage, farm_size, tree_count, upi_number, assistance,
  } = req.body;

  if (!full_name || !email || !gender) {
    sendError(res, 'Full name, email, and gender are required', 400);
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    sendError(res, 'User with this email already exists', 400);
    return;
  }

  const defaultPassword = 'FarmerPass123!';
  const hashed = await bcrypt.hash(defaultPassword, env.BCRYPT_ROUNDS);

  const farmer = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email: email.toLowerCase(), password: hashed, full_name, phone, role: 'farmer', status: 'active' },
      select: userSelect,
    });

    const farmerFields = {
      age, gender, marital_status, education_level,
      province, district, sector, cell, village,
      farm_age, planted, avocado_type, mixed_percentage, farm_size, tree_count, upi_number, assistance,
      farm_province, farm_district, farm_sector, farm_cell, farm_village,
    };

    await createFarmerProfileForUser(tx, created.id, farmerFields);
    await createFarmForUser(tx, created.id, full_name, farmerFields);

    return created;
  });

  sendSuccess(res, { ...farmer, default_password: defaultPassword }, 'Farmer created successfully');
}));

// GET /api/users/agents
router.get('/agents', authenticate, authorize('admin'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const where = buildSearchWhere(req, { role: 'agent' });

  const [agents, total] = await Promise.all([
    prisma.user.findMany({ where, select: { ...userSelect, agent_profile: true }, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.user.count({ where }),
  ]);

  sendPaginatedResponse(res, agents.map(flattenProfile), total, page, limit, 'Agents retrieved successfully');
}));

// POST /api/users/agents
router.post('/agents', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { full_name, email, phone, province, district, sector } = req.body;

  if (!full_name || !email) {
    sendError(res, 'Full name and email are required', 400);
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    sendError(res, 'User with this email already exists', 400);
    return;
  }

  const defaultPassword = 'AgentPass123!';
  const hashed = await bcrypt.hash(defaultPassword, env.BCRYPT_ROUNDS);

  const agent = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email: email.toLowerCase(), password: hashed, full_name, phone, role: 'agent', status: 'active' },
      select: userSelect,
    });

    await createAgentProfileForUser(tx, created.id, { province, district, sector });

    return created;
  });

  sendSuccess(res, { ...agent, default_password: defaultPassword }, 'Agent created successfully');
}));

// GET /api/users/shop-managers
router.get('/shop-managers', authenticate, authorize('admin'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const where = buildSearchWhere(req, { role: 'shop_manager' });

  const [managers, total] = await Promise.all([
    prisma.user.findMany({ where, select: userSelect, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.user.count({ where }),
  ]);

  sendPaginatedResponse(res, managers, total, page, limit, 'Shop managers retrieved successfully');
}));

// GET /api/users/me
router.get('/me', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user?.id }, select: userSelect });

  if (!user) {
    sendNotFound(res, 'User not found');
    return;
  }

  sendSuccess(res, user, 'Profile retrieved successfully');
}));

// PUT /api/users/me
router.put('/me', authenticate, validateFarmerProfile, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const updateData = req.body;

  delete updateData.role;
  delete updateData.status;
  delete updateData.password;
  delete updateData.email;

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { profile: true } });

  const data: any = {};
  if (updateData.full_name) data.full_name = updateData.full_name.trim();
  if (updateData.phone) data.phone = updateData.phone.trim();

  if (req.user?.role === 'farmer') {
    data.profile = {
      ...(existing?.profile as any || {}),
      age: updateData.age,
      gender: updateData.gender,
      marital_status: updateData.marital_status,
      education_level: updateData.education_level,
      id_number: updateData.id_number,
      province: updateData.province,
      district: updateData.district,
      sector: updateData.sector,
      cell: updateData.cell,
      village: updateData.village,
      farm_age: updateData.farm_age,
      planted: updateData.planted,
      avocado_type: updateData.avocado_type,
      mixed_percentage: updateData.mixed_percentage,
      farm_size: updateData.farm_size,
      tree_count: updateData.tree_count,
      upi_number: updateData.upi_number,
      assistance: updateData.assistance,
      farm_province: updateData.farm_province,
      farm_district: updateData.farm_district,
      farm_sector: updateData.farm_sector,
      farm_cell: updateData.farm_cell,
      farm_village: updateData.farm_village,
    };
  } else {
    if (updateData.profile) {
      data.profile = { ...(existing?.profile as any || {}), ...updateData.profile };
    }
  }

  const user = await prisma.user.update({ where: { id: userId }, data, select: userSelect });

  sendSuccess(res, user, 'Profile updated successfully');
}));

// GET /api/users/:id
router.get('/:id', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });

  if (!user) {
    sendNotFound(res, 'User not found');
    return;
  }

  sendSuccess(res, user, 'User retrieved successfully');
}));

// PUT /api/users/:id
router.put('/:id', authenticate, validateIdParam, validateUserProfileUpdate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.params.id;
  const updateData = req.body;

  if (req.user?.id !== userId && req.user?.role !== 'admin') {
    sendError(res, 'Access denied', 403);
    return;
  }

  if (req.user?.role !== 'admin') {
    delete updateData.role;
    delete updateData.status;
  }

  delete updateData.password;

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: userSelect,
  }).catch(() => null);

  if (!user) {
    sendNotFound(res, 'User not found');
    return;
  }

  sendSuccess(res, user, 'User updated successfully');
}));

// PUT /api/users/:id/status
router.put('/:id/status', authenticate, adminOnly, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.params.id;
  const { status } = req.body;

  if (!['active', 'inactive'].includes(status)) {
    sendError(res, 'Invalid status value', 400);
    return;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { status },
    select: userSelect,
  }).catch(() => null);

  if (!user) {
    sendNotFound(res, 'User not found');
    return;
  }

  sendSuccess(res, user, `User status updated to ${status}`);
}));

// PUT /api/users/:id/role
router.put('/:id/role', authenticate, adminOnly, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.params.id;
  const { role } = req.body;

  const validRoles = ['admin', 'agent', 'farmer', 'shop_manager'];
  if (!validRoles.includes(role)) {
    sendError(res, 'Invalid role value', 400);
    return;
  }

  if (role !== 'admin') {
    const existing = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (existing?.role === 'admin') {
      const adminCount = await prisma.user.count({ where: { role: 'admin', status: 'active' } });
      if (adminCount <= 1) {
        sendError(res, 'Cannot remove the last admin user', 400);
        return;
      }
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role: role as any },
    select: userSelect,
  }).catch(() => null);

  if (!user) {
    sendNotFound(res, 'User not found');
    return;
  }

  sendSuccess(res, user, `User role updated to ${role}`);
}));

// DELETE /api/users/:id
router.delete('/:id', authenticate, adminOnly, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.params.id;

  if (req.user?.id === userId) {
    sendError(res, 'Cannot delete your own account', 400);
    return;
  }

  const user = await prisma.user.delete({ where: { id: userId } }).catch(() => null);

  if (!user) {
    sendNotFound(res, 'User not found');
    return;
  }

  sendSuccess(res, null, 'User deleted successfully');
}));

export default router;
