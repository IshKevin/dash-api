import africastalking from 'africastalking';
import { env } from '../config/environment';
import logger from '../config/logger';

interface SendResult {
  sent: boolean;
  error?: string;
}

let client: ReturnType<typeof africastalking> | null = null;

function getClient(): ReturnType<typeof africastalking> | null {
  if (!env.AFRICASTALKING_USERNAME || !env.AFRICASTALKING_API_KEY) return null;
  if (!client) {
    client = africastalking({ username: env.AFRICASTALKING_USERNAME, apiKey: env.AFRICASTALKING_API_KEY });
  }
  return client;
}

async function send(to: string | string[], message: string): Promise<SendResult> {
  const at = getClient();
  if (!at) return { sent: false, error: 'AFRICASTALKING_USERNAME/AFRICASTALKING_API_KEY not configured' };

  try {
    const result = await at.SMS.send({
      to,
      message,
      ...(env.AFRICASTALKING_SENDER_ID ? { from: env.AFRICASTALKING_SENDER_ID } : {}),
    });

    const recipients = result.SMSMessageData.Recipients;
    const failed = recipients.filter((r) => r.status !== 'Success');
    if (failed.length > 0) {
      const error = failed.map((r) => `${r.number}: ${r.status}`).join('; ');
      logger.error(`SMS partially failed (to=${Array.isArray(to) ? to.join(',') : to}): ${error}`);
      return { sent: failed.length < recipients.length, error };
    }
    return { sent: true };
  } catch (error: any) {
    logger.error(`SMS send failed (to=${Array.isArray(to) ? to.join(',') : to}): ${error.message}`);
    return { sent: false, error: error.message };
  }
}

function sendRegistrationDocumentsNotice(to: string, fullName: string): Promise<SendResult> {
  return send(to, `Hi ${fullName}, your Dashboard Avocado account documents are ready. Check your email to download your profile card and contract.`);
}

function sendFarmerApprovalCredentials(to: string, tempPassword: string): Promise<SendResult> {
  return send(to, `Your Avocado Society of Rwanda account is ready. Temporary password: ${tempPassword}. Please log in and change it as soon as possible.`);
}

function sendUrgentAdminAlert(to: string[], message: string): Promise<SendResult> {
  return send(to, `[Urgent] ${message}`);
}

function sendFarmerImportantNotice(to: string, message: string): Promise<SendResult> {
  return send(to, message);
}

export const smsService = {
  sendRegistrationDocumentsNotice,
  sendFarmerApprovalCredentials,
  sendUrgentAdminAlert,
  sendFarmerImportantNotice,
};

export default smsService;
