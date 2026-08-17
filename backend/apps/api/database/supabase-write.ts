import { assertSupabaseClient } from '../config/supabase.js';

type PostgrestErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

export function formatSupabaseError(error: PostgrestErrorLike): string {
  return [error.message, error.code, error.details, error.hint].filter(Boolean).join(' | ') || 'unknown supabase error';
}

export function missingColumnName(error: PostgrestErrorLike): string | null {
  const quoted = error.message?.match(/column \w+\.(\w+) does not exist/i)?.[1];
  if (quoted) return quoted;
  const cache = error.message?.match(/Could not find the '(\w+)' column/i)?.[1];
  return cache ?? null;
}

/**
 * Inserts a row, dropping columns the live database has not migrated yet
 * (PGRST/Postgres 42703) so older survey schemas still accept writes.
 */
export async function insertRow(table: string, row: Record<string, unknown>): Promise<{ id: number }> {
  const client = assertSupabaseClient();
  const payload: Record<string, unknown> = { ...row };

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { data, error } = await client.from(table).insert([payload]).select('id').single();
    if (!error && data) {
      return { id: data.id as number };
    }
    const column = error ? missingColumnName(error) : null;
    if (column && Object.prototype.hasOwnProperty.call(payload, column)) {
      delete payload[column];
      continue;
    }
    throw new Error(`Failed to insert into ${table}: ${error ? formatSupabaseError(error) : 'no row returned'}`);
  }

  throw new Error(`Failed to insert into ${table}: too many unknown columns`);
}

export async function updateMatching(
  table: string,
  values: Record<string, unknown>,
  applyFilters: (query: any) => any,
): Promise<{ data: Array<{ id: number }> | null; error: PostgrestErrorLike | null }> {
  const client = assertSupabaseClient();
  const payload: Record<string, unknown> = { ...values };

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { data, error } = await applyFilters(client.from(table).update(payload).select('id'));
    if (!error) {
      return { data: (data as Array<{ id: number }>) ?? [], error: null };
    }
    const column = missingColumnName(error);
    if (column && Object.prototype.hasOwnProperty.call(payload, column)) {
      delete payload[column];
      continue;
    }
    return { data: null, error };
  }

  return { data: null, error: { message: `too many unknown columns on ${table}` } };
}
