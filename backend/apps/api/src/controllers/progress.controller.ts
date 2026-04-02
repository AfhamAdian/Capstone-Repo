/**
 * SSE (Server-Sent Events) Controller
 * Streams sync progress updates to the frontend
 */

import type { Request, Response } from 'express';
import { eventStore } from '@libs/queue/index.js';

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

  // Set SSE headers
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial connection message
  response.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

  // TODO: In production, you might check if the session has an active sync job
  // and only subscribe if valid credentials/authorization are provided

  // Subscribe to progress events for this session
  const unsubscribe = eventStore.subscribe(sessionId, (event) => {
    // Send event as SSE
    response.write(`data: ${JSON.stringify(event)}\n\n`);

    // If this is a completion event, close the stream after a brief delay
    if (event.status === 'success' || event.status === 'partial' || event.status === 'failed') {
      setTimeout(() => {
        response.end();
      }, 1000);
    }
  });

  // Handle client disconnect
  request.on('close', () => {
    unsubscribe();
    response.end();
  });

  response.on('error', () => {
    unsubscribe();
  });
}
