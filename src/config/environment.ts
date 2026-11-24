import dotenv from 'dotenv';

dotenv.config();

interface EnvironmentConfig {
  PORT: number;
  NODE_ENV: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRE: string;
  JWT_REFRESH_EXPIRE: string;
  CORS_ORIGIN: string;
  CORS_PUBLIC: boolean;
  APP_NAME: string;
  APP_VERSION: string;
  S3_ENDPOINT: string;
  S3_REGION: string;
  S3_ACCESS_KEY: string;
  S3_SECRET_KEY: string;
  S3_BUCKET: string;
  PUBLIC_API_URL: string | undefined;
  DRY_MATTER_MIN_PCT: number;
  TRUST_PROXY: number | false;
  AUTH_RATE_LIMIT_MAX: number;
  RESEND_API_KEY: string | undefined;
  FROM_EMAIL: string | undefined;
  AFRICASTALKING_USERNAME: string | undefined;
  AFRICASTALKING_API_KEY: string | undefined;
  AFRICASTALKING_SENDER_ID: string | undefined;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  BCRYPT_ROUNDS: number;
  ACCESS_KEY_EXPIRY_DAYS: number;
  QR_CODE_EXPIRY_DAYS: number;
}

function legacyMinioEndpoint(): string | undefined {
  if (!process.env.MINIO_ENDPOINT) return undefined;
  const scheme = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
  return `${scheme}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT || '9000'}`;
}

const validateEnvironment = (): EnvironmentConfig => {
  const config: EnvironmentConfig = {
    PORT: parseInt(process.env.PORT || '5000', 10),
    NODE_ENV: process.env.NODE_ENV || 'development',
    DATABASE_URL: process.env.DATABASE_URL || '',
    JWT_SECRET: process.env.JWT_SECRET || '',
    JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
    JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE || '30d',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
    CORS_PUBLIC: process.env.CORS_PUBLIC === 'true',
    APP_NAME: process.env.APP_NAME || 'Dashboard Avocado Backend',
    APP_VERSION: process.env.APP_VERSION || '2.0.0',
    // S3-compatible object storage (SeaweedFS by default). Legacy MINIO_* names
    // are still honoured so older .env files keep working.
    S3_ENDPOINT: process.env.S3_ENDPOINT || legacyMinioEndpoint() || 'http://localhost:8333',
    S3_REGION: process.env.S3_REGION || 'us-east-1',
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || process.env.MINIO_ACCESS_KEY || 'seaweedadmin',
    S3_SECRET_KEY: process.env.S3_SECRET_KEY || process.env.MINIO_SECRET_KEY || 'seaweedadmin123',
    S3_BUCKET: process.env.S3_BUCKET || process.env.MINIO_BUCKET || 'avocado-dashboard',
    PUBLIC_API_URL: process.env.PUBLIC_API_URL,
    // Minimum dry-matter % for a Hass lot to pass the export maturity check.
    DRY_MATTER_MIN_PCT: parseFloat(process.env.DRY_MATTER_MIN_PCT || '23'),
    // Number of reverse proxies in front of the API (0 = none). Defaults to 1 in production.
    TRUST_PROXY: (() => {
      const v = process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? '1' : '0');
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n > 0 ? n : false;
    })(),
    AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    FROM_EMAIL: process.env.FROM_EMAIL,
    AFRICASTALKING_USERNAME: process.env.AFRICASTALKING_USERNAME,
    AFRICASTALKING_API_KEY: process.env.AFRICASTALKING_API_KEY,
    AFRICASTALKING_SENDER_ID: process.env.AFRICASTALKING_SENDER_ID,
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

  if (config.NODE_ENV === 'production') {
    const weak = ['supersecret-change-in-prod', 'change-me-to-a-long-random-secret', 'your-super-secret-jwt-key-change-in-production'];
    if (config.JWT_SECRET.length < 32 || weak.includes(config.JWT_SECRET)) {
      throw new Error('JWT_SECRET must be a random value of at least 32 characters in production (e.g. `openssl rand -hex 32`)');
    }
    if (['seaweedadmin123', 'minioadmin123'].includes(config.S3_SECRET_KEY)) {
      // eslint-disable-next-line no-console
      console.warn('⚠️  S3_SECRET_KEY is still the default value — set a random secret before going live');
    }
  }

  return config;
};

export const env = validateEnvironment();
export default env;
