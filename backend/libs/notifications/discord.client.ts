import { logger } from '../logger.js';
import type { SurveyLinkBroadcast } from './types.js';

const log = logger.child({ module: 'discord-client' });

function buildBroadcastMessage(broadcast: SurveyLinkBroadcast): string {
  const projectLine =
    broadcast.projectNames.length > 1
      ? `covering **${broadcast.projectNames.join(', ')}**`
      : `for **${broadcast.projectNames[0]}**`;
  if (broadcast.kind === 'reminder') {
    return [
      `Reminder: the anonymous developer pulse survey is still open ${projectLine}.`,
      `Please respond by ${broadcast.deadline.toDateString()}: ${broadcast.url}`,
      `This is a shared link — responses stay anonymous.`,
    ].join('\n');
  }
  return [
    `📋 A short, anonymous developer pulse survey is open ${projectLine}.`,
    `Please respond by ${broadcast.deadline.toDateString()}: ${broadcast.url}`,
  ].join('\n');
}

/**
 * Posts the shared survey link to a Discord channel via an incoming webhook URL.
 * Broadcast-only, best-effort: returns false and never throws. A webhook posts to
 * a channel (not a DM), which is exactly the shared-link delivery model - no
 * per-recipient DMs are sent.
 */
export async function sendSurveyLinkDiscord(broadcast: SurveyLinkBroadcast): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    log.warn('DISCORD_WEBHOOK_URL not set - survey Discord broadcast will not be sent');
    return false;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: buildBroadcastMessage(broadcast) }),
    });
    // Discord webhooks return 204 No Content on success.
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      log.warn({ status: res.status, detail }, 'Discord webhook returned a non-OK status');
      return false;
    }
    return true;
  } catch (error) {
    log.warn({ error }, 'failed to broadcast survey link via Discord');
    return false;
  }
}
