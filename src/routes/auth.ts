import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { generateToken } from '../utils/jwt';
import { sendSuccess, sendError, sendCreated } from '../utils/responses';
import { AuthResponse, RegisterRequest, LoginRequest, PasswordChangeRequest } from '../types/auth';
import {
  validateUserRegistration,
  validateUserLogin,
  validatePasswordChange,
} from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types/auth';
import { env } from '../config/environment';

const router = Router();

// POST /api/auth/register
router.post('/register', validateUserRegistration, asyncHandler(async (req: Request, res: Response) => {
  const { email, password, full_name, phone, role, profile }: RegisterRequest = req.body;

  const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existingUser) {
    sendError(res, 'User with this email already exists', 409);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hashedPassword,
      full_name,
      phone,
      role: (role || 'farmer') as any,
      profile: (profile || {}) as any,
    },
    select: { id: true, email: true, full_name: true, role: true, status: true },
  });

  const token = generateToken({ id: user.id, email: user.email, role: user.role as any });

  const responseData: AuthResponse = {
    token,
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

  const responseData: AuthResponse = {
    token,
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
router.post('/refresh', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const token = generateToken({
    id: req.user!.id,
    email: req.user!.email,
    role: req.user!.role,
  });

  sendSuccess(res, { token, user: req.user }, 'Token refreshed successfully');
}));

// GET /api/auth/verify
router.get('/verify', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  sendSuccess(res, { user: req.user }, 'Token is valid');
}));

export default router;
