import { WebClient } from '@slack/web-api';
import { logger } from '../logger.js';
import type { SurveyLinkNotification } from './types.js';

const log = logger.child({ module: 'slack-client' });

let client: WebClient | null = null;

function getClient(): WebClient | null {
  if (client) return client;
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    log.warn('SLACK_BOT_TOKEN not set - survey Slack DMs will not be sent');
    return null;
  }
  client = new WebClient(token);
  return client;
}

function buildMessage(notification: SurveyLinkNotification): string {
  const projectLine =
    notification.projectNames.length > 1
      ? `covering *${notification.projectNames.join(', ')}*`
      : `for *${notification.projectNames[0]}*`;
  return [
    `You've been sent a short, anonymous developer pulse survey ${projectLine}.`,
    `Please respond by ${notification.deadline.toDateString()}: ${notification.url}`,
  ].join('\n');
}

/**
 * Resolves the recipient's Slack user via email lookup (no Slack-ID column needed on User),
 * then DMs them. Returns true if sent, false if lookup/send failed - never throws, since
 * Slack delivery is a best-effort secondary channel alongside email.
 */
export async function sendSurveyLinkSlackMessage(notification: SurveyLinkNotification): Promise<boolean> {
  const slack = getClient();
  if (!slack) return false;

  try {
    const lookup = await slack.users.lookupByEmail({ email: notification.recipientEmail });
    const slackUserId = lookup.user?.id;
    if (!slackUserId) {
      log.warn({ recipient: notification.recipientEmail }, 'no Slack user found for email');
      return false;
    }

    const conversation = await slack.conversations.open({ users: slackUserId });
    const channelId = conversation.channel?.id;
    if (!channelId) {
      log.warn({ recipient: notification.recipientEmail }, 'could not open Slack DM channel');
      return false;
    }

    await slack.chat.postMessage({ channel: channelId, text: buildMessage(notification) });
    return true;
  } catch (error) {
    log.warn({ error, recipient: notification.recipientEmail }, 'failed to send survey link via Slack');
    return false;
  }
}
