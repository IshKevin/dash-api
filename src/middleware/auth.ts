import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { verifyToken } from '../utils/jwt';
import { AuthenticatedRequest, UserRole } from '../types/auth';
import { sendUnauthorized, sendForbidden } from '../utils/responses';
import logger from '../config/logger';

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendUnauthorized(res, 'Access token is required');
      return;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      sendUnauthorized(res, 'Access token is required');
      return;
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.id) {
      sendUnauthorized(res, 'Invalid or expired token');
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true, status: true },
    });

    if (!user) {
      sendUnauthorized(res, 'User not found');
      return;
    }

    if (user.status !== 'active') {
      sendUnauthorized(res, 'User account is inactive');
      return;
    }

    (req as AuthenticatedRequest).user = {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      status: user.status,
    };

    next();
  } catch (error) {
    logger.error('Authentication error', { error });
    sendUnauthorized(res, 'Authentication failed');
  }
};

export const simpleAuth = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendUnauthorized(res, 'Access token is required');
      return;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      sendUnauthorized(res, 'Access token is required');
      return;
    }

    next();
  } catch (error) {
    logger.error('Authentication error', { error });
    sendUnauthorized(res, 'Authentication failed');
  }
};

export const authorize = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      if (!authenticatedReq.user) {
        sendUnauthorized(res, 'Authentication required');
        return;
      }

      if (!roles.length || !roles.includes(authenticatedReq.user.role)) {
        sendForbidden(res, 'Insufficient permissions');
        return;
      }

      next();
    } catch (error) {
      logger.error('Authorization error', { error });
      sendForbidden(res, 'Authorization failed');
    }
  };
};

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
    logger.error('Admin authorization error', { error });
    sendForbidden(res, 'Authorization failed');
  }
};

export const simpleAdminOnly = (req: Request, res: Response, next: NextFunction): void => {
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
    logger.error('Admin authorization error', { error });
    sendForbidden(res, 'Authorization failed');
  }
};

export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      next();
      return;
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.id) {
      next();
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true, status: true },
    });

    if (!user || user.status !== 'active') {
      next();
      return;
    }

    (req as AuthenticatedRequest).user = {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      status: user.status,
    };

    next();
  } catch (error) {
    logger.error('Optional auth error', { error });
    next();
  }
};

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

      if (authenticatedReq.user.role === 'admin') {
        next();
        return;
      }

      if (resourceId !== userId) {
        sendForbidden(res, 'You can only access your own resources');
        return;
      }

      next();
    } catch (error) {
      logger.error('Ownership check error', { error });
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
  requireOwnership,
};
