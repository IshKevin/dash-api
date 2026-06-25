import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize, adminOnly } from '../middleware/auth';
import { sendSuccess, sendError, sendNotFound, sendPaginatedResponse } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import QRCode from 'qrcode';
import { generateAccessKey, generateQRToken, isValidAccessKeyFormat } from '../utils/accessKey';
import multer from 'multer';
import * as XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import logger from '../config/logger';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * @route   GET /api/profile-access/qr/:userId
 * @desc    Generate QR code for a user (token-based scan QR)
 * @access  Private (Agent/Admin)
 */
router.get('/qr/:userId', authenticate, authorize('agent', 'admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    sendError(res, 'User not found', 404);
    return;
  }

  // Ensure a QR token exists — create one if missing
  let qrToken = user.qr_code_token;
  if (!qrToken) {
    qrToken = generateQRToken();
    await prisma.user.update({
      where: { id: userId },
      data:  { qr_code_token: qrToken },
    });
  }

  const qrImage = await QRCode.toDataURL(qrToken);

  sendSuccess(res, {
    userId:        user.id,
    qr_code_token: qrToken,
    qr_image:      qrImage,
  }, 'QR Code generated successfully');
}));

/**
 * @route   GET /api/profile-access/scan/:token
 * @desc    Get user info by scanning QR token
 * @access  Public
 */
router.get('/scan/:token', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { token } = req.params;

  const user = await prisma.user.findUnique({
    where: { qr_code_token: token },
    select: {
      id:            true,
      email:         true,
      full_name:     true,
      phone:         true,
      role:          true,
      status:        true,
      profile:       true,
      qr_code_token: true,
      created_at:    true,
      updated_at:    true,
      farmer_profile: true,
      agent_profile:  true,
    },
  });

  if (!user) {
    sendError(res, 'Invalid QR code or user not found', 404);
    return;
  }

  await prisma.qRActivity.create({
    data: { user_id: user.id, action: 'scanned', scanned_by: (req as any).user?.id || null, ip_address: req.ip }
  });

  // Surface the appropriate profile record
  let profile: unknown = user.profile; // fallback: embedded JSON profile
  if (user.role === 'farmer' && user.farmer_profile) {
    profile = user.farmer_profile;
  } else if (user.role === 'agent' && user.agent_profile) {
    profile = user.agent_profile;
  }

  const { farmer_profile: _fp, agent_profile: _ap, ...userWithoutRelations } = user;

  sendSuccess(res, { user: userWithoutRelations, profile }, 'User profile found');
}));

/**
 * @route   PUT /api/profile-access/scan/:token
 * @desc    Update user info by scanning QR token
 * @access  Private (Agent/Admin)
 */
router.put('/scan/:token', authenticate, authorize('agent', 'admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { token }    = req.params;
  const updateData   = req.body;

  const user = await prisma.user.findUnique({ where: { qr_code_token: token } });
  if (!user) {
    sendError(res, 'Invalid QR code or user not found', 404);
    return;
  }

  // Update basic user fields
  const userUpdate: Record<string, unknown> = {};
  if (updateData.full_name) userUpdate.full_name = updateData.full_name;
  if (updateData.phone)     userUpdate.phone     = updateData.phone;
  if (updateData.email)     userUpdate.email     = updateData.email;

  if (Object.keys(userUpdate).length > 0) {
    await prisma.user.update({ where: { id: user.id }, data: userUpdate });
  }

  // Upsert farmer profile if applicable
  if (user.role === 'farmer' && updateData.profile) {
    await prisma.farmerProfile.upsert({
      where:  { user_id: user.id },
      update: updateData.profile,
      create: { user_id: user.id, ...updateData.profile },
    });
  }

  sendSuccess(res, { userId: user.id }, 'User updated successfully');
}));

/**
 * @route   POST /api/profile-access/bulk-import
 * @desc    Import users from Excel/JSON and generate access keys
 * @access  Private (Admin)
 */
router.post('/bulk-import', authenticate, authorize('admin'), upload.single('file'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  let userData: any[] = [];

  if (req.file) {
    const workbook  = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      sendError(res, 'The uploaded Excel file contains no sheets.', 400);
      return;
    }
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      sendError(res, 'Could not find the first sheet in the Excel file.', 400);
      return;
    }
    userData = XLSX.utils.sheet_to_json(sheet);
  } else if (req.body.users && Array.isArray(req.body.users)) {
    userData = req.body.users;
  } else {
    sendError(res, 'No file uploaded or users data provided', 400);
    return;
  }

  const result = {
    total:       userData.length,
    imported:    0,
    failed:      0,
    errors:      [] as any[],
    access_keys: [] as any[],
  };

  logger.info(`Starting bulk import of ${userData.length} records`);

  for (const row of userData) {
    try {
      if (!row.full_name) {
        result.failed++;
        result.errors.push({ row, error: 'Missing full_name' });
        continue;
      }

      const email = row.email?.trim()
        || `user_${Date.now()}_${Math.random().toString(36).substring(7)}@temp.local`;

      // Check for duplicate email
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        result.failed++;
        result.errors.push({ email, error: 'User already exists' });
        continue;
      }

      // Hash a temporary password
      const tempPassword   = `temp_${Math.random().toString(36).substring(7)}`;
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // Build embedded profile JSON (matches User.profile Json field)
      const profileJson: Record<string, unknown> = {
        age:             row.age,
        gender:          row.gender,
        marital_status:  row.marital_status,
        education_level: row.education_level,
        province:        row.province,
        district:        row.district,
        sector:          row.sector,
        cell:            row.cell,
        village:         row.village,
        service_areas:   row.service_areas
          ? row.service_areas.split(',').map((s: string) => s.trim())
          : [],
      };

      if (row.farm_size) {
        profileJson.farm_details = {
          farm_location: {
            province: row.province,
            district: row.district,
            sector:   row.sector,
            cell:     row.cell,
            village:  row.village,
          },
          farm_age:         row.farm_age,
          planted:          row.planted,
          avocado_type:     row.avocado_type,
          mixed_percentage: row.mixed_percentage,
          farm_size:        row.farm_size,
          tree_count:       row.tree_count,
          upi_number:       row.upi_number,
          assistance:       row.assistance,
        };
      }

      const newUser = await prisma.user.create({
        data: {
          full_name:     row.full_name,
          email,
          phone:         row.phone ?? null,
          password:      hashedPassword,
          role:          row.role ?? 'farmer',
          status:        'active',
          qr_code_token: generateQRToken(),
          profile:       profileJson as any,
        },
      });

      // Generate access key (30-day expiry)
      const accessKeyValue = generateAccessKey();
      const expiresAt      = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await prisma.accessKey.create({
        data: {
          user_id:    newUser.id,
          access_key: accessKeyValue,
          expires_at: expiresAt,
        },
      });

      result.imported++;
      result.access_keys.push({
        user_id:    newUser.id,
        full_name:  newUser.full_name,
        email:      newUser.email,
        access_key: accessKeyValue,
        qr_token:   newUser.qr_code_token,
      });

    } catch (err: any) {
      result.failed++;
      result.errors.push({ row, error: err.message });
    }
  }

  sendSuccess(res, result, 'Bulk import completed');
}));

/**
 * @route   POST /api/profile-access/verify-access-key
 * @desc    Verify access key and return user info for profile editing
 * @access  Public
 */
router.post('/verify-access-key', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { access_key } = req.body;

  if (!access_key || !isValidAccessKeyFormat(access_key)) {
    sendError(res, 'Invalid access key format', 400);
    return;
  }

  const accessKeyDoc = await prisma.accessKey.findUnique({
    where:   { access_key },
    include: { user: true },
  });

  if (
    !accessKeyDoc ||
    accessKeyDoc.is_used ||
    accessKeyDoc.expires_at <= new Date()
  ) {
    sendError(res, 'Invalid or expired access key', 404);
    return;
  }

  const { user } = accessKeyDoc;

  sendSuccess(res, {
    user: {
      id:        user.id,
      full_name: user.full_name,
      email:     user.email,
      phone:     user.phone,
      role:      user.role,
      profile:   user.profile,
    },
    access_key_id: accessKeyDoc.id,
  }, 'Access key verified successfully');
}));

/**
 * @route   PUT /api/profile-access/update-profile
 * @desc    Update user profile using an access key (one-time use)
 * @access  Public (with valid access key)
 */
router.put('/update-profile', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { access_key, profile_data } = req.body;

  if (!access_key || !isValidAccessKeyFormat(access_key)) {
    sendError(res, 'Invalid access key format', 400);
    return;
  }

  const accessKeyDoc = await prisma.accessKey.findUnique({ where: { access_key } });

  if (
    !accessKeyDoc ||
    accessKeyDoc.is_used ||
    accessKeyDoc.expires_at <= new Date()
  ) {
    sendError(res, 'Invalid or expired access key', 404);
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: accessKeyDoc.user_id } });
  if (!user) {
    sendError(res, 'User not found', 404);
    return;
  }

  // Build user-level update
  const userUpdate: Record<string, unknown> = {};
  if (profile_data.full_name) userUpdate.full_name = profile_data.full_name;
  if (profile_data.phone)     userUpdate.phone     = profile_data.phone;
  if (profile_data.email)     userUpdate.email     = profile_data.email;

  // Merge embedded profile JSON
  if (profile_data.profile) {
    const current = (user.profile && typeof user.profile === 'object' && !Array.isArray(user.profile))
      ? user.profile as Record<string, unknown>
      : {};
    userUpdate.profile = { ...current, ...profile_data.profile };
  }

  // Update user and mark access key used in a transaction
  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: userUpdate }),
    prisma.accessKey.update({ where: { id: accessKeyDoc.id }, data: { is_used: true } }),
  ]);

  // Return a safe public projection
  const publicUser = {
    id:        updatedUser.id,
    full_name: updatedUser.full_name,
    email:     updatedUser.email,
    phone:     updatedUser.phone,
    role:      updatedUser.role,
    status:    updatedUser.status,
    profile:   updatedUser.profile,
    created_at: updatedUser.created_at,
    updated_at: updatedUser.updated_at,
  };

  sendSuccess(res, { user: publicUser }, 'Profile updated successfully');
}));

/**
 * @route   GET /api/profile-access/generate-qr/:userId
 * @desc    Generate QR code containing a fresh access key for a user
 * @access  Private (Agent/Admin)
 */
router.get('/generate-qr/:userId', authenticate, authorize('agent', 'admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    sendError(res, 'User not found', 404);
    return;
  }

  const accessKeyValue = generateAccessKey();
  const expiresAt      = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry for QR codes

  await prisma.accessKey.create({
    data: {
      user_id:    user.id,
      access_key: accessKeyValue,
      expires_at: expiresAt,
    },
  });

  const qrData  = JSON.stringify({
    access_key: accessKeyValue,
    user_name:  user.full_name,
    expires_at: expiresAt.toISOString(),
  });

  const qrImage = await QRCode.toDataURL(qrData);

  sendSuccess(res, {
    user_id:    user.id,
    user_name:  user.full_name,
    access_key: accessKeyValue,
    qr_image:   qrImage,
    expires_at: expiresAt,
  }, 'QR Code generated successfully');
}));

// POST /api/profile-access/regenerate/:userId  (authenticate, authorize admin/agent)
router.post('/regenerate/:userId', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.params;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) { sendNotFound(res, 'User not found'); return; }

  // Generate new QR token
  const newToken = require('crypto').randomBytes(20).toString('hex');
  await prisma.user.update({ where: { id: userId }, data: { qr_code_token: newToken } });

  await prisma.qRActivity.create({
    data: { user_id: userId, action: 'regenerated', scanned_by: req.user!.id, ip_address: req.ip || '' }
  });

  sendSuccess(res, { qr_code_token: newToken }, 'QR code regenerated successfully');
}));

// DELETE /api/profile-access/expire/:userId  (authenticate, adminOnly)
router.delete('/expire/:userId', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.params;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) { sendNotFound(res, 'User not found'); return; }

  await prisma.user.update({ where: { id: userId }, data: { qr_code_token: null } });

  await prisma.qRActivity.create({
    data: { user_id: userId, action: 'expired', scanned_by: req.user!.id, ip_address: req.ip || '' }
  });

  sendSuccess(res, null, 'QR code expired successfully');
}));

// GET /api/profile-access/activity/:userId  (authenticate, authorize admin/agent)
router.get('/activity/:userId', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const [activities, total] = await Promise.all([
    prisma.qRActivity.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.qRActivity.count({ where: { user_id: userId } }),
  ]);

  sendPaginatedResponse(res, activities, total, page, limit, 'QR activity retrieved');
}));

export default router;
