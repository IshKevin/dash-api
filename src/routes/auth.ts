import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { hashPassword, comparePassword } from '../utils/bcrypt';
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
  try {
    const { email, password, full_name, phone, role, profile }: RegisterRequest = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      sendError(res, 'User with this email already exists', 409);
      return;
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = new User({
      email,
      password: hashedPassword,
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
    return;
  } catch (error) {
    sendError(res, 'Registration failed', 500);
    return;
  }
}));

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', validateUserLogin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { email, password }: LoginRequest = req.body;

    // Find user by email
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      sendError(res, 'Invalid credentials', 401);
      return;
    }

    // Check if user is active
    if (user.status !== 'active') {
      sendError(res, 'Account is inactive', 401);
      return;
    }

    // Compare passwords
    const isMatch = await comparePassword(password, user.password);
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
    return;
  } catch (error) {
    sendError(res, 'Login failed', 500);
    return;
  }
}));

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token invalidation)
 * @access  Private
 */
router.post('/logout', authenticate, asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  // In a real application, you might want to:
  // 1. Add the token to a blacklist
  // 2. Reduce the token's expiration time
  // 3. Clear any server-side sessions
  
  // For JWT-based auth, logout is primarily handled client-side
  // by removing the token from storage
  
  sendSuccess(res, null, 'Logout successful');
  return;
}));

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await User.findById(req.user?.id).select('-password');
    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    sendSuccess(res, user.toPublicJSON(), 'Profile retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve profile', 500);
    return;
  }
}));

/**
 * @route   PUT /api/auth/profile
 * @desc    Update current user profile
 * @access  Private
 */
router.put('/profile', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { full_name, phone, profile } = req.body;
    
    // Only allow users to update their own profile information
    // Role and email updates should be handled separately with additional permissions
    
    const updateData: any = {};
    if (full_name) updateData.full_name = full_name;
    if (phone) updateData.phone = phone;
    if (profile) updateData.profile = profile;
    
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
    return;
  } catch (error) {
    sendError(res, 'Failed to update profile', 500);
    return;
  }
}));

/**
 * @route   PUT /api/auth/password
 * @desc    Change user password
 * @access  Private
 */
router.put('/password', authenticate, validatePasswordChange, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword }: PasswordChangeRequest = req.body;
    
    // Find user with password
    const user = await User.findById(req.user?.id).select('+password');
    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    // Verify current password
    const isMatch = await comparePassword(currentPassword, user.password);
    if (!isMatch) {
      sendError(res, 'Current password is incorrect', 400);
      return;
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    user.password = hashedPassword;
    await user.save();

    sendSuccess(res, null, 'Password changed successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to change password', 500);
    return;
  }
}));

export default router;