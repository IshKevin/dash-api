import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface EnvironmentConfig {
  PORT: number;
  NODE_ENV: string;
  MONGODB_URI: string;
  JWT_SECRET: string;
  JWT_EXPIRE: string;
  CORS_ORIGIN: string;
  CORS_PUBLIC: boolean;
  APP_NAME: string;
  APP_VERSION: string;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  RESEND_API_KEY: string | undefined;
  FROM_EMAIL: string | undefined;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  BCRYPT_ROUNDS: number;
  ACCESS_KEY_EXPIRY_DAYS: number;
  QR_CODE_EXPIRY_DAYS: number;
}

const validateEnvironment = (): EnvironmentConfig => {
  const config = {
    PORT: parseInt(process.env.PORT || '5000', 10),
    NODE_ENV: process.env.NODE_ENV || 'development',
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/dashboard-avocado',
    JWT_SECRET: process.env.JWT_SECRET || '',
    JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
    CORS_PUBLIC: process.env.CORS_PUBLIC === 'true',
    APP_NAME: process.env.APP_NAME || 'Dashboard Avocado Backend',
    APP_VERSION: process.env.APP_VERSION || '1.0.0',
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    FROM_EMAIL: process.env.FROM_EMAIL,
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    ACCESS_KEY_EXPIRY_DAYS: parseInt(process.env.ACCESS_KEY_EXPIRY_DAYS || '30', 10),
    QR_CODE_EXPIRY_DAYS: parseInt(process.env.QR_CODE_EXPIRY_DAYS || '7', 10),
  };

  // Validate required environment variables
  const requiredVars = ['JWT_SECRET'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  if (config.JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production' && config.NODE_ENV === 'production') {
    throw new Error('Please change the default JWT_SECRET in production environment');
  }

  return config;
};

export const env = validateEnvironment();

export default env;