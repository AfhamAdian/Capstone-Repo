// Project invitations: mint a token per invitee and email a registration link. Best-effort (never throws).

import { inviteTokenStore } from '@libs/auth/invite-token-store.js';
import { sendProjectInviteEmail } from './email.service.js';
import { env } from '../config/env.js';
import { logger } from '@libs/logger.js';

const log = logger.child({ component: 'invite-service' });

export async function sendProjectInvites(input: {
  companyId: number;
  projectId: number;
  projectName: string;
  invites: Array<{ email: string; name?: string }>;
}): Promise<void> {
  for (const { email, name } of input.invites) {
    try {
      const token = await inviteTokenStore.create({
        email,
        companyId: input.companyId,
        projectId: input.projectId,
      });
      const inviteUrl = `${env.frontendUrl}/register?invite=${token}`;
      await sendProjectInviteEmail(email, inviteUrl, input.projectName, name);
    } catch (error) {
      log.error({ err: error, email, projectId: input.projectId }, 'failed to send project invite');
    }
  }
}
