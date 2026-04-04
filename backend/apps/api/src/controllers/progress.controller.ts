/**
 * SSE (Server-Sent Events) Controller
 * Streams sync progress updates to the frontend
 */

import type { Request, Response } from 'express';
import { eventStore } from '@libs/queue/index.js';
import type { SyncCompletionEvent, SyncProgressEvent } from '@libs/sync/index.js';

type SyncStreamEvent = SyncProgressEvent | SyncCompletionEvent;

type StreamState = {
  closed: boolean;
  unsubscribe: (() => Promise<void>) | null;
};

// Set all required headers for Server-Sent Events.
function setSseHeaders(response: Response): void {
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('Access-Control-Allow-Origin', '*');
}

// Send one SSE message to the connected client.
function sendSseMessage(response: Response, payload: unknown): void {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// Check if an event status means the sync is fully done.
function isTerminalStatus(status?: string): boolean {
  return status === 'success' || status === 'partial' || status === 'failed';
}

// Close SSE cleanly by unsubscribing and ending the response.
async function cleanupStream(response: Response, state: StreamState): Promise<void> {
  if (state.closed) {
    return;
  }

  state.closed = true;

  if (state.unsubscribe) {
    await state.unsubscribe();
    state.unsubscribe = null;
  }

  if (!response.writableEnded) {
    response.end();
  }
}

// Subscribe to Redis pub/sub and forward all events to SSE.
async function subscribeToSession(
  sessionId: string,
  response: Response,
  state: StreamState,
): Promise<void> {
  const lastCompletion = await eventStore.getLastCompletion(sessionId);
  if (lastCompletion) {
    sendSseMessage(response, lastCompletion);
    await cleanupStream(response, state);
    return;
  }

  state.unsubscribe = await eventStore.subscribe(sessionId, (event: SyncStreamEvent) => {
    sendSseMessage(response, event);

    if (isTerminalStatus(event.status)) {
      setTimeout(() => {
        void cleanupStream(response, state);
      }, 1000);
    }
  });
}

/**
 * GET /api/v1/sync/progress/:sessionId
 * Open an SSE stream to receive sync progress updates
 */
export function streamSyncProgress(request: Request, response: Response): void {
  const { sessionId } = request.params;

  if (!sessionId) {
    response.status(400).json({ message: 'sessionId is required' });
    return;
  }

  setSseHeaders(response);

  sendSseMessage(response, { type: 'connected', sessionId });

  // TODO: In production, you might check if the session has an active sync job
  // and only subscribe if valid credentials/authorization are provided

  const streamState: StreamState = {
    closed: false,
    unsubscribe: null,
  };

  void (async () => {
    try {
      await subscribeToSession(sessionId, response, streamState);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to subscribe to progress stream';
      sendSseMessage(response, { type: 'error', message });
      await cleanupStream(response, streamState);
    }
  })();

  // Handle client disconnect
  request.on('close', () => {
    void cleanupStream(response, streamState);
  });

  response.on('error', () => {
    void cleanupStream(response, streamState);
  });
}
