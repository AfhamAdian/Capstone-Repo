import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

let supabase: SupabaseClient | null = null;
let supabaseInitializationError: string | null = null;

if (env.isSupabaseConfigured && env.supabaseUrl && env.supabaseServiceRoleKey) {
  try {
    supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  } catch (error) {
    supabaseInitializationError = error instanceof Error ? error.message : 'Failed to initialize Supabase client.';
  }
}

export { supabase };

export function assertSupabaseClient(): SupabaseClient {
  if (supabaseInitializationError) {
    throw new Error(`Supabase initialization error: ${supabaseInitializationError}`);
  }

  if (!supabase) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  return supabase;
}

export async function checkSupabaseConnection(): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client
    .schema('pg_catalog')
    .from('pg_tables')
    .select('tablename', { head: true, count: 'exact' })
    .limit(1);

  if (error) {
    throw new Error(`Supabase connection check failed: ${error.message}`);
  }
}
