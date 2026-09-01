// Redis-backed email-verification codes for signup. A 6-digit code (10-min TTL) is emailed;
// verifying it sets a short-lived "verified" flag that registration consumes.

import { randomInt } from 'node:crypto';
import { Redis } from 'ioredis';

const CODE_PREFIX = 'auth:emailverify:code:';
const OK_PREFIX = 'auth:emailverify:ok:';
const CODE_TTL_SECONDS = 10 * 60; // 10 minutes to enter the code
const OK_TTL_SECONDS = 30 * 60; // 30-minute window to finish signup after verifying

class EmailVerificationStore {
  private client: Redis | null = null;

  private getClient(): Redis {
    if (!this.client) {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        throw new Error('REDIS_URL is required for the email verification store');
      }
      this.client = new Redis(redisUrl);
    }
    return this.client;
  }

  // Emails are matched case-insensitively so "A@x.com" and "a@x.com" resolve to the same code.
  private norm(email: string): string {
    return email.trim().toLowerCase();
  }

  // Generate + store a 6-digit code for an email; returns the code to email.
  async issueCode(email: string): Promise<string> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.getClient().set(`${CODE_PREFIX}${this.norm(email)}`, code, 'EX', CODE_TTL_SECONDS);
    return code;
  }

  // Check a submitted code; on match, delete it and mark the email verified. Returns success.
  async verifyCode(email: string, code: string): Promise<boolean> {
    const key = `${CODE_PREFIX}${this.norm(email)}`;
    const stored = await this.getClient().get(key);
    if (!stored || stored !== code.trim()) return false;
    await this.getClient().del(key);
    await this.getClient().set(`${OK_PREFIX}${this.norm(email)}`, '1', 'EX', OK_TTL_SECONDS);
    return true;
  }

  // True if this email was verified recently (non-consuming — used as a registration gate).
  async isVerified(email: string): Promise<boolean> {
    return (await this.getClient().get(`${OK_PREFIX}${this.norm(email)}`)) === '1';
  }

  // Clear the verified flag after a successful signup so it can't be reused.
  async consumeVerified(email: string): Promise<void> {
    await this.getClient().del(`${OK_PREFIX}${this.norm(email)}`);
  }
}

export const emailVerificationStore = new EmailVerificationStore();
