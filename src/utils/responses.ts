import { Response } from 'express';
import {
  ApiResponse,
  SuccessResponse,
  ErrorResponse,
  HttpStatusCode,
  ValidationError
} from '../types/api';
import { env } from '../config/environment';

/**
 * Send a success response
 * @param res - Express Response object
 * @param data - Data to send in the response
 * @param message - Success message
 * @param statusCode - HTTP status code (default: 200)
 * @returns Response - Express Response object
 */
export const sendSuccess = <T>(
  res: Response,
  data: T,
  message: string = 'Request successful',
  statusCode: HttpStatusCode = HttpStatusCode.OK
): Response => {
  const response: SuccessResponse<T> = {
    success: true,
    message,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      version: env.APP_VERSION,
    }
  };

  return res.status(statusCode).json(response);
};

/**
 * Send an error response
 * @param res - Express Response object
 * @param message - Error message
 * @param statusCode - HTTP status code (default: 500)
 * @param errors - Validation errors (optional)
 * @returns Response - Express Response object
 */
export const sendError = (
  res: Response,
  message: string = 'An error occurred',
  statusCode: HttpStatusCode = HttpStatusCode.INTERNAL_SERVER_ERROR,
  errors?: ValidationError[]
): Response => {
  const response: ErrorResponse = {
    success: false,
    message,
    errors: errors ?? undefined,
    meta: {
      timestamp: new Date().toISOString(),
      version: env.APP_VERSION,
    }
  };

  // For development, include stack trace
  if (env.NODE_ENV === 'development' && statusCode === HttpStatusCode.INTERNAL_SERVER_ERROR) {
    // In a real application, you might want to log the error here
    console.error('Server Error:', message);
  }

  return res.status(statusCode).json(response);
};

/**
 * Send a paginated response
 * @param res - Express Response object
 * @param data - Data array
 * @param total - Total number of records
 * @param page - Current page number
 * @param limit - Number of records per page
 * @param message - Success message
 * @returns Response - Express Response object
 */
export const sendPaginatedResponse = <T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  message: string = 'Request successful',
  extraMeta: Record<string, any> = {}
): Response => {
  const totalPages = Math.ceil(total / limit);

  const response: ApiResponse<T[]> = {
    success: true,
    message,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      version: env.APP_VERSION,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      ...extraMeta
    }
  };

  return res.status(HttpStatusCode.OK).json(response);
};

/**
 * Send a created response (201)
 * @param res - Express Response object
 * @param data - Data to send in the response
 * @param message - Success message
 * @returns Response - Express Response object
 */
export const sendCreated = <T>(
  res: Response,
  data: T,
  message: string = 'Resource created successfully'
): Response => {
  return sendSuccess(res, data, message, HttpStatusCode.CREATED);
};

/**
 * Send a no content response (204)
 * @param res - Express Response object
 * @param message - Success message
 * @returns Response - Express Response object
 */
export const sendNoContent = (
  res: Response,
  message: string = 'Request processed successfully'
): Response => {
  return res.status(HttpStatusCode.NO_CONTENT).json({
    success: true,
    message,
    meta: {
      timestamp: new Date().toISOString(),
      version: env.APP_VERSION,
    }
  });
};

/**
 * Send a validation error response (400)
 * @param res - Express Response object
 * @param errors - Validation errors
 * @param message - Error message
 * @returns Response - Express Response object
 */
export const sendValidationError = (
  res: Response,
  errors: ValidationError[],
  message: string = 'Validation failed'
): Response => {
  return sendError(res, message, HttpStatusCode.BAD_REQUEST, errors);
};

/**
 * Send an unauthorized response (401)
 * @param res - Express Response object
 * @param message - Error message
 * @returns Response - Express Response object
 */
export const sendUnauthorized = (
  res: Response,
  message: string = 'Unauthorized access'
): Response => {
  return sendError(res, message, HttpStatusCode.UNAUTHORIZED);
};

/**
 * Send a forbidden response (403)
 * @param res - Express Response object
 * @param message - Error message
 * @returns Response - Express Response object
 */
export const sendForbidden = (
  res: Response,
  message: string = 'Access forbidden'
): Response => {
  return sendError(res, message, HttpStatusCode.FORBIDDEN);
};

/**
 * Send a not found response (404)
 * @param res - Express Response object
 * @param message - Error message
 * @returns Response - Express Response object
 */
export const sendNotFound = (
  res: Response,
  message: string = 'Resource not found'
): Response => {
  return sendError(res, message, HttpStatusCode.NOT_FOUND);
};

/**
 * Send a conflict response (409)
 * @param res - Express Response object
 * @param message - Error message
 * @returns Response - Express Response object
 */
export const sendConflict = (
  res: Response,
  message: string = 'Resource conflict'
): Response => {
  return sendError(res, message, HttpStatusCode.CONFLICT);
};

export default {
  sendSuccess,
  sendError,
  sendPaginatedResponse,
  sendCreated,
  sendNoContent,
  sendValidationError,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendConflict
};