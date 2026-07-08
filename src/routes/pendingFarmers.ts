import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError, sendCreated, sendNotFound } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { env } from '../config/environment';

const router = Router();

const validatePendingFarmerCreation = [
  body('full_name').notEmpty().withMessage('Full name is required').isLength({ min: 2 }).trim(),
  body('email').notEmpty().withMessage('Email is required').isEmail().withMessage('Please provide a valid email address').normalizeEmail(),
  body('phone').notEmpty().withMessage('Phone is required').trim(),
  (req: Request, res: Response, next: Function): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
      return;
    }
    next();
  },
];

/**
 * @route   GET /api/pending-farmers
 * @desc    List farmers registered without a login account yet
 * @access  Private (Admin, Agent)
 */
router.get('/', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const status = (req.query.status as string) || 'pending';
  const pendingFarmers = await prisma.pendingFarmer.findMany({
    where: { status: status as any },
    orderBy: { created_at: 'desc' },
  });
  sendSuccess(res, pendingFarmers, 'Pending farmers retrieved successfully');
}));

/**
 * @route   POST /api/pending-farmers
 * @desc    Register a farmer's basic info without creating a login account
 * @access  Private (Admin, Agent)
 */
router.post('/', authenticate, authorize('admin', 'agent'), validatePendingFarmerCreation, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { full_name, email, phone } = req.body;
  const normalizedEmail = email.toLowerCase();

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    sendError(res, 'A user with this email already exists', 409);
    return;
  }

  const existingPending = await prisma.pendingFarmer.findUnique({ where: { email: normalizedEmail } });
  if (existingPending) {
    sendError(res, 'A pending farmer with this email already exists', 409);
    return;
  }

  const pendingFarmer = await prisma.pendingFarmer.create({
    data: { full_name, email: normalizedEmail, phone, created_by: req.user!.id },
  });

  sendCreated(res, pendingFarmer, 'Farmer added successfully');
}));

/**
 * @route   PUT /api/pending-farmers/:id/approve
 * @desc    Approve a pending farmer, creating their real login account
 * @access  Private (Admin only)
 */
router.put('/:id/approve', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const pendingFarmer = await prisma.pendingFarmer.findUnique({ where: { id: req.params.id } });
  if (!pendingFarmer) {
    sendNotFound(res, 'Pending farmer not found');
    return;
  }
  if (pendingFarmer.status !== 'pending') {
    sendError(res, 'Only pending farmers can be approved', 400);
    return;
  }

  const tempPassword = crypto.randomBytes(9).toString('base64url');
  const hashedPassword = await bcrypt.hash(tempPassword, env.BCRYPT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: pendingFarmer.email,
        password: hashedPassword,
        full_name: pendingFarmer.full_name,
        phone: pendingFarmer.phone,
        role: 'farmer',
        status: 'active',
      },
    });
    await tx.pendingFarmer.update({
      where: { id: pendingFarmer.id },
      data: { status: 'approved', approved_user_id: created.id },
    });
    return created;
  });

  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.FROM_EMAIL || 'noreply@avocadodashboard.com',
        to: user.email,
        subject: 'Your Avocado Society of Rwanda account is ready',
        html: `<p>Hi ${user.full_name},</p><p>Your farmer account has been approved. You can now log in with:</p><p>Email: ${user.email}<br/>Temporary password: <strong>${tempPassword}</strong></p><p>Please log in and change your password as soon as possible.</p>`,
      });
    } catch (emailError) {
      console.error('Email send failed:', emailError);
    }
  }

  sendSuccess(res, {
    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
    temp_password: tempPassword,
  }, 'Farmer approved and account created successfully');
}));

/**
 * @route   PUT /api/pending-farmers/:id/reject
 * @desc    Reject a pending farmer
 * @access  Private (Admin only)
 */
router.put('/:id/reject', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const pendingFarmer = await prisma.pendingFarmer.findUnique({ where: { id: req.params.id } });
  if (!pendingFarmer) {
    sendNotFound(res, 'Pending farmer not found');
    return;
  }
  if (pendingFarmer.status !== 'pending') {
    sendError(res, 'Only pending farmers can be rejected', 400);
    return;
  }

  const updated = await prisma.pendingFarmer.update({
    where: { id: pendingFarmer.id },
    data: { status: 'rejected' },
  });

  sendSuccess(res, updated, 'Pending farmer rejected');
}));

/**
 * @route   DELETE /api/pending-farmers/:id
 * @desc    Remove a pending farmer record
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const pendingFarmer = await prisma.pendingFarmer.findUnique({ where: { id: req.params.id } });
  if (!pendingFarmer) {
    sendNotFound(res, 'Pending farmer not found');
    return;
  }

  await prisma.pendingFarmer.delete({ where: { id: pendingFarmer.id } });
  sendSuccess(res, null, 'Pending farmer removed');
}));

export default router;
