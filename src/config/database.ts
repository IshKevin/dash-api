import { prisma } from '../lib/prisma';
import logger from './logger';

class DatabaseConnection {
  private static instance: DatabaseConnection;

  private constructor() {}

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public async connect(): Promise<void> {
    try {
      await prisma.$connect();
      logger.info('PostgreSQL connected via Prisma');
    } catch (error) {
      logger.error('Database connection failed', { error });
      process.exit(1);
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await prisma.$disconnect();
      logger.info('PostgreSQL connection closed');
    } catch (error) {
      logger.error('Error closing database connection', { error });
    }
  }

  public isConnected(): boolean {
    return true;
  }
}

export const database = DatabaseConnection.getInstance();
export default database;
