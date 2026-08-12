// User and company persistence for auth.

import { assertSupabaseClient } from '../config/supabase.js';

const USER_TABLE = 'User';

// admin = CTO/CEO (all company projects); member = everyone else (assigned projects only).
export type UserRole = 'admin' | 'member';

// Raw DB row, including the password hash.
export interface UserRecord {
  id: number;
  company_id: number;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string | null;
}

// Safe shape returned to callers — never carries the password hash.
export interface PublicUser {
  id: number;
  companyId: number;
  name: string;
  email: string;
  role: UserRole;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    companyId: user.company_id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

// Emails are stored and compared lowercased so logins are case-insensitive.
export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from(USER_TABLE)
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up user by email: ${error.message}`);
  }

  return (data as UserRecord | null) ?? null;
}

export async function findUserById(id: number): Promise<UserRecord | null> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from(USER_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up user by id: ${error.message}`);
  }

  return (data as UserRecord | null) ?? null;
}

export async function createCompany(name: string): Promise<number> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('company')
    .insert([{ name: name.trim(), created_at: new Date().toISOString() }])
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create company: ${error?.message ?? 'no row returned'}`);
  }

  return data.id as number;
}

// Compensating delete: the Supabase client has no transactions, so register rolls back manually.
export async function deleteCompany(id: number): Promise<void> {
  const client = assertSupabaseClient();
  await client.from('company').delete().eq('id', id);
}

export async function createUser(input: {
  companyId: number;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}): Promise<UserRecord> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from(USER_TABLE)
    .insert([
      {
        company_id: input.companyId,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        password_hash: input.passwordHash,
        role: input.role,
        created_at: new Date().toISOString(),
      },
    ])
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create user: ${error?.message ?? 'no row returned'}`);
  }

  return data as UserRecord;
}
