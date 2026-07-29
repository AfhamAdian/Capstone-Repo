import { logger } from '../logger.js';
import { sendSurveyLinkTelegram } from './telegram.client.js';
import { sendSurveyLinkDiscord } from './discord.client.js';
import type { SurveyLinkBroadcast } from './types.js';

const log = logger.child({ module: 'broadcast-survey-link' });

/**
 * Broadcasts one shared survey link to team-wide channels (Telegram + Discord).
 * Called ONCE per shared-link cycle (not per recipient) so a group isn't spammed
 * once per developer. Each channel failing doesn't block the other; all channels
 * being unconfigured is fine (returns all-false) since email/Slack cover delivery.
 */
export async function broadcastSurveyLink(
  broadcast: SurveyLinkBroadcast,
): Promise<{ telegramSent: boolean; discordSent: boolean }> {
  const [telegramSent, discordSent] = await Promise.all([
    sendSurveyLinkTelegram(broadcast),
    sendSurveyLinkDiscord(broadcast),
  ]);

  if (telegramSent || discordSent) {
    log.info({ telegramSent, discordSent }, 'broadcast shared survey link to team channels');
  }

  return { telegramSent, discordSent };
}
