import dotenv from 'dotenv';

dotenv.config();

const port = Number(process.env.PORT ?? 3000);
const nodeEnv = process.env.NODE_ENV ?? 'development';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseSimilarity(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) && parsed >= -1 && parsed <= 1 ? parsed : fallback;
}

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

// Semantic action search / SiliconFlow embeddings. SIGNALFLOW aliases preserve
// compatibility with the spelling used during the initial prototype.
const siliconFlowEmbeddingsUrl = process.env.SILICONFLOW_EMBEDDINGS_URL
  ?? process.env.SIGNALFLOW_EMBEDDINGS_URL
  ?? 'https://api.siliconflow.com/v1/embeddings';
const siliconFlowApiKey = process.env.SILICONFLOW_API_KEY ?? process.env.SIGNALFLOW_API_KEY;
const siliconFlowAuthHeader = process.env.SILICONFLOW_AUTH_HEADER
  ?? process.env.SIGNALFLOW_AUTH_HEADER
  ?? 'authorization';
const siliconFlowAuthScheme = process.env.SILICONFLOW_AUTH_SCHEME
  ?? process.env.SIGNALFLOW_AUTH_SCHEME
  ?? 'Bearer';
const siliconFlowEmbeddingModel = process.env.SILICONFLOW_EMBEDDING_MODEL
  ?? process.env.SIGNALFLOW_EMBEDDING_MODEL
  ?? 'Qwen/Qwen3-Embedding-0.6B';
const siliconFlowEmbeddingDimensions = parsePositiveInteger(
  process.env.SILICONFLOW_EMBEDDING_DIMENSIONS ?? process.env.SIGNALFLOW_EMBEDDING_DIMENSIONS,
  1_024,
);
const actionEmbeddingVersion = process.env.ACTION_EMBEDDING_VERSION ?? 'siliconflow-qwen3-embedding-0.6b-1024-v1';
const actionSearchMinSimilarity = parseSimilarity(process.env.ACTION_SEARCH_MIN_SIMILARITY, 0.7);
const actionSearchMaxResults = parsePositiveInteger(process.env.ACTION_SEARCH_MAX_RESULTS, 50);
const actionEmbeddingTimeoutMs = parsePositiveInteger(process.env.ACTION_EMBEDDING_TIMEOUT_MS, 10_000);
const isSemanticSearchConfigured = Boolean(
  siliconFlowEmbeddingsUrl
  && siliconFlowApiKey
  && siliconFlowEmbeddingModel
  && siliconFlowEmbeddingDimensions > 0,
);

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
  siliconFlowEmbeddingsUrl,
  siliconFlowApiKey,
  siliconFlowAuthHeader,
  siliconFlowAuthScheme,
  siliconFlowEmbeddingModel,
  siliconFlowEmbeddingDimensions,
  actionEmbeddingVersion,
  actionSearchMinSimilarity,
  actionSearchMaxResults,
  actionEmbeddingTimeoutMs,
  isSemanticSearchConfigured,
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
