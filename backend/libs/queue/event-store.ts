/**
 * Sync progress event emitter
 * Coordinates progress updates between worker and API for SSE streaming
 */

import { Redis } from 'ioredis';
import type { SyncProgressEvent, SyncCompletionEvent } from '@libs/sync/index.js';

/**
 * Redis-backed event store for SSE subscribers
 */
class EventStore {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private connectPromise: Promise<void> | null = null;
  private readonly callbacksByChannel = new Map<
    string,
    Set<(event: SyncProgressEvent | SyncCompletionEvent) => void>
  >();

  private readonly channelPrefix = 'sync:session:';
  private readonly completionKeyPrefix = 'sync:last:';
  private readonly completionTtlSeconds = 3600;

  private async ensureConnected(): Promise<void> {
    if (this.publisher && this.subscriber) {
      return;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.connectClients();
    }

    await this.connectPromise;
  }

  private async connectClients(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL is required for Redis Pub/Sub event store');
    }

    this.publisher = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);

    this.subscriber.on('message', (channel: string, message: string) => {
      const callbacks = this.callbacksByChannel.get(channel);
      if (!callbacks || callbacks.size === 0) {
        return;
      }

      try {
        const event = JSON.parse(message) as SyncProgressEvent | SyncCompletionEvent;
        callbacks.forEach((callback) => callback(event));
      } catch {
        // Ignore malformed payloads
      }
    });
  }

  private getChannel(sessionId: string): string {
    return `${this.channelPrefix}${sessionId}`;
  }

  private getCompletionKey(sessionId: string): string {
    return `${this.completionKeyPrefix}${sessionId}`;
  }

  /**
   * Subscribe to progress events for a session
   */
  async subscribe(
    sessionId: string,
    callback: (event: SyncProgressEvent | SyncCompletionEvent) => void,
  ): Promise<() => Promise<void>> {
    await this.ensureConnected();

    const channel = this.getChannel(sessionId);
    if (!this.callbacksByChannel.has(channel)) {
      this.callbacksByChannel.set(channel, new Set());
      await this.subscriber!.subscribe(channel);
    }

    this.callbacksByChannel.get(channel)!.add(callback);

    return async () => {
      const callbacks = this.callbacksByChannel.get(channel);
      if (!callbacks) {
        return;
      }

      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.callbacksByChannel.delete(channel);
        await this.subscriber!.unsubscribe(channel);
      }
    };
  }

  /**
   * Emit progress event to all subscribers for a session
   */
  async emitProgress(event: SyncProgressEvent): Promise<void> {
    await this.ensureConnected();
    await this.publisher!.publish(this.getChannel(event.sessionId), JSON.stringify(event));
  }

  /**
   * Emit completion event
   */
  async emitCompletion(event: SyncCompletionEvent): Promise<void> {
    await this.ensureConnected();

    const payload = JSON.stringify(event);
    await this.publisher!.publish(this.getChannel(event.sessionId), payload);
    await this.publisher!.set(
      this.getCompletionKey(event.sessionId),
      payload,
      'EX',
      this.completionTtlSeconds,
    );
  }

  async getLastCompletion(sessionId: string): Promise<SyncCompletionEvent | null> {
    await this.ensureConnected();

    const raw = await this.publisher!.get(this.getCompletionKey(sessionId));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as SyncCompletionEvent;
    } catch {
      return null;
    }
  }
}

export const eventStore = new EventStore();
