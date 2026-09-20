// Admin-only gate for the survey feature's admin-facing endpoints. Must run after requireAuth
// has populated req.auth from the real session - never trust a caller-supplied role/user-id.

import type { NextFunction, Request, Response } from 'express';
import { requireAuth } from './auth.middleware.js';

/** Blocks with 403 unless the session belongs to an admin (CEO/CTO) user. */
function requireAdmin(request: Request, response: Response, next: NextFunction): void {
  if (request.auth?.role !== 'admin') {
    response.status(403).json({ message: 'Admin access is required' });
    return;
  }
  next();
}

/** Full gate for every survey-admin endpoint: real session + admin role only. */
export const requireSurveyAdmin = [requireAuth, requireAdmin];
