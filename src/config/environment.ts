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