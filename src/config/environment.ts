import dotenv from 'dotenv';

dotenv.config();

interface EnvironmentConfig {
  PORT: number;
  NODE_ENV: string;
  DATABASE_URL: string;
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
  const config: EnvironmentConfig = {
    PORT: parseInt(process.env.PORT || '5000', 10),
    NODE_ENV: process.env.NODE_ENV || 'development',
    DATABASE_URL: process.env.DATABASE_URL || '',
    JWT_SECRET: process.env.JWT_SECRET || '',
    JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
    CORS_PUBLIC: process.env.CORS_PUBLIC === 'true',
    APP_NAME: process.env.APP_NAME || 'Dashboard Avocado Backend',
    APP_VERSION: process.env.APP_VERSION || '2.0.0',
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    FROM_EMAIL: process.env.FROM_EMAIL,
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    ACCESS_KEY_EXPIRY_DAYS: parseInt(process.env.ACCESS_KEY_EXPIRY_DAYS || '30', 10),
    QR_CODE_EXPIRY_DAYS: parseInt(process.env.QR_CODE_EXPIRY_DAYS || '7', 10),
  };

  const requiredVars = ['JWT_SECRET', 'DATABASE_URL'];
  const missingVars = requiredVars.filter(v => !process.env[v]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  if (
    config.JWT_SECRET === 'supersecret-change-in-prod' &&
    config.NODE_ENV === 'production'
  ) {
    throw new Error('Please change the default JWT_SECRET in production environment');
  }

  return config;
};

export const env = validateEnvironment();
export default env;
