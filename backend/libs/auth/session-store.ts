// Redis-backed session store. Session id lives in an httpOnly cookie; deleting the key revokes it.

import { randomBytes } from 'node:crypto';
import { Redis } from 'ioredis';

export interface SessionData {
  userId: number;
  companyId: number;
  email: string;
  role: 'admin' | 'member';
}

const SESSION_KEY_PREFIX = 'auth:session:';
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 1 day

class SessionStore {
  private client: Redis | null = null;

  private getClient(): Redis {
    if (!this.client) {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        throw new Error('REDIS_URL is required for the session store');
      }
      this.client = new Redis(redisUrl);
    }
    return this.client;
  }

  private getKey(sessionId: string): string {
    return `${SESSION_KEY_PREFIX}${sessionId}`;
  }

  // Create a session; returns the id to store in the cookie.
  async create(data: SessionData): Promise<string> {
    const sessionId = randomBytes(32).toString('hex');

    await this.getClient().set(
      this.getKey(sessionId),
      JSON.stringify(data),
      'EX',
      SESSION_TTL_SECONDS,
    );

    return sessionId;
  }

  // Look up a session and refresh its TTL (rolling expiry).
  async get(sessionId: string): Promise<SessionData | null> {
    const key = this.getKey(sessionId);
    const raw = await this.getClient().get(key);

    if (!raw) {
      return null;
    }

    try {
      const data = JSON.parse(raw) as SessionData;
      await this.getClient().expire(key, SESSION_TTL_SECONDS);
      return data;
    } catch {
      await this.getClient().del(key);
      return null;
    }
  }

  // Revoke a session (logout).
  async destroy(sessionId: string): Promise<void> {
    await this.getClient().del(this.getKey(sessionId));
  }

  // Cookie max-age should match the session TTL.
  get maxAgeMs(): number {
    return SESSION_TTL_SECONDS * 1000;
  }
}

export const sessionStore = new SessionStore();
