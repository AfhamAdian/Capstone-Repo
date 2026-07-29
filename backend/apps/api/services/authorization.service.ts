/**
 * Interim project-scoped authorization, mirroring requester-role.ts's pattern:
 * there is no real auth in this backend yet, so this trusts headers the
 * frontend sets from its own session (`x-user-role`, `x-user-id`) rather than
 * a verified token. Level-1 (CEO/CTO) bypasses the per-project membership
 * check entirely (org-wide oversight, matches how GlobalSurveysView already
 * shows every project); everyone else must be a member of the specific
 * project they're calling into.
 *
 * Applied to MUTATING project-scoped actions only (generate/send/edit/complete
 * a survey) - read endpoints (list/detail/quota) stay open, consistent with
 * the product's existing cross-project visibility (GlobalSurveysView) and to
 * avoid blocking local/frontend development on auth that doesn't exist yet.
 *
 * Migration path to real auth: replace getRequesterRole/getRequesterUserId's
 * bodies with reads from verified JWT claims. assertProjectAccess and every
 * call site stay the same.
 */

import type { Request } from 'express';
import { getRequesterRole, getRequesterUserId, isLevel1 } from '../utils/requester-role.js';
import { isProjectMember } from '../database/project-member.js';
import { ForbiddenError } from '../utils/errors.js';

export async function assertProjectAccess(projectId: number, request: Request): Promise<void> {
  const role = getRequesterRole(request);
  if (isLevel1(role)) return;

  const userId = getRequesterUserId(request);
  if (userId === null) {
    throw new ForbiddenError('Missing requester identity (x-user-id header) for this project-scoped action');
  }

  const member = await isProjectMember(projectId, userId);
  if (!member) {
    throw new ForbiddenError('Requester is not a member of this project');
  }
}
