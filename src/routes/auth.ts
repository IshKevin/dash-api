import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { generateToken } from '../utils/jwt';
import { sendSuccess, sendError, sendCreated } from '../utils/responses';
import { AuthResponse, RegisterRequest, LoginRequest, PasswordChangeRequest } from '../types/auth';
import { 
  validateUserRegistration, 
  validateUserLogin,
  validatePasswordChange
} from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', validateUserRegistration, asyncHandler(async (req: Request, res: Response) => {
  const { email, password, full_name, phone, role, profile }: RegisterRequest = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    sendError(res, 'User with this email already exists', 409);
    return;
  }

  // Create user (password will be automatically hashed by the pre-save middleware)
  const user = new User({
    email: email.toLowerCase(),
    password,
    full_name,
    phone,
    role: role || 'farmer',
    profile: profile || {},
  });

  // Save user
  await user.save();

  // Generate JWT token
  const token = generateToken({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
  });

  // Prepare response data
  const responseData: AuthResponse = {
    token,
    user: {
      id: user._id.toString(),
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      status: user.status,
    }
  };

  sendCreated(res, responseData, 'User registered successfully');
}));

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', validateUserLogin, asyncHandler(async (req: Request, res: Response) => {
  const { email, password }: LoginRequest = req.body;

  // Find user by email and include password for comparison
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) {
    sendError(res, 'Invalid credentials', 401);
    return;
  }

  // Check if user is active
  if (user.status !== 'active') {
    sendError(res, 'Account is inactive', 401);
    return;
  }

  // Compare passwords using the instance method
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    sendError(res, 'Invalid credentials', 401);
    return;
  }

  // Generate JWT token
  const token = generateToken({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
  });

  // Prepare response data
  const responseData: AuthResponse = {
    token,
    user: {
      id: user._id.toString(),
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      status: user.status,
    }
  };

  sendSuccess(res, responseData, 'Login successful');
}));

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token invalidation)
 * @access  Private
 */
router.post('/logout', authenticate, asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  // In a real application, you might want to:
  // 1. Add the token to a blacklist/redis cache
  // 2. Track user sessions
  // 3. Clear any server-side sessions
  
  // For JWT-based auth, logout is primarily handled client-side
  // by removing the token from storage
  
  sendSuccess(res, null, 'Logout successful');
}));

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await User.findById(req.user?.id).select('-password');
  if (!user) {
    sendError(res, 'User not found', 404);
    return;
  }

  sendSuccess(res, user.toPublicJSON(), 'Profile retrieved successfully');
}));

/**
 * @route   PUT /api/auth/profile
 * @desc    Update current user profile
 * @access  Private
 */
router.put('/profile', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { full_name, phone, profile } = req.body;
  
  // Build update object with only provided fields
  const updateData: any = {};
  if (full_name !== undefined) updateData.full_name = full_name;
  if (phone !== undefined) updateData.phone = phone;
  if (profile !== undefined) {
    // Merge with existing profile data
    const existingUser = await User.findById(req.user?.id);
    updateData.profile = { ...existingUser?.profile, ...profile };
  }
  
  if (Object.keys(updateData).length === 0) {
    sendError(res, 'No valid fields provided for update', 400);
    return;
  }
  
  const user = await User.findByIdAndUpdate(
    req.user?.id,
    updateData,
    { new: true, runValidators: true }
  ).select('-password');
  
  if (!user) {
    sendError(res, 'User not found', 404);
    return;
  }

  sendSuccess(res, user.toPublicJSON(), 'Profile updated successfully');
}));

/**
 * @route   PUT /api/auth/password
 * @desc    Change user password
 * @access  Private
 */
router.put('/password', authenticate, validatePasswordChange, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword }: PasswordChangeRequest = req.body;
  
  // Find user with password
  const user = await User.findById(req.user?.id).select('+password');
  if (!user) {
    sendError(res, 'User not found', 404);
    return;
  }

  // Verify current password using the instance method
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    sendError(res, 'Current password is incorrect', 400);
    return;
  }

  // Update password (will be automatically hashed by pre-save middleware)
  user.password = newPassword;
  await user.save();

  sendSuccess(res, null, 'Password changed successfully');
}));

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh JWT token
 * @access  Private
 */
router.post('/refresh', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Generate new token with current user data
  const token = generateToken({
    id: req.user!.id,
    email: req.user!.email,
    role: req.user!.role,
  });

  const responseData = {
    token,
    user: req.user,
  };

  sendSuccess(res, responseData, 'Token refreshed successfully');
}));

/**
 * @route   GET /api/auth/verify
 * @desc    Verify if current token is valid
 * @access  Private
 */
router.get('/verify', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  sendSuccess(res, { user: req.user }, 'Token is valid');
}));

export default router;