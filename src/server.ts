import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { database } from './config/database';
import { env } from './config/environment';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import { sendSuccess } from './utils/responses';

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

console.log('✅ Agent Information routes imported');

// Load environment variables
dotenv.config();

const app: Application = express();

// Middleware
// Configure CORS based on environment settings
if (env.CORS_PUBLIC) {
  // Public CORS - allow requests from any origin
  app.use(cors({
    origin: '*', // Allow requests from any origin
    credentials: false // Disable credentials for public API
  }));
} else {
  // Restricted CORS - allow requests only from specified origin
  app.use(cors({
    origin: env.CORS_ORIGIN,
    credentials: true
  }));
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((_req: Request, _res: Response, next: Function) => {
  console.log(`${new Date().toISOString()} - ${_req.method} ${_req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  sendSuccess(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: process.memoryUsage().heapUsed,
      total: process.memoryUsage().heapTotal,
      percentage: Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100)
    }
  }, 'Service is healthy');
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/farmer-information', farmerInformationRoutes);
app.use('/api/agent-information', agentInformationRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/service-requests', serviceRequestRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/addshops', shopRoutes);

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  sendSuccess(res, {
    message: 'Dashboard Avocado Backend API',
    version: env.APP_VERSION,
    documentation: '/api-docs'
  }, 'Welcome to the Dashboard Avocado Backend API');
});

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Function to start the server
const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await database.connect();
    console.log('✅ Database connection established');

    // Start server
    const server = app.listen(env.PORT, () => {
      console.log(`🚀 Server running on port ${env.PORT}`);
      console.log(`🌍 Environment: ${env.NODE_ENV}`);
      console.log(`📅 Started at: ${new Date().toISOString()}`);
      
      // Log CORS configuration
      if (env.CORS_PUBLIC) {
        console.log(`🔓 CORS: Public (allowing requests from any origin)`);
      } else {
        console.log(`🔒 CORS: Restricted to ${env.CORS_ORIGIN}`);
      }
    });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('🔄 Shutting down server...');
      server.close(async () => {
        console.log('🛑 Server closed');
        await database.disconnect();
        console.log('🔌 Database connection closed');
        process.exit(0);
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
      server.close(() => {
        process.exit(1);
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('🚨 Uncaught Exception:', error);
      server.close(() => {
        process.exit(1);
      });
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

export default app;
export { startServer };