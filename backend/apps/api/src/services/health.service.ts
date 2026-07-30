import { env } from '../config/env.js';
import { checkSupabaseConnection } from '../config/supabase.js';

export async function getHealthStatus() {
  let dbStatus: 'connected' | 'not_configured' | 'error' = 'not_configured';
  let dbError: string | null = null;

  if (env.supabaseConfigError) {
    dbStatus = 'error';
    dbError = env.supabaseConfigError;
  } else if (env.isSupabaseConfigured) {
    try {
      await checkSupabaseConnection();
      dbStatus = 'connected';
    } catch (error) {
      dbStatus = 'error';
      dbError = error instanceof Error ? error.message : 'Unknown Supabase connection error';
    }
  }

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      supabase: {
        status: dbStatus,
        error: dbError,
      },
    },
  };
}
