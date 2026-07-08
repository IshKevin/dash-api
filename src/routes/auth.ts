import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma';
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { sendSuccess, sendError, sendCreated } from '../utils/responses';
import { AuthResponse, LoginRequest, PasswordChangeRequest } from '../types/auth';
import {
  validateComprehensiveRegistration,
  validateUserLogin,
  validatePasswordChange,
} from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types/auth';
import { env } from '../config/environment';
import { createFarmerProfileForUser, createAgentProfileForUser, createShopForManager, createFarmForUser } from '../utils/profileCreation';

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

  sendCreated(res, responseData, 'User registered successfully');
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

  // Attempt email send via Resend if API key is configured
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const resetUrl = (process.env.FRONTEND_URL || 'http://localhost:3000') + '/reset-password?token=' + token;
      await resend.emails.send({
        from: process.env.FROM_EMAIL || 'noreply@avocadodashboard.com',
        to: user.email,
        subject: 'Password Reset Request',
        html: '<p>Click <a href="' + resetUrl + '">here</a> to reset your password. This link expires in 1 hour.</p><p>If you did not request this, ignore this email.</p>',
      });
    } catch (emailError) {
      // Log but don't fail – token is still valid
      console.error('Email send failed:', emailError);
    }
  }

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
