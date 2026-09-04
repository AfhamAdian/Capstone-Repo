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

function isLoopbackHttpUrl(value: string): boolean {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(value);
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
const pineconeApiKey = process.env.PINECONE_API_KEY;
const pineconeRerankUrl = process.env.PINECONE_RERANK_URL ?? 'https://api.pinecone.io/rerank';
const pineconeRerankModel = process.env.PINECONE_RERANK_MODEL ?? 'bge-reranker-v2-m3';
const pineconeRerankMinScore = boundedNumber(process.env.PINECONE_RERANK_MIN_SCORE, 0.1, 0, 1);
const pineconeRerankCandidateLimit = Math.min(100, positiveInteger(process.env.PINECONE_RERANK_CANDIDATE_LIMIT, 100));
const pineconeRerankTimeoutMs = positiveInteger(process.env.PINECONE_RERANK_TIMEOUT_MS, 10_000);

// Frontend origin allowed to send credentialed (cookie) requests
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

// Connector credentials (GitHub/Jira/SonarQube) live per-project in projecttoolintegration.config, not in env.

// Email (Gmail SMTP via Nodemailer) + frontend URLs used in public links.
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM ?? smtpUser;
const defaultFrontendUrl = nodeEnv === 'production'
  ? 'https://capstone-repo.vercel.app'
  : 'http://localhost:5173';
const configuredFrontendUrl = process.env.FRONTEND_URL?.replace(/\/+$/, '');
const frontendUrl = nodeEnv === 'production' && configuredFrontendUrl && isLoopbackHttpUrl(configuredFrontendUrl)
  ? defaultFrontendUrl
  : configuredFrontendUrl ?? defaultFrontendUrl;
const configuredSurveyFormBaseUrl = process.env.SURVEY_FORM_BASE_URL?.replace(/\/+$/, '');
const surveyFormBaseUrl = nodeEnv === 'production'
  && configuredSurveyFormBaseUrl
  && isLoopbackHttpUrl(configuredSurveyFormBaseUrl)
    ? `${frontendUrl}/survey`
    : configuredSurveyFormBaseUrl ?? `${frontendUrl}/survey`;

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

// Survey feature: minimum days between two survey emails to the same developer (any project)
const surveyMinDaysBetweenSurveys = boundedInteger(process.env.SURVEY_MIN_DAYS_BETWEEN_SURVEYS, 15, 1, 60);

// Survey feature: encrypted link tokens (AES-256-GCM key, base64url-encoded, 32 bytes decoded)
const surveyTokenEncKey = process.env.SURVEY_TOKEN_ENC_KEY;

// Survey feature: manual "Send Survey Now" monthly cap per project
const manualSurveyMonthlyLimit = boundedInteger(process.env.MANUAL_SURVEY_MONTHLY_LIMIT, 2, 1, 20);

// Periodic sync: re-syncs every project's configured tools on a fixed schedule so the
// dashboard graphs keep accumulating datapoints without anyone clicking Sync.
// SCHEDULED_SYNC_TIMES is a comma-separated list of HH:MM in SCHEDULED_SYNC_TZ — the number
// of entries is the daily frequency ("02:00,14:00" runs twice a day). Times are interpreted
// in the named IANA zone, NOT the server's clock.
const scheduledSyncEnabled = process.env.SCHEDULED_SYNC_ENABLED !== 'false';
const scheduledSyncTz = process.env.SCHEDULED_SYNC_TZ ?? 'UTC';
// Spacing between two projects that share the same VCS token, so a nightly run can't
// burn one PAT's rate limit in a burst. Capped by MAX_SPREAD so a big workspace can't
// stretch its run into the next scheduled slot.
const scheduledSyncPatSpacingMinutes = boundedInteger(process.env.SCHEDULED_SYNC_PAT_SPACING_MINUTES, 10, 0, 240);
const scheduledSyncMaxSpreadMinutes = boundedInteger(process.env.SCHEDULED_SYNC_MAX_SPREAD_MINUTES, 180, 0, 1440);

export interface ScheduledSyncTime {
  hour: number;
  minute: number;
}

/** Parses "02:00,14:30" into distinct, sorted times. Throws on malformed input so a typo
 *  fails at boot instead of silently never firing. */
function parseScheduledSyncTimes(value: string | undefined): ScheduledSyncTime[] {
  const raw = (value ?? '02:00').split(',').map((entry) => entry.trim()).filter(Boolean);
  const byKey = new Map<string, ScheduledSyncTime>();

  for (const entry of raw) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(entry);
    if (!match) {
      throw new Error(`Invalid SCHEDULED_SYNC_TIMES entry "${entry}" (expected HH:MM)`);
    }
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) {
      throw new Error(`Out-of-range SCHEDULED_SYNC_TIMES entry "${entry}"`);
    }
    byKey.set(`${hour}:${minute}`, { hour, minute });
  }

  return [...byKey.values()].sort((a, b) => a.hour - b.hour || a.minute - b.minute);
}

const scheduledSyncTimes = parseScheduledSyncTimes(process.env.SCHEDULED_SYNC_TIMES);

// Time zone used to render dashboard date labels/buckets. Defaults to the scheduling zone,
// since both answer the same question: "what does a calendar day mean for this org?".
// Left at UTC unless configured, which matches the historical behaviour.
const appDisplayTz = process.env.APP_DISPLAY_TZ ?? scheduledSyncTz;

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
  pineconeApiKey,
  pineconeRerankUrl,
  pineconeRerankModel,
  pineconeRerankMinScore,
  pineconeRerankCandidateLimit,
  pineconeRerankTimeoutMs,
  isActionRerankConfigured: Boolean(pineconeApiKey),
  isSemanticSearchConfigured: Boolean(geminiApiKey),
  frontendOrigin,
  smtpUser,
  smtpPass,
  smtpFrom,
  frontendUrl,
  surveyFormBaseUrl,
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
  surveyMinDaysBetweenSurveys,
  surveyTokenEncKey,
  manualSurveyMonthlyLimit,
  scheduledSyncEnabled,
  scheduledSyncTimes,
  scheduledSyncTz,
  scheduledSyncPatSpacingMinutes,
  scheduledSyncMaxSpreadMinutes,
  appDisplayTz,
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

  // A bad zone would otherwise surface as a scheduled sync that simply never fires.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: env.scheduledSyncTz });
  } catch {
    errors.push(`SCHEDULED_SYNC_TZ is not a valid IANA time zone: ${env.scheduledSyncTz}`);
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: env.appDisplayTz });
  } catch {
    errors.push(`APP_DISPLAY_TZ is not a valid IANA time zone: ${env.appDisplayTz}`);
  }

  if (errors.length > 0) {
    throw new Error(`Missing required environment variables:\n${errors.join('\n')}`);
  }
}
