/**
 * Notification module exports (survey link delivery)
 * Per-recipient channels: email + Slack DM + Discord DM. Broadcast channels: Telegram + Discord webhook.
 */

export type { SurveyLinkNotification, SurveyLinkBroadcast } from './types.js';
export { sendSurveyLinkEmail } from './email.client.js';
export { sendSurveyLinkSlackMessage } from './slack.client.js';
export { sendSurveyLinkTelegram } from './telegram.client.js';
export { sendSurveyLinkDiscord, sendSurveyLinkDiscordDM } from './discord.client.js';
export { notifySurveyRecipient } from './notify-survey-recipient.js';
export { broadcastSurveyLink } from './broadcast-survey-link.js';
