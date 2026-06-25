import { prisma } from '../lib/prisma';
import logger from '../config/logger';

async function cleanup() {
  try {
    logger.info('Starting cleanup...');

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Remove expired access keys
    const expiredKeys = await prisma.accessKey.deleteMany({
      where: { expires_at: { lt: now } },
    });

    // Remove used access keys older than 7 days
    const oldUsedKeys = await prisma.accessKey.deleteMany({
      where: { is_used: true, updated_at: { lt: sevenDaysAgo } },
    });

    // Remove old logs (keep last 30 days)
    const oldLogs = await prisma.log.deleteMany({
      where: { timestamp: { lt: thirtyDaysAgo } },
    });

    logger.info(`Cleanup completed:
      - Expired access keys removed: ${expiredKeys.count}
      - Old used access keys removed: ${oldUsedKeys.count}
      - Old logs removed: ${oldLogs.count}
    `);

  } catch (error) {
    logger.error('Cleanup failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanup()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

export default cleanup;
