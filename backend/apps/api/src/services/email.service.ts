// Transactional email via Resend. No-ops (logs the link) when RESEND_API_KEY is unset, for local dev.

import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from '@libs/logger.js';

const log = logger.child({ component: 'email-service' });
const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!resend) {
    log.warn({ to, resetUrl }, 'RESEND_API_KEY not set — skipping send, logging reset link instead');
    return;
  }

  const { error } = await resend.emails.send({
    from: env.resendFrom,
    to,
    subject: 'Reset your Pulse password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Reset your password</h2>
        <p>We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
        <p><a href="${resetUrl}" style="display:inline-block; background:#111; color:#fff; padding:12px 20px; text-decoration:none; border-radius:6px;">Reset password</a></p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
  log.info({ to }, 'password reset email sent');
}
