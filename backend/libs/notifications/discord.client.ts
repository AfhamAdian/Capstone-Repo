import { logger } from '../logger.js';
import type { SurveyLinkBroadcast, SurveyLinkNotification } from './types.js';

const log = logger.child({ module: 'discord-client' });

const DISCORD_API_BASE = 'https://discord.com/api/v10';

function buildBroadcastMessage(broadcast: SurveyLinkBroadcast): string {
  const projectLine =
    broadcast.projectNames.length > 1
      ? `covering **${broadcast.projectNames.join(', ')}**`
      : `for **${broadcast.projectNames[0]}**`;
  return [
    `📋 A short, anonymous developer pulse survey is open ${projectLine}.`,
    `Please respond by ${broadcast.deadline.toDateString()}: ${broadcast.url}`,
  ].join('\n');
}

function buildDmMessage(notification: SurveyLinkNotification): string {
  const projectLine =
    notification.projectNames.length > 1
      ? `covering **${notification.projectNames.join(', ')}**`
      : `for **${notification.projectNames[0]}**`;
  return [
    `📋 You've been sent a short, anonymous developer pulse survey ${projectLine}.`,
    `Please respond by ${notification.deadline.toDateString()}: ${notification.url}`,
  ].join('\n');
}

/**
 * Posts the shared survey link to a Discord channel via an incoming webhook URL.
 * Broadcast-only, best-effort: returns false and never throws. A webhook posts to
 * a channel (not a DM), which is exactly the shared-link delivery model.
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

/**
 * DMs a single recipient via the Discord Bot API - the per-recipient
 * counterpart to Slack DM + email, same tier in notify-survey-recipient.ts.
 *
 * Unlike Slack (`users.lookupByEmail`), Discord's Bot API has no way to
 * resolve a user from an email address: the caller must already have the
 * recipient's Discord user ID (`notification.recipientDiscordUserId`, sourced
 * from `User.discord_user_id`). If it's not set, this is a silent no-op
 * (logged at debug, not warn - most recipients won't have linked Discord and
 * that's expected, not an error condition).
 *
 * Two-step REST flow (bot token auth, no separate SDK dependency):
 *   1. POST /users/@me/channels {recipient_id} -> opens/reuses a DM channel.
 *   2. POST /channels/{id}/messages {content} -> sends the message.
 * Requires the bot to share a server with the recipient (or have DMed them
 * before) and to have the "Send Messages" permission.
 */
export async function sendSurveyLinkDiscordDM(notification: SurveyLinkNotification): Promise<boolean> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    log.warn('DISCORD_BOT_TOKEN not set - survey Discord DMs will not be sent');
    return false;
  }
  const recipientId = notification.recipientDiscordUserId;
  if (!recipientId) {
    log.debug({ recipient: notification.recipientEmail }, 'recipient has no linked Discord account, skipping Discord DM');
    return false;
  }

  try {
    const channelRes = await fetch(`${DISCORD_API_BASE}/users/@me/channels`, {
      method: 'POST',
      headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: recipientId }),
    });
    if (!channelRes.ok) {
      const detail = await channelRes.text().catch(() => '');
      log.warn({ status: channelRes.status, detail, recipientId }, 'failed to open Discord DM channel');
      return false;
    }
    const channel = (await channelRes.json()) as { id?: string };
    if (!channel.id) {
      log.warn({ recipientId }, 'Discord DM channel response had no id');
      return false;
    }

    const messageRes = await fetch(`${DISCORD_API_BASE}/channels/${channel.id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: buildDmMessage(notification) }),
    });
    if (!messageRes.ok) {
      const detail = await messageRes.text().catch(() => '');
      log.warn({ status: messageRes.status, detail, recipientId }, 'failed to send Discord DM');
      return false;
    }
    return true;
  } catch (error) {
    log.warn({ error, recipientId }, 'failed to send survey link via Discord DM');
    return false;
  }
}
