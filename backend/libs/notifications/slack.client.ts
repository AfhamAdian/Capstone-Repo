import { WebClient } from '@slack/web-api';
import { logger } from '../logger.js';
import type { SurveyLinkBroadcast } from './types.js';

const log = logger.child({ module: 'slack-client' });

let client: WebClient | null = null;

function getClient(): WebClient | null {
  if (client) return client;
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    log.warn('SLACK_BOT_TOKEN not set - survey Slack broadcast will not be sent');
    return null;
  }
  client = new WebClient(token);
  return client;
}

function buildMessage(broadcast: SurveyLinkBroadcast): string {
  const projectLine =
    broadcast.projectNames.length > 1
      ? `covering *${broadcast.projectNames.join(', ')}*`
      : `for *${broadcast.projectNames[0]}*`;
  return [
    `A short, anonymous developer pulse survey is open ${projectLine}.`,
    `Please respond by ${broadcast.deadline.toDateString()}: ${broadcast.url}`,
  ].join('\n');
}

/**
 * Posts the shared survey link once to a configured Slack channel (SLACK_CHANNEL_ID)
 * via the bot token - the Slack counterpart to the Discord webhook broadcast, rather
 * than DMing every recipient individually. Best-effort: never throws.
 */
export async function sendSurveyLinkSlackBroadcast(broadcast: SurveyLinkBroadcast): Promise<boolean> {
  const slack = getClient();
  if (!slack) return false;

  const channelId = process.env.SLACK_CHANNEL_ID;
  if (!channelId) {
    log.warn('SLACK_CHANNEL_ID not set - survey Slack broadcast will not be sent');
    return false;
  }

  try {
    await slack.chat.postMessage({ channel: channelId, text: buildMessage(broadcast) });
    return true;
  } catch (error) {
    log.warn({ error }, 'failed to broadcast survey link via Slack');
    return false;
  }
}
