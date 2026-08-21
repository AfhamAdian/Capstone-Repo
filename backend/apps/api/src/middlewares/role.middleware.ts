/**
 * Role Middleware
 * Level-based access control.
 *
 * Placeholder auth: reads the user's level from the `x-user-level` header.
 * To change role semantics later, edit ROLE_LEVELS or swap the header read
 * for a JWT decode inside this one function — route declarations stay the same.
 */

import type { RequestHandler } from 'express';

export const ROLE_LEVELS = { VIEWER: 0, MANAGER: 1, EXECUTIVE: 2 } as const;

export function requireLevel(minLevel: number): RequestHandler {
  return (request, response, next) => {
    const raw = request.headers['x-user-level'];
    const rawValue = Array.isArray(raw) ? raw[0] : raw;
    const level = typeof rawValue === 'string' ? Number.parseInt(rawValue, 10) : Number.NaN;
    const effectiveLevel = Number.isFinite(level) ? level : ROLE_LEVELS.VIEWER;

    if (effectiveLevel < minLevel) {
      response.status(403).json({ message: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
