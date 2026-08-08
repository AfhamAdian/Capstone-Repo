// HTTP handlers for auth: parses requests, sets/clears the session cookie, maps AuthError to status codes.

import type { CookieOptions, Request, Response } from 'express';
import { sessionStore } from '@libs/auth/session-store.js';
import {
  AuthError,
  getCurrentUser,
  login,
  logout,
  register,
} from '../services/auth.service.js';
import { SESSION_COOKIE_NAME, readSessionId } from '../middlewares/auth.middleware.js';
import { env } from '../config/env.js';

function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: sessionStore.maxAgeMs,
  };
}

function handleAuthError(error: unknown, response: Response): void {
  if (error instanceof AuthError) {
    response.status(error.status).json({ message: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : 'Authentication failed';
  response.status(500).json({ message });
}

// POST /api/v1/auth/register
export async function registerHandler(request: Request, response: Response): Promise<void> {
  try {
    const { name, email, password, companyName } = request.body ?? {};
    const result = await register({ name, email, password, companyName });
    response.cookie(SESSION_COOKIE_NAME, result.sessionId, sessionCookieOptions());
    response.status(201).json({ user: result.user });
  } catch (error) {
    handleAuthError(error, response);
  }
}

// POST /api/v1/auth/login
export async function loginHandler(request: Request, response: Response): Promise<void> {
  try {
    const { email, password } = request.body ?? {};
    const result = await login({ email, password });
    response.cookie(SESSION_COOKIE_NAME, result.sessionId, sessionCookieOptions());
    response.status(200).json({ user: result.user });
  } catch (error) {
    handleAuthError(error, response);
  }
}

// POST /api/v1/auth/logout
export async function logoutHandler(request: Request, response: Response): Promise<void> {
  const sessionId = request.auth?.sessionId ?? readSessionId(request);
  if (sessionId) {
    await logout(sessionId);
  }
  response.clearCookie(SESSION_COOKIE_NAME, { ...sessionCookieOptions(), maxAge: undefined });
  response.status(200).json({ message: 'Logged out' });
}

// GET /api/v1/auth/me
export async function meHandler(request: Request, response: Response): Promise<void> {
  const user = await getCurrentUser(request.auth!.userId);
  if (!user) {
    response.status(401).json({ message: 'Authentication required' });
    return;
  }
  response.status(200).json({ user });
}
