import jwt, { SignOptions } from 'jsonwebtoken';
import { JWTPayload } from '../types/auth';
import { env } from '../config/environment';

// Runtime validation for essential environment variables
if (!env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not defined.');
}
if (!env.JWT_EXPIRE) {
  throw new Error('JWT_EXPIRE environment variable is not defined.');
}

// Utility: make sure JWT_EXPIRE is a valid type for jsonwebtoken
const parseJwtExpire = (): NonNullable<SignOptions['expiresIn']> => {
  const value = env.JWT_EXPIRE;

  // if it looks like a number in seconds
  if (!isNaN(Number(value))) {
    return Number(value);
  }

  // otherwise assume string duration like "1h", "2d"
  return value as NonNullable<SignOptions['expiresIn']>;
};

/**
 * Generate a JWT token for a user
 */
export const generateToken = (payload: JWTPayload): string => {
  const signOptions: SignOptions = {
    expiresIn: parseJwtExpire(),
  };
  return jwt.sign(payload, env.JWT_SECRET, signOptions);
};

/**
 * Verify a JWT token
 */
export const verifyToken = (token: string): JWTPayload | null => {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
};

/**
 * Decode a JWT token without verification
 */
export const decodeToken = (token: string): any => {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
};

/**
 * Refresh a JWT token
 */
export const refreshToken = (oldToken: string): string | null => {
  try {
    const decoded = jwt.verify(oldToken, env.JWT_SECRET) as JWTPayload & { exp?: number; iat?: number };
    const { exp, iat, ...payload } = decoded;

    const signOptions: SignOptions = {
      expiresIn: parseJwtExpire(),
    };

    return jwt.sign(payload, env.JWT_SECRET, signOptions);
  } catch {
    return null;
  }
};

/**
 * Get token expiration time
 */
export const getTokenExpiration = (token: string): number | null => {
  try {
    const decoded = jwt.decode(token) as { exp?: number } | null;
    return decoded?.exp || null;
  } catch {
    return null;
  }
};

/**
 * Check if token is expired
 */
export const isTokenExpired = (token: string): boolean => {
  const expiration = getTokenExpiration(token);
  if (!expiration) return true;
  return Date.now() >= expiration * 1000;
};

/**
 * Generate a password reset token
 */
export const generatePasswordResetToken = (userId: string, email: string): string => {
  return jwt.sign(
    { id: userId, email, type: 'password_reset' },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

/**
 * Verify a password reset token
 */
export const verifyPasswordResetToken = (token: string): { id: string, email: string } | null => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { id: string, email: string, type: string };
    if (decoded.type !== 'password_reset') {
      return null;
    }
    return { id: decoded.id, email: decoded.email };
  } catch {
    return null;
  }
};
