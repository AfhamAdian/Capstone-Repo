// Transactional email via Gmail SMTP (Nodemailer). Logs the link when SMTP creds are unset, for local dev.

import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '@libs/logger.js';

const log = logger.child({ component: 'email-service' });

const transporter =
  env.smtpUser && env.smtpPass
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: env.smtpUser, pass: env.smtpPass },
      })
    : null;

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!transporter) {
    log.warn({ to, resetUrl }, 'SMTP not configured — skipping send, logging reset link instead');
    return;
  }

  await transporter.sendMail({
    from: env.smtpFrom,
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

  log.info({ to }, 'password reset email sent');
}

export async function sendProjectInviteEmail(
  to: string,
  inviteUrl: string,
  projectName?: string,
): Promise<void> {
  if (!transporter) {
    log.warn({ to, inviteUrl }, 'SMTP not configured — skipping send, logging invite link instead');
    return;
  }

  await transporter.sendMail({
    from: env.smtpFrom,
    to,
    subject: projectName ? `You've been invited to ${projectName} on Pulse` : "You've been invited to Pulse",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>You've been invited${projectName ? ` to <b>${projectName}</b>` : ''}</h2>
        <p>Create your account to join the project. This invitation expires in 7 days.</p>
        <p><a href="${inviteUrl}" style="display:inline-block; background:#111; color:#fff; padding:12px 20px; text-decoration:none; border-radius:6px;">Accept invitation</a></p>
        <p>If you weren't expecting this, you can safely ignore this email.</p>
      </div>
    `,
  });

  log.info({ to }, 'project invite email sent');
}

export async function sendSurveyEmail(to: string, name: string, surveyUrl: string): Promise<void> {
  if (!transporter) {
    log.warn({ to, surveyUrl }, 'SMTP not configured — skipping send, logging survey link instead');
    return;
  }

  await transporter.sendMail({
    from: env.smtpFrom,
    to,
    subject: 'Your team pulse survey is open',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Hi ${name},</h2>
        <p>A short pulse survey is open for your project. Your response is anonymous.</p>
        <p><a href="${surveyUrl}" style="display:inline-block; background:#111; color:#fff; padding:12px 20px; text-decoration:none; border-radius:6px;">Take the survey</a></p>
      </div>
    `,
  });

  log.info({ to }, 'survey email sent');
}
