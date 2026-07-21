import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma';
import { emailService } from '../services/emailService';
import { smsService } from '../services/smsService';
import { documentService } from '../services/documentService';
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { generateQRToken } from '../utils/accessKey';
import { putObject, PRIVATE_PREFIX } from '../config/minio';
import { sendSuccess, sendError, sendCreated } from '../utils/responses';
import { AuthResponse, LoginRequest, PasswordChangeRequest } from '../types/auth';
import {
  validateComprehensiveRegistration,
  validateVerifyPhone,
  validateUserLogin,
  validatePasswordChange,
} from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types/auth';
import { env } from '../config/environment';
import logger from '../config/logger';
import { createFarmerProfileForUser, createAgentProfileForUser, createShopForManager, createFarmForUser } from '../utils/profileCreation';

// Best-effort: generate a QR profile token plus downloadable profile-card and
// contract documents for a newly registered user, then email links to them.
// Registration itself has already succeeded by the time this runs — failures
// here are logged, not surfaced to the client.
async function generateAndEmailRegistrationDocuments(user: { id: string; email: string; full_name: string; role: string; phone?: string | null }): Promise<void> {
  try {
    const qrToken = generateQRToken();
    await prisma.user.update({ where: { id: user.id }, data: { qr_code_token: qrToken } });
    const qrDataUrl = await QRCode.toDataURL(qrToken);

    const profileCardBytes = await documentService.generateProfileCard(
      { id: user.id, full_name: user.full_name, email: user.email, phone: user.phone ?? null, role: user.role },
      qrDataUrl
    );
    const contractBytes = await documentService.generateContract({ full_name: user.full_name, email: user.email, role: user.role });

    const profileCardKey = `${PRIVATE_PREFIX}/profile-card-${user.id}-${Date.now()}.pdf`;
    const contractKey = `${PRIVATE_PREFIX}/contract-${user.id}-${Date.now()}.pdf`;

    await putObject(profileCardKey, profileCardBytes, 'application/pdf');
    await putObject(contractKey, contractBytes, 'application/pdf');

    const [profileCardDoc, contractDoc] = await Promise.all([
      prisma.document.create({
        data: { owner_id: user.id, type: 'profile_card', file_url: profileCardKey, file_key: profileCardKey, mimetype: 'application/pdf' },
      }),
      prisma.document.create({
        data: { owner_id: user.id, type: 'contract', file_url: contractKey, file_key: contractKey, mimetype: 'application/pdf' },
      }),
    ]);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    emailService.sendRegistrationDocuments(
      user.email,
      user.full_name,
      `${frontendUrl}/documents/${profileCardDoc.id}`,
      `${frontendUrl}/documents/${contractDoc.id}`
    );
    if (user.phone) {
      smsService.sendRegistrationDocumentsNotice(user.phone, user.full_name);
    }
  } catch (error) {
    logger.error(`Failed to generate registration documents for user ${user.id}: ${error}`);
  }
}

const router = Router();

// POST /api/auth/register
router.post('/register', validateComprehensiveRegistration, asyncHandler(async (req: Request, res: Response) => {
  const { email, password, full_name, phone, role, ...profileFields } = req.body;

  const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existingUser) {
    sendError(res, 'User with this email already exists', 409);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        full_name,
        phone,
        role: role as any,
        credentials_claimed: true,
      },
      select: { id: true, email: true, full_name: true, role: true, status: true },
    });

    if (role === 'farmer') {
      await createFarmerProfileForUser(tx, created.id, profileFields);
      await createFarmForUser(tx, created.id, full_name, profileFields);
    } else if (role === 'agent') {
      await createAgentProfileForUser(tx, created.id, profileFields);
    } else if (role === 'shop_manager') {
      await createShopForManager(
        tx,
        created.id,
        { ownerName: full_name, ownerEmail: created.email, ownerPhone: phone },
        {
          shopName: profileFields.shopName,
          description: profileFields.description,
          province: profileFields.province,
          district: profileFields.district,
        }
      );
    }

    return created;
  });

  const token = generateToken({ id: user.id, email: user.email, role: user.role as any });
  const refreshToken = generateRefreshToken({ id: user.id, email: user.email, role: user.role as any });

  const responseData: AuthResponse = {
    token,
    refreshToken,
    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role as any, status: user.status },
  };

  await generateAndEmailRegistrationDocuments({ id: user.id, email: user.email, full_name: user.full_name, role: user.role, phone });

  sendCreated(res, responseData, 'User registered successfully');
}));

// POST /api/auth/verify-phone
// For farmers whose account was already created by an admin: confirms the
// phone number matches a registered farmer account, then lets them set the
// email and password they'll use to log in from now on. This can only be
// done once per account (credentials_claimed) — after that, farmers use
// POST /api/auth/login as normal. TODO: send an SMS OTP as part of this check.
router.post('/verify-phone', validateVerifyPhone, asyncHandler(async (req: Request, res: Response) => {
  const { phone, email, password } = req.body;

  const user = await prisma.user.findFirst({ where: { phone, role: 'farmer' } });

  if (!user) {
    sendError(res, 'Phone number not found. Please contact an admin to register.', 404);
    return;
  }

  if (user.status !== 'active') {
    sendError(res, 'This account is inactive. Please contact an admin.', 403);
    return;
  }

  if (user.credentials_claimed) {
    sendError(res, 'This account has already set up its login credentials. Please log in, or use forgot password.', 409);
    return;
  }

  const normalizedEmail = email.toLowerCase();
  const emailOwner = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (emailOwner && emailOwner.id !== user.id) {
    sendError(res, 'This email is already in use by another account', 409);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { email: normalizedEmail, password: hashedPassword, credentials_claimed: true },
  });

  sendSuccess(res, { verified: true }, 'Registration complete. Please log in with your new email and password.');
}));

// POST /api/auth/login
router.post('/login', validateUserLogin, asyncHandler(async (req: Request, res: Response) => {
  const { email, password }: LoginRequest = req.body;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) {
    sendError(res, 'Invalid credentials', 401);
    return;
  }

  if (user.status !== 'active') {
    sendError(res, 'Account is inactive', 401);
    return;
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    sendError(res, 'Invalid credentials', 401);
    return;
  }

  const token = generateToken({ id: user.id, email: user.email, role: user.role as any });
  const refreshToken = generateRefreshToken({ id: user.id, email: user.email, role: user.role as any });

  const responseData: AuthResponse = {
    token,
    refreshToken,
    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role as any, status: user.status },
  };

  sendSuccess(res, responseData, 'Login successful');
}));

// POST /api/auth/logout
router.post('/logout', authenticate, asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  sendSuccess(res, null, 'Logout successful');
}));

// GET /api/auth/profile
router.get('/profile', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user?.id },
    select: {
      id: true, email: true, full_name: true, phone: true,
      role: true, status: true, profile: true,
      qr_code_token: true, created_at: true, updated_at: true,
    },
  });

  if (!user) {
    sendError(res, 'User not found', 404);
    return;
  }

  sendSuccess(res, user, 'Profile retrieved successfully');
}));

// PUT /api/auth/profile
router.put('/profile', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { full_name, phone, profile } = req.body;

  const updateData: any = {};
  if (full_name !== undefined) updateData.full_name = full_name;
  if (phone !== undefined) updateData.phone = phone;

  if (profile !== undefined) {
    const existing = await prisma.user.findUnique({
      where: { id: req.user?.id },
      select: { profile: true },
    });
    updateData.profile = { ...(existing?.profile as any || {}), ...profile };
  }

  if (Object.keys(updateData).length === 0) {
    sendError(res, 'No valid fields provided for update', 400);
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.user?.id },
    data: updateData,
    select: {
      id: true, email: true, full_name: true, phone: true,
      role: true, status: true, profile: true,
      qr_code_token: true, created_at: true, updated_at: true,
    },
  });

  sendSuccess(res, user, 'Profile updated successfully');
}));

// PUT /api/auth/password
router.put('/password', authenticate, validatePasswordChange, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword }: PasswordChangeRequest = req.body;

  const user = await prisma.user.findUnique({ where: { id: req.user?.id } });
  if (!user) {
    sendError(res, 'User not found', 404);
    return;
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    sendError(res, 'Current password is incorrect', 400);
    return;
  }

  const hashedPassword = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } });

  sendSuccess(res, null, 'Password changed successfully');
}));

// POST /api/auth/refresh
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken: incomingRefreshToken } = req.body;

  if (!incomingRefreshToken) {
    sendError(res, 'Refresh token is required', 400);
    return;
  }

  const decoded = verifyRefreshToken(incomingRefreshToken);
  if (!decoded) {
    sendError(res, 'Invalid or expired refresh token', 401);
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user || user.status !== 'active') {
    sendError(res, 'Invalid or expired refresh token', 401);
    return;
  }

  const token = generateToken({ id: user.id, email: user.email, role: user.role as any });

  sendSuccess(res, {
    token,
    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, status: user.status },
  }, 'Token refreshed successfully');
}));

// GET /api/auth/verify
router.get('/verify', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  sendSuccess(res, { user: req.user }, 'Token is valid');
}));

// POST /api/auth/forgot-password
router.post('/forgot-password', asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    sendError(res, 'Email is required', 400);
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Always return success to prevent email enumeration
  if (!user) {
    sendSuccess(res, null, 'If that email exists, a reset link has been sent');
    return;
  }

  // Invalidate any existing tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { user_id: user.id, is_used: false },
    data: { is_used: true },
  });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordResetToken.create({
    data: { user_id: user.id, token, expires_at: expiresAt },
  });

  // Best-effort email send – token remains valid even if this fails
  const resetUrl = (process.env.FRONTEND_URL || 'http://localhost:3000') + '/reset-password?token=' + token;
  await emailService.sendPasswordReset(user.email, resetUrl);

  sendSuccess(res, { token: process.env.NODE_ENV !== 'production' ? token : undefined }, 'If that email exists, a reset link has been sent');
}));

// POST /api/auth/reset-password
router.post('/reset-password', asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    sendError(res, 'Token and new password are required', 400);
    return;
  }
  if (newPassword.length < 8) {
    sendError(res, 'Password must be at least 8 characters', 400);
    return;
  }

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!resetToken || resetToken.is_used || resetToken.expires_at < new Date()) {
    sendError(res, 'Invalid or expired reset token', 400);
    return;
  }

  const hashedPassword = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.user_id }, data: { password: hashedPassword } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { is_used: true } }),
  ]);

  sendSuccess(res, null, 'Password reset successfully');
}));

export default router;
