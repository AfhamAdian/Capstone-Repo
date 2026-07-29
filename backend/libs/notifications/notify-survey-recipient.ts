import { logger } from '../logger.js';
import { sendSurveyLinkEmail } from './email.client.js';
import { sendSurveyLinkSlackMessage } from './slack.client.js';
import { sendSurveyLinkDiscordDM } from './discord.client.js';
import type { SurveyLinkNotification } from './types.js';

const log = logger.child({ module: 'notify-survey-recipient' });

/**
 * Sends all three per-recipient channels (email, Slack DM, Discord DM) in
 * parallel; one failing (or Discord being skipped for a recipient with no
 * linked account) doesn't block the others. Used by worker processors only.
 */
export async function notifySurveyRecipient(
  notification: SurveyLinkNotification,
): Promise<{ emailSent: boolean; slackSent: boolean; discordSent: boolean }> {
  const [emailSent, slackSent, discordSent] = await Promise.all([
    sendSurveyLinkEmail(notification),
    sendSurveyLinkSlackMessage(notification),
    sendSurveyLinkDiscordDM(notification),
  ]);

  if (!emailSent && !slackSent && !discordSent) {
    log.error({ recipient: notification.recipientEmail }, 'survey link delivery failed on email, Slack, and Discord');
  }

  return { emailSent, slackSent, discordSent };
}
