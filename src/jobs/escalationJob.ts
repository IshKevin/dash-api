import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { notifyAllAdminsUrgent } from '../utils/notificationService';

// Finds service requests past their due_date that haven't been escalated yet,
// bumps them to urgent priority, and alerts admins (in-app + email).
export async function runEscalationCheck(): Promise<number> {
  const overdue = await prisma.serviceRequest.findMany({
    where: {
      due_date: { lt: new Date() },
      is_escalated: false,
      status: { notIn: ['completed', 'cancelled', 'rejected'] },
    },
  });

  for (const request of overdue) {
    await prisma.serviceRequest.update({
      where: { id: request.id },
      data: { priority: 'urgent', is_escalated: true, escalated_at: new Date() },
    });

    await notifyAllAdminsUrgent(
      `Service request overdue: ${request.title}`,
      `Service request ${request.request_number} ("${request.title}") has passed its due date and has been escalated to urgent priority. Please review it as soon as possible.`,
      request.id
    );
  }

  if (overdue.length > 0) {
    logger.info(`Escalation job: escalated ${overdue.length} overdue service request(s)`);
  }

  return overdue.length;
}

export function startEscalationJob(): void {
  cron.schedule('*/15 * * * *', () => {
    runEscalationCheck().catch((error) => logger.error(`Escalation job failed: ${error}`));
  });
  logger.info('Escalation job scheduled (every 15 minutes)');
}
