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
import { ensureBucketReady, checkStorageHealth } from './config/storage';
import { prisma } from './lib/prisma';
import { startEscalationJob } from './jobs/escalationJob';
import { resumeInterruptedImports } from './services/farmerImport';
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
import settingsRoutes from './routes/settings';
import treesRoutes from './routes/trees';
import diseasesRoutes from './routes/diseases';
import forecastingRoutes from './routes/forecasting';
import procurementRoutes from './routes/procurement';
import trainingRoutes from './routes/training';
import geographyRoutes from './routes/geography';
import cartRoutes from './routes/cart';
import visitsRoutes from './routes/visits';
import pendingFarmersRoutes from './routes/pendingFarmers';
import documentsRoutes from './routes/documents';
import smsRoutes from './routes/sms';
import filesRoutes from './routes/files';
import marketPricesRoutes from './routes/marketPrices';
import harvestLotsRoutes, { traceabilityRouter } from './routes/harvestLots';
import activationRoutes from './routes/activation';
import surveysRoutes from './routes/surveys';
import landRoutes from './routes/land';
import mapRoutes from './routes/map';
import facilitiesRoutes from './routes/facilities';
import opportunitiesRoutes from './routes/opportunities';
import membershipRoutes from './routes/membership';

dotenv.config();

const app: Application = express();

// Behind a reverse proxy (Coolify/Traefik/nginx) the client IP is in
// X-Forwarded-For; rate limiting and logs need the real one.
if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);
app.disable('x-powered-by');

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

// Much stricter limit on credential endpoints (brute force / SMS abuse).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please wait 15 minutes and try again.' },
});
for (const path of ['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/verify-phone']) {
  app.use(path, authLimiter);
}

// HTTP Request Logging
const morganFormat = env.NODE_ENV === 'development' ? 'dev' : 'combined';
app.use(
  morgan(morganFormat, {
    stream: { write: (message) => logger.http(message.trim()) },
  })
);

// Custom Request Logging
app.use(requestLogger);

// CORS Configuration — CORS_ORIGIN may list several origins, comma-separated.
if (env.CORS_PUBLIC) {
  app.use(cors({ origin: '*', credentials: false }));
} else {
  const origins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(cors({ origin: origins.length === 1 ? origins[0] : origins, credentials: true }));
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

// Readiness: dependencies reachable (use for load balancer / deploy checks).
app.get('/health/ready', async (_req: Request, res: Response) => {
  const [db, storage] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    checkStorageHealth(),
  ]);
  res.status(db && storage ? 200 : 503).json({
    success: db && storage,
    message: db && storage ? 'Ready' : 'Not ready',
    data: { database: db ? 'up' : 'down', storage: storage ? 'up' : 'down' },
  });
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
app.use('/api/settings', settingsRoutes);
app.use('/api/trees', treesRoutes);
app.use('/api/diseases', diseasesRoutes);
app.use('/api/forecasting', forecastingRoutes);
app.use('/api/procurement', procurementRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/geography', geographyRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/visits', visitsRoutes);
app.use('/api/pending-farmers', pendingFarmersRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/market-prices', marketPricesRoutes);
app.use('/api/harvest-lots', harvestLotsRoutes);
app.use('/api/traceability', traceabilityRouter);
app.use('/api/surveys', surveysRoutes);
app.use('/api/land', landRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/facilities', facilitiesRoutes);
app.use('/api/opportunities', opportunitiesRoutes);
app.use('/api/membership', membershipRoutes);
app.use('/api/activation', activationRoutes);

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

    // Object storage may still be starting (SeaweedFS needs ~20s on a cold
    // start); retry for a while. Uploads also re-check lazily, so a failure
    // here is not fatal.
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        await ensureBucketReady();
        logger.info('✅ Object storage bucket ready');
        break;
      } catch (error) {
        if (attempt === 10) {
          logger.warn(`⚠️  Object storage not reachable yet (uploads will retry on demand): ${error}`);
        } else {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    }

    startEscalationJob();
    // Farmer imports that were running when the server last stopped carry on.
    resumeInterruptedImports().catch((e) => logger.error(`Could not resume imports: ${e?.message}`));

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

    // Docker/Coolify stop containers with SIGTERM; finish in-flight requests first.
    let shuttingDown = false;
    const shutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info(`🔄 ${signal} received, shutting down…`);
      const force = setTimeout(() => process.exit(1), 15000);
      force.unref();
      server.close(async () => {
        await database.disconnect();
        logger.info('🛑 Server closed');
        process.exit(0);
      });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

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
