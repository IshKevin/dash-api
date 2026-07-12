import { prisma } from '../lib/prisma';
import { emailService } from '../services/emailService';
import { smsService } from '../services/smsService';

export async function createNotification(
  recipientId: string,
  type: 'info' | 'success' | 'warning' | 'error' | 'order' | 'system',
  title: string,
  message: string,
  relatedEntityId?: string,
  relatedEntityType?: 'order' | 'service_request' | 'product' | 'system'
) {
  try {
    return await prisma.notification.create({
      data: {
        recipient_id: recipientId,
        type: type as any,
        title,
        message,
        related_entity_id: relatedEntityId,
        related_entity_type: relatedEntityType as any,
      },
    });
  } catch (error) {
    console.error('Failed to create notification:', error);
    return null;
  }
}

export async function notifyFarmerServiceUpdate(
  farmerId: string,
  serviceId: string,
  title: string,
  message: string
) {
  return createNotification(farmerId, 'info', title, message, serviceId, 'service_request');
}

export async function notifyAgentAssignment(agentId: string, serviceId: string, serviceTitle: string) {
  return createNotification(
    agentId,
    'info',
    'New Service Request Assignment',
    'You have been assigned: ' + serviceTitle,
    serviceId,
    'service_request'
  );
}

export async function notifyOrderStatusChange(userId: string, orderId: string, status: string) {
  return createNotification(
    userId,
    'order',
    'Order Status Updated',
    'Your order status has been updated to: ' + status,
    orderId,
    'order'
  );
}

export async function notifyLowStock(managerId: string, productId: string, productName: string, currentQty: number) {
  return createNotification(
    managerId,
    'warning',
    'Low Stock Alert',
    productName + ' is running low (current quantity: ' + currentQty + ')',
    productId,
    'product'
  );
}

export async function notifyAllAdmins(
  type: 'info' | 'success' | 'warning' | 'error' | 'system',
  title: string,
  message: string,
  relatedId?: string
) {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'admin', status: 'active' },
      select: { id: true },
    });
    await Promise.all(
      admins.map(admin =>
        createNotification(admin.id, type, title, message, relatedId, 'system')
      )
    );
  } catch (error) {
    console.error('Failed to notify admins:', error);
  }
}

// Notifies all admins and, best-effort, emails + SMSes them too — for events
// urgent enough that admins shouldn't have to be looking at the dashboard to
// notice them. SMS is silently a no-op until AFRICASTALKING_USERNAME/
// AFRICASTALKING_API_KEY are configured (mirrors how email behaves without
// RESEND_API_KEY) — email keeps working exactly as before either way.
export async function notifyAllAdminsUrgent(title: string, message: string, relatedId?: string) {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'admin', status: 'active' },
      select: { id: true, email: true, phone: true },
    });

    await Promise.all(
      admins.map(async (admin) => {
        const notification = await createNotification(admin.id, 'error', title, message, relatedId, 'system');
        if (!notification) return;

        const emailResult = await emailService.sendUrgentAdminAlert([admin.email], title, message);
        const smsResult = admin.phone
          ? await smsService.sendUrgentAdminAlert([admin.phone], message)
          : { sent: false, error: 'No phone number on file' };

        await prisma.notification
          .update({
            where: { id: notification.id },
            data: {
              email_sent: emailResult.sent,
              email_sent_at: emailResult.sent ? new Date() : null,
              email_error: emailResult.error || null,
              sms_sent: smsResult.sent,
              sms_sent_at: smsResult.sent ? new Date() : null,
              sms_error: smsResult.error || null,
            },
          })
          .catch(() => null);
      })
    );
  } catch (error) {
    console.error('Failed to notify admins urgently:', error);
  }
}

export default {
  createNotification,
  notifyFarmerServiceUpdate,
  notifyAgentAssignment,
  notifyOrderStatusChange,
  notifyLowStock,
  notifyAllAdmins,
  notifyAllAdminsUrgent,
};
