// Redis-backed single-use password-reset tokens (1h TTL). Token travels in the emailed reset link.

import { randomBytes } from 'node:crypto';
import { Redis } from 'ioredis';

const RESET_KEY_PREFIX = 'auth:reset:';
const RESET_TTL_SECONDS = 60 * 60; // 1 hour

class ResetTokenStore {
  private client: Redis | null = null;

  private getClient(): Redis {
    if (!this.client) {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        throw new Error('REDIS_URL is required for the reset token store');
      }
      this.client = new Redis(redisUrl);
    }
    return this.client;
  }

  private getKey(token: string): string {
    return `${RESET_KEY_PREFIX}${token}`;
  }

  // Create a single-use reset token for a user; returns the token to embed in the link.
  async create(userId: number): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.getClient().set(this.getKey(token), String(userId), 'EX', RESET_TTL_SECONDS);
    return token;
  }

  // Atomically consume a token: returns its userId and deletes it, or null if invalid/expired.
  async consume(token: string): Promise<number | null> {
    const raw = await this.getClient().getdel(this.getKey(token));
    if (!raw) {
      return null;
    }
    const userId = Number(raw);
    return Number.isFinite(userId) ? userId : null;
  }
}

export const resetTokenStore = new ResetTokenStore();
