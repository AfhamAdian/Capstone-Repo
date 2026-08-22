import { logger } from '../logger.js';
import { sendSurveyLinkTelegram } from './telegram.client.js';
import { sendSurveyLinkDiscord } from './discord.client.js';
import { sendSurveyLinkSlackBroadcast } from './slack.client.js';
import type { SurveyLinkBroadcast } from './types.js';

const log = logger.child({ module: 'broadcast-survey-link' });

/**
 * Broadcasts one shared survey link to team-wide channels (Slack + Telegram +
 * Discord). Called ONCE per shared-link cycle (not per recipient) - a bot
 * posts to a shared channel/server rather than DMing every developer
 * individually. Each channel failing doesn't block the others; all channels
 * being unconfigured is fine (returns all-false).
 */
export async function broadcastSurveyLink(
  broadcast: SurveyLinkBroadcast,
): Promise<{ telegramSent: boolean; discordSent: boolean; slackSent: boolean }> {
  const [telegramSent, discordSent, slackSent] = await Promise.all([
    sendSurveyLinkTelegram(broadcast),
    sendSurveyLinkDiscord(broadcast),
    sendSurveyLinkSlackBroadcast(broadcast),
  ]);

  if (telegramSent || discordSent || slackSent) {
    log.info({ telegramSent, discordSent, slackSent }, 'broadcast shared survey link to team channels');
  } else {
    log.warn('survey link broadcast failed on Slack, Discord, and Telegram');
  }

  return { telegramSent, discordSent, slackSent };
}
