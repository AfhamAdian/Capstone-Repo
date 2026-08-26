// Registration, login and logout. Owns password hashing and session creation.

import bcrypt from 'bcryptjs';
import { sessionStore } from '@libs/auth/session-store.js';
import { resetTokenStore } from '@libs/auth/reset-token-store.js';
import { inviteTokenStore } from '@libs/auth/invite-token-store.js';
import {
  createCompany,
  createUser,
  deleteCompany,
  deleteUser,
  findUserByEmail,
  findUserById,
  toPublicUser,
  updatePassword,
  type PublicUser,
} from '../database/user.js';
import { addProjectMember } from '../database/projectmember.js';
import { sendPasswordResetEmail, sendWelcomeEmail, sendVerificationCodeEmail } from './email.service.js';
import { emailVerificationStore } from '@libs/auth/email-verification-store.js';
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
  companyName?: string;
  inviteToken?: string;
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

// An invite token registers a member into an existing company; otherwise a new admin+company is created.
export async function register(input: RegisterInput): Promise<AuthResult> {
  return input.inviteToken ? registerInvitedMember(input) : registerAdmin(input);
}

// Emails a 6-digit verification code for a self-signup email. Rejects if the email is already taken.
export async function sendEmailVerificationCode(email: string): Promise<void> {
  const trimmed = email?.trim();
  if (!trimmed || !/^\S+@\S+\.\S+$/.test(trimmed)) {
    throw new AuthError('A valid email is required', 400);
  }
  if (await findUserByEmail(trimmed)) {
    throw new AuthError('An account with this email already exists', 409);
  }
  const code = await emailVerificationStore.issueCode(trimmed);
  await sendVerificationCodeEmail(trimmed, code);
  log.info({ email: trimmed }, 'email verification code sent');
}

// Confirms a submitted code, marking the email verified for a short window so registration can proceed.
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  if (!email?.trim() || !code?.trim()) {
    throw new AuthError('Email and code are required', 400);
  }
  const ok = await emailVerificationStore.verifyCode(email, code);
  if (!ok) {
    throw new AuthError('Invalid or expired verification code', 400);
  }
}

// Creates the company then its first (admin) user; rolls the company back if the user insert fails.
async function registerAdmin(input: RegisterInput): Promise<AuthResult> {
  assertValidRegisterInput(input);

  // Self-signup requires a verified email (the code flow above sets this flag).
  if (!(await emailVerificationStore.isVerified(input.email))) {
    throw new AuthError('Please verify your email address first', 400);
  }

  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new AuthError('An account with this email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const companyId = await createCompany(input.companyName!);

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

    await emailVerificationStore.consumeVerified(input.email); // one verified flag = one account

    // Best-effort welcome email — never block or fail registration on a mail hiccup.
    void sendWelcomeEmail(user.email, input.name).catch((err) =>
      log.warn({ err, userId: user.id }, 'welcome email failed (non-blocking)'));

    log.info({ userId: user.id, companyId }, 'registered new user and company');
    return { user: toPublicUser(user), sessionId };
  } catch (error) {
    await deleteCompany(companyId);
    log.error({ err: error, companyId }, 'user creation failed, rolled back company');
    throw error;
  }
}

// Registers an invited user as a member of the inviting company and assigns them to the project.
async function registerInvitedMember(input: RegisterInput): Promise<AuthResult> {
  if (!input.name?.trim()) throw new AuthError('Name is required', 400);
  if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
  }

  // Peek first so validation failures don't burn the single-use token.
  const invite = await inviteTokenStore.get(input.inviteToken!);
  if (!invite) {
    throw new AuthError('Invalid or expired invitation', 400);
  }

  const existing = await findUserByEmail(invite.email);
  if (existing) {
    throw new AuthError('An account with this email already exists. Please log in.', 409);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await createUser({
    companyId: invite.companyId,
    name: input.name,
    email: invite.email,
    passwordHash,
    role: 'member',
  });

  try {
    await addProjectMember({ projectId: invite.projectId, userId: user.id });
  } catch (error) {
    await deleteUser(user.id); // roll back the orphaned user
    log.error({ err: error, userId: user.id }, 'member assignment failed, rolled back user');
    throw error;
  }

  await inviteTokenStore.consume(input.inviteToken!); // burn the token after success

  const sessionId = await sessionStore.create({
    userId: user.id,
    companyId: user.company_id,
    email: user.email,
    role: user.role,
  });

  // Best-effort welcome email — never block or fail registration on a mail hiccup.
  void sendWelcomeEmail(user.email, input.name).catch((err) =>
    log.warn({ err, userId: user.id }, 'welcome email failed (non-blocking)'));

  log.info({ userId: user.id, projectId: invite.projectId }, 'registered invited member');
  return { user: toPublicUser(user), sessionId };
}

// Returns the invite's email/project for prefilling the registration form (non-consuming).
export async function getInvite(
  token: string,
): Promise<{ email: string; projectId: number } | null> {
  if (!token) return null;
  const invite = await inviteTokenStore.get(token);
  return invite ? { email: invite.email, projectId: invite.projectId } : null;
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
