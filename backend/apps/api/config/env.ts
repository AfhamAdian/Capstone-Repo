import dotenv from 'dotenv';

dotenv.config();

const port = Number(process.env.PORT ?? 3000);
const nodeEnv = process.env.NODE_ENV ?? 'development';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const hasAnySupabaseValue = Boolean(supabaseUrl || supabaseServiceRoleKey);
const hasBothSupabaseValues = Boolean(supabaseUrl && supabaseServiceRoleKey);
const hasValidSupabaseUrl = supabaseUrl ? isValidHttpUrl(supabaseUrl) : false;

let supabaseConfigError: string | null = null;

if (hasAnySupabaseValue && !hasBothSupabaseValues) {
  supabaseConfigError = 'Both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set together.';
} else if (hasBothSupabaseValues && !hasValidSupabaseUrl) {
  supabaseConfigError = 'SUPABASE_URL must be a valid HTTP or HTTPS URL.';
}

// Queue and persistence configuration
const redisUrl = process.env.REDIS_URL;
const databaseUrl = process.env.DATABASE_URL;

// Connector credentials (may be provided per-project in DB, but these can be defaults)
const githubToken = process.env.GITHUB_TOKEN;
const jiraBaseUrl = process.env.JIRA_BASE_URL;
const jiraToken = process.env.JIRA_TOKEN;

// Survey feature: AI question generation/analysis (Gemini)
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

// Survey feature: link delivery - per-recipient channels
const sendgridApiKey = process.env.SENDGRID_API_KEY;
const sendgridFromEmail = process.env.SENDGRID_FROM_EMAIL;
const slackBotToken = process.env.SLACK_BOT_TOKEN;
// Discord bot: DMs individual recipients with a known discord_user_id (see
// User.discord_user_id), same tier as Slack/SendGrid. Falls back to nothing
// for recipients without a Discord ID on file - no email-based lookup exists.
const discordBotToken = process.env.DISCORD_BOT_TOKEN;
// Broadcast channels (shared-link mode only): Telegram group + Discord channel-wide webhook
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

// Survey feature: link distribution model ('shared' one-link-per-cycle | 'single_use' per-developer)
const surveyLinkMode = process.env.SURVEY_LINK_MODE === 'single_use' ? 'single_use' : 'shared';

// Survey feature: AI question quality gate (overall score 0-100) and max questions returned
const surveyQuestionMinScore = Number(process.env.SURVEY_QUESTION_MIN_SCORE ?? 60);
const surveyQuestionMaxCount = Number(process.env.SURVEY_QUESTION_MAX_COUNT ?? 6);

// Survey feature: two-round monthly auto-pulse scheduling. Round 1 opens on
// ROUND1_START_DAY, round 2 on ROUND2_START_DAY; each project gets a randomized
// send moment somewhere inside that round's WINDOW_DAYS-day window (so not every
// project fires at once). Questions are generated LEAD_DAYS before that moment.
const surveyRound1StartDay = Number(process.env.SURVEY_ROUND1_START_DAY ?? 1);
const surveyRound2StartDay = Number(process.env.SURVEY_ROUND2_START_DAY ?? 15);
const surveyRoundWindowDays = Number(process.env.SURVEY_ROUND_WINDOW_DAYS ?? 3);
const surveyQuestionGenLeadDays = Number(process.env.SURVEY_QUESTION_GEN_LEAD_DAYS ?? 2);

// Survey feature: minimum gap (in days) before the same developer can be auto-pulse surveyed again
const surveyMinDaysBetweenSurveys = Number(process.env.SURVEY_MIN_DAYS_BETWEEN_SURVEYS ?? 15);

// Survey feature: encrypted link tokens (AES-256-GCM key, base64url-encoded, 32 bytes decoded)
const surveyTokenEncKey = process.env.SURVEY_TOKEN_ENC_KEY;

// Survey feature: manual "Send Survey Now" monthly cap per project
const manualSurveyMonthlyLimit = Number(process.env.MANUAL_SURVEY_MONTHLY_LIMIT ?? 2);

export const env = {
  nodeEnv,
  port,
  supabaseUrl,
  supabaseServiceRoleKey,
  supabaseConfigError,
  isSupabaseConfigured: hasBothSupabaseValues && hasValidSupabaseUrl,
  redisUrl,
  databaseUrl,
  githubToken,
  jiraBaseUrl,
  jiraToken,
  geminiApiKey,
  geminiModel,
  sendgridApiKey,
  sendgridFromEmail,
  slackBotToken,
  discordBotToken,
  telegramBotToken,
  telegramChatId,
  discordWebhookUrl,
  surveyLinkMode,
  surveyQuestionMinScore,
  surveyQuestionMaxCount,
  surveyRound1StartDay,
  surveyRound2StartDay,
  surveyRoundWindowDays,
  surveyQuestionGenLeadDays,
  surveyMinDaysBetweenSurveys,
  surveyTokenEncKey,
  manualSurveyMonthlyLimit,
} as const;

/**
 * Validate that required environment variables are set
 */
export function validateEnv() {
  const errors: string[] = [];

  if (!env.databaseUrl) {
    errors.push('DATABASE_URL is required for persistence');
  }

  if (!env.redisUrl) {
    errors.push('REDIS_URL is required for queue processing');
  }

  if (errors.length > 0) {
    throw new Error(`Missing required environment variables:\n${errors.join('\n')}`);
  }
}
