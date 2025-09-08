import jwt from 'jsonwebtoken';
import { JWTPayload } from '../types/auth';
import { env } from '../config/environment';

/**
 * Generate a JWT token for a user
 * @param payload - User data to include in the token
 * @returns string - Signed JWT token
 */
export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRE,
  } as jwt.SignOptions);
};

/**
 * Verify a JWT token
 * @param token - JWT token to verify
 * @returns Promise<JWTPayload | null> - Decoded payload or null if invalid
 */
export const verifyToken = (token: string): JWTPayload | null => {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
};

/**
 * Decode a JWT token without verification
 * @param token - JWT token to decode
 * @returns any - Decoded token payload or null if invalid
 */
export const decodeToken = (token: string): any => {
  try {
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
};

/**
 * Refresh a JWT token
 * @param oldToken - Existing JWT token
 * @returns string | null - New JWT token or null if invalid
 */
export const refreshToken = (oldToken: string): string | null => {
  try {
    const decoded = jwt.verify(oldToken, env.JWT_SECRET) as JWTPayload & { exp?: number; iat?: number };
    
    // Remove expiration from payload for new token
    const { exp, iat, ...payload } = decoded;
    
    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRE,
    } as jwt.SignOptions);
  } catch (error) {
    return null;
  }
};

/**
 * Get token expiration time
 * @param token - JWT token
 * @returns number | null - Expiration timestamp or null if invalid
 */
export const getTokenExpiration = (token: string): number | null => {
  try {
    const decoded = jwt.decode(token) as { exp?: number };
    return decoded.exp || null;
  } catch (error) {
    return null;
  }
};

/**
 * Check if token is expired
 * @param token - JWT token
 * @returns boolean - True if expired, false otherwise
 */
export const isTokenExpired = (token: string): boolean => {
  const expiration = getTokenExpiration(token);
  if (!expiration) return true;
  
  return Date.now() >= expiration * 1000;
};

/**
 * Generate a password reset token
 * @param userId - User ID to include in the token
 * @param email - User email to include in the token
 * @returns string - Password reset token
 */
export const generatePasswordResetToken = (userId: string, email: string): string => {
  return jwt.sign(
    { id: userId, email, type: 'password_reset' },
    env.JWT_SECRET,
    { expiresIn: '1h' } as jwt.SignOptions // Short expiration for password reset tokens
  );
};

/**
 * Verify a password reset token
 * @param token - Password reset token to verify
 * @returns { id: string, email: string } | null - User data or null if invalid
 */
export const verifyPasswordResetToken = (token: string): { id: string, email: string } | null => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { id: string, email: string, type: string };
    
    if (decoded.type !== 'password_reset') {
      return null;
    }
    
    return { id: decoded.id, email: decoded.email };
  } catch (error) {
    return null;
  }
};

export default {
  generateToken,
  verifyToken,
  decodeToken,
  refreshToken,
  getTokenExpiration,
  isTokenExpired,
  generatePasswordResetToken,
  verifyPasswordResetToken
};