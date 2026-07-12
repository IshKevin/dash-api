import { Resend } from 'resend';
import { env } from '../config/environment';
import logger from '../config/logger';

interface SendResult {
  sent: boolean;
  error?: string;
}

let client: Resend | null = null;

function getClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

async function send(to: string | string[], subject: string, html: string): Promise<SendResult> {
  const resend = getClient();
  if (!resend) return { sent: false, error: 'RESEND_API_KEY not configured' };

  try {
    await resend.emails.send({
      from: env.FROM_EMAIL || 'noreply@avocadodashboard.com',
      to,
      subject,
      html,
    });
    return { sent: true };
  } catch (error: any) {
    logger.error(`Email send failed (to=${Array.isArray(to) ? to.join(',') : to}, subject="${subject}"): ${error.message}`);
    return { sent: false, error: error.message };
  }
}

function sendPasswordReset(to: string, resetUrl: string): Promise<SendResult> {
  return send(
    to,
    'Password Reset Request',
    `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>` +
      '<p>If you did not request this, ignore this email.</p>'
  );
}

function sendFarmerApprovalCredentials(to: string, fullName: string, tempPassword: string): Promise<SendResult> {
  return send(
    to,
    'Your Avocado Society of Rwanda account is ready',
    `<p>Hi ${fullName},</p><p>Your farmer account has been approved. You can now log in with:</p>` +
      `<p>Email: ${to}<br/>Temporary password: <strong>${tempPassword}</strong></p>` +
      '<p>Please log in and change your password as soon as possible.</p>'
  );
}

function sendRegistrationDocuments(
  to: string,
  fullName: string,
  profileCardUrl: string,
  contractUrl: string
): Promise<SendResult> {
  return send(
    to,
    'Welcome — your account documents are ready',
    `<p>Hi ${fullName},</p><p>Thank you for registering. Your account documents are ready to download:</p>` +
      `<ul>` +
      `<li><a href="${profileCardUrl}">Download your profile / ID card</a></li>` +
      `<li><a href="${contractUrl}">Download your agreement / contract</a></li>` +
      `</ul>` +
      '<p>Please keep these documents for your records.</p>'
  );
}

function sendUrgentAdminAlert(to: string[], subject: string, message: string): Promise<SendResult> {
  return send(to, `[Urgent] ${subject}`, `<p>${message}</p>`);
}

function sendFarmerImportantNotice(to: string, title: string, message: string): Promise<SendResult> {
  return send(to, title, `<p>${message}</p>`);
}

export const emailService = {
  sendPasswordReset,
  sendFarmerApprovalCredentials,
  sendRegistrationDocuments,
  sendUrgentAdminAlert,
  sendFarmerImportantNotice,
};

export default emailService;
