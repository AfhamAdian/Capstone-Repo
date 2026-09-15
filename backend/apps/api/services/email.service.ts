// Transactional email via Brevo's HTTP API. Logs the payload instead of sending when
// BREVO_API_KEY is unset, for local dev.

import { env } from '../config/env.js';
import { logger } from '@libs/logger.js';

const log = logger.child({ component: 'email-service' });
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

// Parse EMAIL_FROM ("Name <email>" or a bare email) into Brevo's sender shape.
function parseSender(value: string): { name?: string; email: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  if (match && match[2]) return { name: match[1] || undefined, email: match[2].trim() };
  return { email: value.trim() };
}
const sender = parseSender(env.emailFrom);

// Minimal escape so a user-supplied name can't inject markup into the email body.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

// Core sender: POSTs to Brevo, throwing on non-2xx (matches nodemailer's throw-on-failure).
async function sendEmail(to: string, subject: string, html: string, logCtx: Record<string, unknown> = {}): Promise<void> {
  if (!env.brevoApiKey) {
    log.warn({ to, subject, ...logCtx }, 'BREVO_API_KEY not set — skipping send, logging instead');
    return;
  }
  const res = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: { 'api-key': env.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    log.error({ to, status: res.status, body }, 'brevo email send failed');
    throw new Error(`Email send failed (${res.status})`);
  }
  log.info({ to }, 'email sent');
}

export async function sendVerificationCodeEmail(to: string, code: string): Promise<void> {
  await sendEmail(
    to,
    `${code} is your Pulse verification code`,
    `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Verify your email</h2>
        <p>Enter this code to finish creating your Pulse account. It expires in 10 minutes.</p>
        <p style="font-size:32px; font-weight:700; letter-spacing:6px; margin:16px 0;">${escapeHtml(code)}</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
    { code },
  );
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  await sendEmail(
    to,
    'Welcome to Pulse',
    `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Welcome to Pulse, ${escapeHtml(name)}!</h2>
        <p>Your account is ready. Sign in to start tracking your projects' health.</p>
        <p><a href="${env.frontendUrl}" style="display:inline-block; background:#111; color:#fff; padding:12px 20px; text-decoration:none; border-radius:6px;">Open Pulse</a></p>
        <p>If you didn't create this account, please let us know.</p>
      </div>
    `,
  );
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendEmail(
    to,
    'Reset your Pulse password',
    `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Reset your password</h2>
        <p>We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
        <p><a href="${resetUrl}" style="display:inline-block; background:#111; color:#fff; padding:12px 20px; text-decoration:none; border-radius:6px;">Reset password</a></p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
    { resetUrl },
  );
}

export async function sendProjectInviteEmail(
  to: string,
  inviteUrl: string,
  projectName?: string,
): Promise<void> {
  await sendEmail(
    to,
    projectName ? `You've been invited to ${projectName} on Pulse` : "You've been invited to Pulse",
    `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>You've been invited${projectName ? ` to <b>${escapeHtml(projectName)}</b>` : ''}</h2>
        <p>Create your account (or log in) to join the project. This invitation expires in 7 days.</p>
        <p><a href="${inviteUrl}" style="display:inline-block; background:#111; color:#fff; padding:12px 20px; text-decoration:none; border-radius:6px;">Accept invitation</a></p>
        <p>If you weren't expecting this, you can safely ignore this email.</p>
      </div>
    `,
    { inviteUrl },
  );
}

export async function sendSurveyEmail(to: string, name: string, surveyUrl: string): Promise<void> {
  await sendEmail(
    to,
    'Your team pulse survey is open',
    `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Hi ${escapeHtml(name)},</h2>
        <p>A short pulse survey is open for your project. Your response is anonymous.</p>
        <p><a href="${surveyUrl}" style="display:inline-block; background:#111; color:#fff; padding:12px 20px; text-decoration:none; border-radius:6px;">Take the survey</a></p>
      </div>
    `,
    { surveyUrl },
  );
}
