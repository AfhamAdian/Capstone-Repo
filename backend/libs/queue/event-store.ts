/**
 * Sync progress event emitter
 * Coordinates progress updates between worker and API for SSE streaming
 */

import { EventEmitter } from 'events';
import type { SyncProgressEvent, SyncCompletionEvent } from '@libs/sync/index.js';

/**
 * In-memory event store for SSE subscribers
 * TODO: In production, use Redis pub/sub or similar for multi-process coordination
 */
class EventStore extends EventEmitter {
  private listeners: Map<string, Set<(event: any) => void>> = new Map();

  /**
   * Subscribe to progress events for a session
   */
  subscribe(sessionId: string, callback: (event: any) => void): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set());
    }

    this.listeners.get(sessionId)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(sessionId);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  /**
   * Emit progress event to all subscribers for a session
   */
  emitProgress(event: SyncProgressEvent): void {
    const callbacks = this.listeners.get(event.jobId);
    if (callbacks) {
      callbacks.forEach((cb) => cb(event));
    }
  }

  /**
   * Emit completion event
   */
  emitCompletion(event: SyncCompletionEvent): void {
    const callbacks = this.listeners.get(event.jobId);
    if (callbacks) {
      callbacks.forEach((cb) => cb(event));
    }
  }
}

export const eventStore = new EventStore();
