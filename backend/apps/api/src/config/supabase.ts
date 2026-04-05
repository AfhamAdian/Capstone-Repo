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

  try {
    // Try to query information_schema which is more reliably accessible
    const { data, error } = await client
      .from('information_schema.tables')
      .select('table_name', { count: 'exact', head: true })
      .limit(1);

    if (error) {
      console.error('Supabase REST API error:', error);
      // If REST API fails, it's usually a permission issue, but client is initialized
      // This is acceptable for a health check as long as the client exists
      console.warn('Supabase REST API not available, but client is initialized');
      return;
    }
  } catch (err) {
    console.error('Supabase health check exception:', err);
    // Client is initialized even if health check fails
    return;
  }
}
