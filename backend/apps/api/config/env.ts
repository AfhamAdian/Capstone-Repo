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

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

const geminiEmbeddingsUrl = process.env.GEMINI_EMBEDDINGS_URL
  ?? 'https://generativelanguage.googleapis.com/v1beta';
const geminiEmbeddingModel = process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001';
const geminiEmbeddingDimensions = positiveInteger(process.env.GEMINI_EMBEDDING_DIMENSIONS, 768);
const actionEmbeddingVersion = process.env.ACTION_EMBEDDING_VERSION
  ?? 'gemini-embedding-001-768-l2-v1';
const actionSearchMinSimilarity = boundedNumber(
  process.env.ACTION_SEARCH_MIN_SIMILARITY ?? process.env.ACTION_SEARCH_SIMILARITY_THRESHOLD,
  0.7,
  0,
  1,
);
const actionSearchMaxResults = positiveInteger(process.env.ACTION_SEARCH_MAX_RESULTS, 50);
const actionEmbeddingTimeoutMs = positiveInteger(process.env.ACTION_EMBEDDING_TIMEOUT_MS, 10_000);

// Frontend origin allowed to send credentialed (cookie) requests
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

// Connector credentials (GitHub/Jira/SonarQube) live per-project in projecttoolintegration.config, not in env.

// Email (Gmail SMTP via Nodemailer) + frontend base URL used to build password-reset links
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM ?? smtpUser;
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

// Survey feature: AI question generation/analysis (Gemini)
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

// Broadcast channels (one message per cycle, not per recipient): Slack channel,
// Telegram group, Discord channel-wide webhook. A bot posts the shared link once
// rather than DMing every recipient individually.
const slackBotToken = process.env.SLACK_BOT_TOKEN;
const slackChannelId = process.env.SLACK_CHANNEL_ID;
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

// Survey feature: AI question quality gate (overall score 0-100) and max questions returned
const surveyQuestionMinScore = boundedInteger(process.env.SURVEY_QUESTION_MIN_SCORE, 60, 0, 100);
const surveyQuestionMaxCount = boundedInteger(process.env.SURVEY_QUESTION_MAX_COUNT, 6, 1, 20);

// One shared monthly pulse per project. Each project gets a randomized send
// moment inside this window; questions are generated LEAD_DAYS beforehand.
const surveyMonthlyStartDay = boundedInteger(process.env.SURVEY_MONTHLY_START_DAY, 1, 1, 28);
const surveyMonthlyWindowDays = boundedInteger(process.env.SURVEY_MONTHLY_WINDOW_DAYS, 3, 1, 7);
const surveyQuestionGenLeadDays = boundedInteger(process.env.SURVEY_QUESTION_GEN_LEAD_DAYS, 2, 1, 14);

// Survey feature: how many days a survey link stays open for responses before it expires.
// Customizable, clamped to a sane 7-15 day range.
const SURVEY_RESPONSE_DEADLINE_MIN_DAYS = 7;
const SURVEY_RESPONSE_DEADLINE_MAX_DAYS = 15;
const surveyResponseDeadlineDays = boundedInteger(
  process.env.SURVEY_RESPONSE_DEADLINE_DAYS,
  7,
  SURVEY_RESPONSE_DEADLINE_MIN_DAYS,
  SURVEY_RESPONSE_DEADLINE_MAX_DAYS,
);
const surveyMinAnonymousResponses = boundedInteger(process.env.SURVEY_MIN_ANONYMOUS_RESPONSES, 5, 3, 100);

// Survey feature: encrypted link tokens (AES-256-GCM key, base64url-encoded, 32 bytes decoded)
const surveyTokenEncKey = process.env.SURVEY_TOKEN_ENC_KEY;

// Survey feature: manual "Send Survey Now" monthly cap per project
const manualSurveyMonthlyLimit = boundedInteger(process.env.MANUAL_SURVEY_MONTHLY_LIMIT, 2, 1, 20);

export const env = {
  nodeEnv,
  port,
  supabaseUrl,
  supabaseServiceRoleKey,
  supabaseConfigError,
  isSupabaseConfigured: hasBothSupabaseValues && hasValidSupabaseUrl,
  redisUrl,
  databaseUrl,
  geminiEmbeddingsUrl,
  geminiEmbeddingModel,
  geminiEmbeddingDimensions,
  actionEmbeddingVersion,
  actionSearchMinSimilarity,
  actionSearchMaxResults,
  actionEmbeddingTimeoutMs,
  isSemanticSearchConfigured: Boolean(geminiApiKey),
  frontendOrigin,
  smtpUser,
  smtpPass,
  smtpFrom,
  frontendUrl,
  geminiApiKey,
  geminiModel,
  slackBotToken,
  slackChannelId,
  telegramBotToken,
  telegramChatId,
  discordWebhookUrl,
  surveyQuestionMinScore,
  surveyQuestionMaxCount,
  surveyMonthlyStartDay,
  surveyMonthlyWindowDays,
  surveyQuestionGenLeadDays,
  surveyResponseDeadlineDays,
  surveyMinAnonymousResponses,
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
