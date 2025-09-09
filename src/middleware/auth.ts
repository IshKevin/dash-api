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
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendUnauthorized(res, 'Access token is required');
      return;
    }

    const token = authHeader.split(' ')[1];

    // Check if token exists
    if (!token) {
      sendUnauthorized(res, 'Access token is required');
      return;
    }

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded || !decoded.id) {
      sendUnauthorized(res, 'Invalid or expired token');
      return;
    }

    // Check if user exists and is active
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
    console.error('Authentication error:', error);
    sendUnauthorized(res, 'Authentication failed');
  }
};

/**
 * Simplified authentication middleware that only checks for token presence
 * @param req - Express Request object
 * @param res - Express Response object
 * @param next - Express NextFunction
 */
export const simpleAuth = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    // Check if authorization header exists with Bearer token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendUnauthorized(res, 'Access token is required');
      return;
    }

    const token = authHeader.split(' ')[1];

    // Check if token exists (no validation needed)
    if (!token) {
      sendUnauthorized(res, 'Access token is required');
      return;
    }

    // No validation needed - just proceed
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    sendUnauthorized(res, 'Authentication failed');
  }
};

/**
 * Authorization middleware to check user roles
 * @param roles - Array of allowed roles
 */
export const authorize = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Check if user is authenticated
      const authenticatedReq = req as AuthenticatedRequest;
      if (!authenticatedReq.user) {
        sendUnauthorized(res, 'Authentication required');
        return;
      }

      // Check if user has required role
      if (!roles.length || !roles.includes(authenticatedReq.user.role)) {
        sendForbidden(res, 'Insufficient permissions');
        return;
      }

      next();
    } catch (error) {
      console.error('Authorization error:', error);
      sendForbidden(res, 'Authorization failed');
    }
  };
};

/**
 * Admin only middleware
 */
export const adminOnly = (req: Request, res: Response, next: NextFunction): void => {
  try {
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
  } catch (error) {
    console.error('Admin authorization error:', error);
    sendForbidden(res, 'Authorization failed');
  }
};

/**
 * Simplified admin only middleware that allows access to all token holders
 */
export const simpleAdminOnly = (_req: Request, _res: Response, next: NextFunction): void => {
  // No token validation needed - just proceed for all requests with tokens
  next();
};

/**
 * Optional authentication middleware
 * Allows request to proceed even if no valid token is provided
 * @param req - Express Request object
 * @param _res - Express Response object
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
    
    // If no authorization header, proceed without authentication
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.split(' ')[1];

    // If no token, proceed without authentication
    if (!token) {
      next();
      return;
    }

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded || !decoded.id) {
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
    console.error('Optional auth error:', error);
    next();
  }
};

/**
 * Middleware to check if authenticated user owns the resource
 * @param resourceIdParam - The parameter name for the resource ID (default: 'id')
 */
export const requireOwnership = (resourceIdParam: string = 'id') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      
      if (!authenticatedReq.user) {
        sendUnauthorized(res, 'Authentication required');
        return;
      }

      const resourceId = req.params[resourceIdParam];
      const userId = authenticatedReq.user.id;

      // Admin can access any resource
      if (authenticatedReq.user.role === 'admin') {
        next();
        return;
      }

      // Check if user owns the resource
      if (resourceId !== userId) {
        sendForbidden(res, 'You can only access your own resources');
        return;
      }

      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      sendForbidden(res, 'Access denied');
    }
  };
};

export default {
  authenticate,
  simpleAuth,
  authorize,
  adminOnly,
  simpleAdminOnly,
  optionalAuth,
  requireOwnership
};