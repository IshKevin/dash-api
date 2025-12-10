import mongoose from 'mongoose';
import { env } from '../config/environment';
import logger from '../config/logger';
import AccessKey from '../models/AccessKey';
import Log from '../models/Log';

/**
 * Cleanup script for removing expired data
 * Run this periodically in production
 */
async function cleanup() {
  try {
    // Connect to database
    await mongoose.connect(env.MONGODB_URI);
    logger.info('Connected to database for cleanup');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Remove expired access keys
    const expiredKeys = await AccessKey.deleteMany({
      expires_at: { $lt: new Date() }
    });

    // Remove old logs (keep last 30 days)
    const oldLogs = await Log.deleteMany({
      timestamp: { $lt: thirtyDaysAgo }
    });

    // Remove used access keys older than 7 days
    const oldUsedKeys = await AccessKey.deleteMany({
      is_used: true,
      updated_at: { $lt: sevenDaysAgo }
    });

    logger.info(`Cleanup completed:
      - Expired access keys removed: ${expiredKeys.deletedCount}
      - Old logs removed: ${oldLogs.deletedCount}
      - Old used access keys removed: ${oldUsedKeys.deletedCount}
    `);

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    logger.error('Cleanup failed:', error);
    process.exit(1);
  }
}

// Run cleanup if this file is executed directly
if (require.main === module) {
  cleanup();
}

export default cleanup;