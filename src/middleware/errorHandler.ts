import { Request, Response, NextFunction } from 'express';
import { sendError, sendNotFound } from '../utils/responses';
import { HttpStatusCode } from '../types/api';
import { Prisma } from '@prisma/client';
import logger from '../config/logger';

/**
 * Handle 404 errors
 * @param req - Express Request object
 * @param res - Express Response object
 * @param next - Express NextFunction
 */
export const notFoundHandler = (_req: Request, res: Response, _next: NextFunction): void => {
  sendNotFound(res, 'Route not found');
};

/**
 * Global error handler
 * @param err - Error object
 * @param req - Express Request object
 * @param res - Express Response object
 * @param next - Express NextFunction
 */
export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    url: _req.url,
    method: _req.method,
    ip: _req.ip,
    userAgent: _req.get('User-Agent'),
  });

  // Prisma unique constraint violation
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const fields = (err.meta?.target as string[]) ?? [];
      const field = fields[0] ?? 'field';
      const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
      sendError(res, message, HttpStatusCode.CONFLICT);
      return;
    }
    if (err.code === 'P2025') {
      sendError(res, 'Record not found', HttpStatusCode.NOT_FOUND);
      return;
    }
    if (err.code === 'P2003') {
      sendError(res, 'Invalid reference: related record not found', HttpStatusCode.BAD_REQUEST);
      return;
    }
    sendError(res, 'Database error', HttpStatusCode.INTERNAL_SERVER_ERROR);
    return;
  }

  // Prisma validation error
  if (err instanceof Prisma.PrismaClientValidationError) {
    sendError(res, 'Invalid data provided', HttpStatusCode.BAD_REQUEST);
    return;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    sendError(res, 'Invalid token', HttpStatusCode.UNAUTHORIZED);
    return;
  }

  if (err.name === 'TokenExpiredError') {
    sendError(res, 'Token expired', HttpStatusCode.UNAUTHORIZED);
    return;
  }

  // Custom application errors
  if (err.statusCode) {
    sendError(res, err.message, err.statusCode);
    return;
  }

  // Default server error
  sendError(res, 'Internal server error', HttpStatusCode.INTERNAL_SERVER_ERROR);
};

/**
 * Async error wrapper to catch async errors in routes
 * @param fn - Async route handler function
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle database connection errors
 * @param err - Error object
 */
export const handleDatabaseError = (err: any): void => {
  logger.error('Database connection error', { error: err });
};

export const handleUnhandledRejection = (reason: any, promise: Promise<any>): void => {
  logger.error('Unhandled promise rejection', { promise, reason });
  process.exit(1);
};

export const handleUncaughtException = (err: Error): void => {
  logger.error('Uncaught exception', { error: err });
  process.exit(1);
};

export default {
  notFoundHandler,
  errorHandler,
  asyncHandler,
  handleDatabaseError,
  handleUnhandledRejection,
  handleUncaughtException
};