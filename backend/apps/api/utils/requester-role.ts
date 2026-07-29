import type { Request } from 'express';

/**
 * Stand-in role check until real auth (JWT) exists. The frontend is expected
 * to send the caller's role in the `x-user-role` header (falls back to
 * `requesterRole` in the JSON body for callers that can't set headers). Once
 * JWT auth lands, replace `getRequesterRole` with a claim read from the
 * verified token - `isLevel1` and every call site stay the same.
 */

const LEVEL1_ROLES = new Set(['level1', 'ceo', 'cto']);

export function getRequesterRole(request: Request): string | null {
  const header = request.header('x-user-role');
  if (header) return header;
  const body = request.body as { requesterRole?: unknown } | undefined;
  return typeof body?.requesterRole === 'string' ? body.requesterRole : null;
}

export function isLevel1(role: string | null): boolean {
  return role !== null && LEVEL1_ROLES.has(role.toLowerCase());
}

/**
 * Companion identity read for project-scoped authorization (authorization.service.ts).
 * Same stand-in status as getRequesterRole: trusts a header the frontend sets
 * from its own session until real auth exists. `x-user-id` is expected to be
 * the numeric User.id.
 */
export function getRequesterUserId(request: Request): number | null {
  const header = request.header('x-user-id');
  if (header && Number.isFinite(Number(header))) return Number(header);
  const body = request.body as { requesterUserId?: unknown } | undefined;
  return typeof body?.requesterUserId === 'number' ? body.requesterUserId : null;
}
