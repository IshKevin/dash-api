import { prisma } from '../lib/prisma';

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

export default {
  createNotification,
  notifyFarmerServiceUpdate,
  notifyAgentAssignment,
  notifyOrderStatusChange,
  notifyLowStock,
  notifyAllAdmins,
};
