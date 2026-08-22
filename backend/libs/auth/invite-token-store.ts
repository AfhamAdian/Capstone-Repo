// Redis-backed single-use project-invite tokens (7d TTL). Token travels in the emailed registration link.

import { randomBytes } from 'node:crypto';
import { Redis } from 'ioredis';

const INVITE_KEY_PREFIX = 'auth:invite:';
const INVITE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface InvitePayload {
  email: string;
  companyId: number;
  projectId: number;
}

class InviteTokenStore {
  private client: Redis | null = null;

  private getClient(): Redis {
    if (!this.client) {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        throw new Error('REDIS_URL is required for the invite token store');
      }
      this.client = new Redis(redisUrl);
    }
    return this.client;
  }

  private getKey(token: string): string {
    return `${INVITE_KEY_PREFIX}${token}`;
  }

  private parse(raw: string): InvitePayload | null {
    try {
      return JSON.parse(raw) as InvitePayload;
    } catch {
      return null;
    }
  }

  // Create an invite token for an email/project; returns the token to embed in the link.
  async create(payload: InvitePayload): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.getClient().set(this.getKey(token), JSON.stringify(payload), 'EX', INVITE_TTL_SECONDS);
    return token;
  }

  // Non-destructive read: for prefilling the registration form and validating before commit.
  async get(token: string): Promise<InvitePayload | null> {
    const raw = await this.getClient().get(this.getKey(token));
    return raw ? this.parse(raw) : null;
  }

  // Atomically consume a token: returns its payload and deletes it, or null if invalid/expired.
  async consume(token: string): Promise<InvitePayload | null> {
    const raw = await this.getClient().getdel(this.getKey(token));
    return raw ? this.parse(raw) : null;
  }
}

export const inviteTokenStore = new InviteTokenStore();
