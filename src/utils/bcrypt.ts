import bcrypt from 'bcryptjs';

// Salt rounds for bcrypt hashing
const SALT_ROUNDS = 12;

/**
 * Hash a password using bcrypt
 * @param password - Plain text password to hash
 * @returns Promise<string> - Hashed password
 */
export const hashPassword = async (password: string): Promise<string> => {
  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    return await bcrypt.hash(password, salt);
  } catch (error) {
    throw new Error('Error hashing password');
  }
};

/**
 * Compare a plain text password with a hashed password
 * @param password - Plain text password
 * @param hashedPassword - Hashed password to compare against
 * @returns Promise<boolean> - True if passwords match, false otherwise
 */
export const comparePassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    return false;
  }
};

/**
 * Check if a password meets minimum security requirements
 * @param password - Password to validate
 * @returns boolean - True if password is valid, false otherwise
 */
export const isPasswordValid = (password: string): boolean => {
  // Minimum 8 characters
  if (password.length < 8) {
    return false;
  }

  // Must contain at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return false;
  }

  // Must contain at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return false;
  }

  // Must contain at least one digit
  if (!/\d/.test(password)) {
    return false;
  }

  // Must contain at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return false;
  }

  return true;
};

/**
 * Generate a random password
 * @param length - Length of the password (default: 12)
 * @returns string - Generated password
 */
export const generateRandomPassword = (length: number = 12): string => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  const allChars = uppercase + lowercase + numbers + symbols;
  
  let password = '';
  
  // Ensure at least one character from each category
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => 0.5 - Math.random()).join('');
};

export default {
  hashPassword,
  comparePassword,
  isPasswordValid,
  generateRandomPassword
};