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

export const env = {
  nodeEnv,
  port,
  supabaseUrl,
  supabaseServiceRoleKey,
  supabaseConfigError,
  isSupabaseConfigured: hasBothSupabaseValues && hasValidSupabaseUrl,
} as const;
