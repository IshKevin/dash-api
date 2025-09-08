import { Request, Response, NextFunction } from 'express';
import { sendError, sendNotFound } from '../utils/responses';
import { HttpStatusCode } from '../types/api';

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
  // Log error for debugging (in production, use a proper logging solution)
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: _req.url,
    method: _req.method,
    ip: _req.ip,
    userAgent: _req.get('User-Agent')
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e: any) => ({
      field: e.path,
      message: e.message,
      value: e.value
    }));
    
    sendError(res, 'Validation failed', HttpStatusCode.BAD_REQUEST, errors);
    return;
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const fieldKeys = Object.keys(err.keyValue);
    const field = fieldKeys.length > 0 ? fieldKeys[0] : 'field';
    if (field) {
      const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
      sendError(res, message, HttpStatusCode.CONFLICT);
    } else {
      sendError(res, 'Duplicate key error', HttpStatusCode.CONFLICT);
    }
    return;
  }

  // Mongoose cast error (invalid ID format)
  if (err.name === 'CastError') {
    sendError(res, 'Invalid ID format', HttpStatusCode.BAD_REQUEST);
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
  console.error('Database connection error:', err);
  
  // In a real application, you might want to:
  // 1. Send alerts to monitoring systems
  // 2. Attempt to reconnect
  // 3. Gracefully shut down the application
  // 4. Notify administrators
};

/**
 * Handle unhandled promise rejections
 */
export const handleUnhandledRejection = (reason: any, promise: Promise<any>): void => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  
  // Application specific logging, throwing an error, or other logic here
  console.error('Unhandled promise rejection detected. Shutting down...');
  process.exit(1);
};

/**
 * Handle uncaught exceptions
 */
export const handleUncaughtException = (err: Error): void => {
  console.error('Uncaught Exception:', err);
  
  // Application specific logging, throwing an error, or other logic here
  console.error('Uncaught exception detected. Shutting down...');
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