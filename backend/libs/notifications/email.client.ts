import sgMail from '@sendgrid/mail';
import { logger } from '../logger.js';
import type { SurveyLinkNotification } from './types.js';

const log = logger.child({ module: 'email-client' });

let initialized = false;

function ensureInitialized(): boolean {
  if (initialized) return true;
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    log.warn('SENDGRID_API_KEY not set - survey emails will not be sent');
    return false;
  }
  sgMail.setApiKey(apiKey);
  initialized = true;
  return true;
}

function buildSubject(projectNames: string[]): string {
  return projectNames.length > 1
    ? `Quick pulse survey: ${projectNames.join(', ')}`
    : `Quick pulse survey: ${projectNames[0]}`;
}

function buildBody(notification: SurveyLinkNotification): string {
  const greeting = notification.recipientName ? `Hi ${notification.recipientName},` : 'Hi,';
  const projectLine =
    notification.projectNames.length > 1
      ? `covering ${notification.projectNames.join(', ')}`
      : `for ${notification.projectNames[0]}`;
  return [
    greeting,
    '',
    `You've been sent a short, anonymous developer pulse survey ${projectLine}.`,
    `Please respond by ${notification.deadline.toDateString()}: ${notification.url}`,
    '',
    'This link is single-use and tied to you, but your individual answers are not linked back to your identity in any report.',
  ].join('\n');
}

/** Returns true if the email was actually sent, false if skipped/failed (never throws - notification delivery is best-effort). */
export async function sendSurveyLinkEmail(notification: SurveyLinkNotification): Promise<boolean> {
  if (!ensureInitialized()) return false;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!fromEmail) {
    log.warn('SENDGRID_FROM_EMAIL not set - survey emails will not be sent');
    return false;
  }

  try {
    await sgMail.send({
      to: notification.recipientEmail,
      from: fromEmail,
      subject: buildSubject(notification.projectNames),
      text: buildBody(notification),
    });
    return true;
  } catch (error) {
    log.error({ error, recipient: notification.recipientEmail }, 'failed to send survey link email');
    return false;
  }
}
