// Resolves the session cookie into req.auth and rejects unauthenticated requests.

import type { NextFunction, Request, Response } from 'express';
import { sessionStore, type SessionData } from '@libs/auth/session-store.js';

export const SESSION_COOKIE_NAME = 'sid';

// Adds req.auth to Express's types so downstream handlers get it typed.
declare global {
  namespace Express {
    interface Request {
      auth?: SessionData & { sessionId: string };
    }
  }
}

// Reads the session id from the cookie, falling back to a query param for EventSource.
export function readSessionId(request: Request): string | null {
  const fromCookie = request.cookies?.[SESSION_COOKIE_NAME];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) {
    return fromCookie;
  }
  return null;
}

// Attaches req.auth when a valid session exists, but never rejects.
export async function attachSession(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  const sessionId = readSessionId(request);

  if (sessionId) {
    const session = await sessionStore.get(sessionId);
    if (session) {
      request.auth = { ...session, sessionId };
    }
  }

  next();
}

// Blocks the request with 401 unless a valid session is present.
export async function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  if (!request.auth) {
    await attachSession(request, response, () => {});
  }

  if (!request.auth) {
    response.status(401).json({ message: 'Authentication required' });
    return;
  }

  next();
}
