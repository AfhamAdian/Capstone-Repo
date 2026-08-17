import { logger } from '../logger.js';
import type { SurveyLinkBroadcast } from './types.js';

const log = logger.child({ module: 'telegram-client' });

function buildMessage(broadcast: SurveyLinkBroadcast): string {
  const projectLine =
    broadcast.projectNames.length > 1
      ? `covering ${broadcast.projectNames.join(', ')}`
      : `for ${broadcast.projectNames[0]}`;
  if (broadcast.kind === 'reminder') {
    return [
      `Reminder: the anonymous developer pulse survey is still open ${projectLine}.`,
      `Please respond by ${broadcast.deadline.toDateString()}:`,
      broadcast.url,
      `This is a shared link — responses stay anonymous.`,
    ].join('\n');
  }
  return [
    `📋 A short, anonymous developer pulse survey is open ${projectLine}.`,
    `Please respond by ${broadcast.deadline.toDateString()}:`,
    broadcast.url,
  ].join('\n');
}

/**
 * Posts the shared survey link to a configured Telegram chat/group via the Bot
 * API. Broadcast-only (never used for per-developer single-use links, since the
 * link would then be exposed to the whole group). Best-effort: returns false and
 * never throws so a channel outage can't fail the send job.
 */
export async function sendSurveyLinkTelegram(broadcast: SurveyLinkBroadcast): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    log.warn('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set - survey Telegram broadcast will not be sent');
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: buildMessage(broadcast), disable_web_page_preview: false }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      log.warn({ status: res.status, detail }, 'Telegram sendMessage returned a non-OK status');
      return false;
    }
    return true;
  } catch (error) {
    log.warn({ error }, 'failed to broadcast survey link via Telegram');
    return false;
  }
}
