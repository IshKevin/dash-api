import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { swaggerOptions } from './swagger';
import { database } from './config/database';
import { env } from './config/environment';
import logger from './config/logger';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import { sendSuccess } from './utils/responses';
import { requestLogger } from './middleware/requestLogger';

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import productRoutes from './routes/products';
import farmerInformationRoutes from './routes/farmer-information';
import agentInformationRoutes from './routes/agent-information';
import orderRoutes from './routes/orders';
import serviceRequestRoutes from './routes/serviceRequests';
import analyticsRoutes from './routes/analytics';
import shopRoutes from './routes/shops';
import inventoryRoutes from './routes/inventory';
import notificationRoutes from './routes/notifications';
import uploadRoutes from './routes/upload';
import logRoutes from './routes/logs';
import profileAccessRoutes from './routes/profile-access';
import monitoringRoutes from './routes/monitoring';
import welcomeRoutes from './routes/welcome';
import customersRoutes from './routes/customers';
import suppliersRoutes from './routes/suppliers';
import reportsRoutes from './routes/reports';
import weatherRoutes from './routes/weather';
import farmsRoutes from './routes/farms';
import transactionsRoutes from './routes/transactions';

dotenv.config();

const app: Application = express();

// Security Middleware
app.use(helmet());
app.use(compression());

// Rate Limiting
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later',
    error: 'Rate limit exceeded',
  },
});
app.use('/api', limiter);

// HTTP Request Logging
const morganFormat = env.NODE_ENV === 'development' ? 'dev' : 'combined';
app.use(
  morgan(morganFormat, {
    stream: { write: (message) => logger.http(message.trim()) },
  })
);

// Custom Request Logging
app.use(requestLogger);

// CORS Configuration
if (env.CORS_PUBLIC) {
  app.use(cors({ origin: '*', credentials: false }));
} else {
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  sendSuccess(
    res,
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'postgresql',
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
        percentage: Math.round(
          (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100
        ),
      },
    },
    'Service is healthy'
  );
});

// API Routes
app.use('/api/welcome', welcomeRoutes);

// Swagger UI — override helmet's CSP for this path so the UI scripts/styles load
app.use(
  '/api-docs',
  (_req: Request, res: Response, next: NextFunction) => {
    res.removeHeader('Content-Security-Policy');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:"
    );
    next();
  },
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Dashboard Avocado API',
    swaggerOptions: { persistAuthorization: true, docExpansion: 'none' },
  })
);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/farmer-information', farmerInformationRoutes);
app.use('/api/agent-information', agentInformationRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/service-requests', serviceRequestRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/profile-access', profileAccessRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/farms', farmsRoutes);
app.use('/api/transactions', transactionsRoutes);

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  sendSuccess(
    res,
    {
      message: 'Dashboard Avocado Backend API',
      version: env.APP_VERSION,
      database: 'PostgreSQL',
      documentation: '/api-docs',
    },
    'Welcome to the Dashboard Avocado Backend API'
  );
});

app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async (): Promise<void> => {
  try {
    await database.connect();
    logger.info('✅ Database connection established');

    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Server running on port ${env.PORT}`);
      logger.info(`📚 API Docs: http://localhost:${env.PORT}/api-docs`);
      logger.info(`🌍 Environment: ${env.NODE_ENV}`);
      logger.info(`🗄️  Database: PostgreSQL`);
      if (env.CORS_PUBLIC) {
        logger.info('🔓 CORS: Public (all origins)');
      } else {
        logger.info(`🔒 CORS: Restricted to ${env.CORS_ORIGIN}`);
      }
    });

    process.on('SIGINT', async () => {
      logger.info('🔄 Shutting down server...');
      server.close(async () => {
        logger.info('🛑 Server closed');
        await database.disconnect();
        process.exit(0);
      });
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error(`🚨 Unhandled Rejection at: ${promise}, reason: ${reason}`);
      server.close(() => process.exit(1));
    });

    process.on('uncaughtException', (error) => {
      logger.error(`🚨 Uncaught Exception: ${error}`);
      server.close(() => process.exit(1));
    });
  } catch (error) {
    logger.error(`❌ Failed to start server: ${error}`);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

export default app;
export { startServer };
