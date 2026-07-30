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
