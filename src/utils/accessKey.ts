import crypto from 'crypto';

/**
 * Generate a secure access key
 * Format: XXXX-XXXX-XXXX (12 characters, easy to type)
 */
export const generateAccessKey = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) {
      result += '-';
    }
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
};

/**
 * Generate a secure QR token
 */
export const generateQRToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Validate access key format
 */
export const isValidAccessKeyFormat = (key: string): boolean => {
  const pattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  return pattern.test(key);
};