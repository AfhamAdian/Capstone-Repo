// Registration, login and logout. Owns password hashing and session creation.

import bcrypt from 'bcryptjs';
import { sessionStore } from '@libs/auth/session-store.js';
import { resetTokenStore } from '@libs/auth/reset-token-store.js';
import {
  createCompany,
  createUser,
  deleteCompany,
  findUserByEmail,
  findUserById,
  toPublicUser,
  updatePassword,
  type PublicUser,
} from '../database/user.js';
import { sendPasswordResetEmail } from './email.service.js';
import { env } from '../config/env.js';
import { logger } from '@libs/logger.js';

const log = logger.child({ component: 'auth-service' });

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

// Thrown for expected failures (bad input, wrong credentials) so the controller can map them to 4xx.
export class AuthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  companyName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: PublicUser;
  sessionId: string;
}

function assertValidRegisterInput(input: RegisterInput): void {
  if (!input.name?.trim()) throw new AuthError('Name is required', 400);
  if (!input.email?.trim()) throw new AuthError('Email is required', 400);
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) throw new AuthError('Email is invalid', 400);
  if (!input.password) throw new AuthError('Password is required', 400);
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
  }
  if (!input.companyName?.trim()) throw new AuthError('Company name is required', 400);
}

// Creates the company then its first user; rolls the company back if the user insert fails.
export async function register(input: RegisterInput): Promise<AuthResult> {
  assertValidRegisterInput(input);

  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new AuthError('An account with this email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const companyId = await createCompany(input.companyName);

  try {
    const user = await createUser({
      companyId,
      name: input.name,
      email: input.email,
      passwordHash,
      role: 'admin',
    });

    const sessionId = await sessionStore.create({
      userId: user.id,
      companyId: user.company_id,
      email: user.email,
      role: user.role,
    });

    log.info({ userId: user.id, companyId }, 'registered new user and company');
    return { user: toPublicUser(user), sessionId };
  } catch (error) {
    await deleteCompany(companyId);
    log.error({ err: error, companyId }, 'user creation failed, rolled back company');
    throw error;
  }
}

// Same error for unknown email and wrong password so accounts cannot be enumerated.
export async function login(input: LoginInput): Promise<AuthResult> {
  if (!input.email?.trim() || !input.password) {
    throw new AuthError('Email and password are required', 400);
  }

  const user = await findUserByEmail(input.email);
  if (!user) {
    throw new AuthError('Invalid email or password', 401);
  }

  const passwordMatches = await bcrypt.compare(input.password, user.password_hash);
  if (!passwordMatches) {
    throw new AuthError('Invalid email or password', 401);
  }

  const sessionId = await sessionStore.create({
    userId: user.id,
    companyId: user.company_id,
    email: user.email,
    role: user.role,
  });

  log.info({ userId: user.id }, 'user logged in');
  return { user: toPublicUser(user), sessionId };
}

export async function logout(sessionId: string): Promise<void> {
  await sessionStore.destroy(sessionId);
}

// Resolves a session's user for GET /auth/me.
export async function getCurrentUser(userId: number): Promise<PublicUser | null> {
  const user = await findUserById(userId);
  return user ? toPublicUser(user) : null;
}

// Always resolves (never reveals whether the email exists). Emails a reset link if the user exists.
export async function forgotPassword(email: string): Promise<void> {
  if (!email?.trim()) {
    throw new AuthError('Email is required', 400);
  }

  const user = await findUserByEmail(email);
  if (!user) {
    log.info({ email }, 'password reset requested for unknown email (no-op)');
    return;
  }

  const token = await resetTokenStore.create(user.id);
  const resetUrl = `${env.frontendUrl}/reset-password?token=${token}`;

  try {
    await sendPasswordResetEmail(user.email, resetUrl);
  } catch (error) {
    // Never fail the request on email trouble — log and move on.
    log.error({ err: error, userId: user.id }, 'failed to send password reset email');
  }
}

// Consumes a reset token, sets the new password, and revokes all of the user's sessions.
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (!token) {
    throw new AuthError('Reset token is required', 400);
  }
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
  }

  const userId = await resetTokenStore.consume(token);
  if (userId === null) {
    throw new AuthError('Invalid or expired reset token', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await updatePassword(userId, passwordHash);
  await sessionStore.destroyAllForUser(userId);

  log.info({ userId }, 'password reset completed and sessions revoked');
}
