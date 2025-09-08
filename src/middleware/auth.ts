import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { verifyToken } from '../utils/jwt';
import { AuthenticatedRequest, UserRole } from '../types/auth';
import { sendUnauthorized, sendForbidden } from '../utils/responses';

/**
 * Authentication middleware to verify JWT token
 * @param req - Express Request object
 * @param res - Express Response object
 * @param next - Express NextFunction
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    // Check if token exists
    if (!token) {
      sendUnauthorized(res, 'Access token is required');
      return;
    }

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      sendUnauthorized(res, 'Invalid or expired token');
      return;
    }

    // Check if user exists
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      sendUnauthorized(res, 'User not found');
      return;
    }

    // Check if user is active
    if (user.status !== 'active') {
      sendUnauthorized(res, 'User account is inactive');
      return;
    }

    // Attach user to request object
    (req as AuthenticatedRequest).user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      status: user.status,
    };

    next();
  } catch (error) {
    sendUnauthorized(res, 'Authentication failed');
  }
};

/**
 * Authorization middleware to check user roles
 * @param roles - Array of allowed roles
 */
export const authorize = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Check if user is authenticated
    const authenticatedReq = req as AuthenticatedRequest;
    if (!authenticatedReq.user) {
      sendUnauthorized(res, 'Authentication required');
      return;
    }

    // Check if user has required role
    if (!roles.includes(authenticatedReq.user.role)) {
      sendForbidden(res, 'Insufficient permissions');
      return;
    }

    next();
  };
};

/**
 * Admin only middleware
 */
export const adminOnly = (req: Request, res: Response, next: NextFunction): void => {
  const authenticatedReq = req as AuthenticatedRequest;
  if (!authenticatedReq.user) {
    sendUnauthorized(res, 'Authentication required');
    return;
  }

  if (authenticatedReq.user.role !== 'admin') {
    sendForbidden(res, 'Admin access required');
    return;
  }

  next();
};

/**
 * Optional authentication middleware
 * Allows request to proceed even if no valid token is provided
 * @param req - Express Request object
 * @param res - Express Response object
 * @param next - Express NextFunction
 */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    // If no token, proceed without authentication
    if (!token) {
      next();
      return;
    }

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      // Invalid token, but we still proceed (optional auth)
      next();
      return;
    }

    // Check if user exists
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      // User not found, but we still proceed (optional auth)
      next();
      return;
    }

    // Check if user is active
    if (user.status !== 'active') {
      // User inactive, but we still proceed (optional auth)
      next();
      return;
    }

    // Attach user to request object
    (req as AuthenticatedRequest).user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      status: user.status,
    };

    next();
  } catch (error) {
    // Error occurred, but we still proceed (optional auth)
    next();
  }
};

export default {
  authenticate,
  authorize,
  adminOnly,
  optionalAuth
};