/**
 * Shared Octokit factory for every GitHub-backed connector.
 *
 * Rate limiting is handled by @octokit/plugin-throttling, which reads the
 * `x-ratelimit-*` headers off responses already in flight. That replaces the
 * old per-connector `checkRateLimit()` preflight, which spent a full round trip
 * on `GET /rate_limit` before each call it guarded - roughly half of all the
 * REST traffic these connectors produced - and which didn't actually throttle:
 * concurrent callers each observed "remaining < 100" independently and each
 * slept in parallel.
 *
 * Instances are cached per token so that the `github` and `github-actions`
 * connectors - which run concurrently against one shared token budget - share
 * a single limiter instead of each keeping their own view of it.
 */

import { createHash } from 'node:crypto';
import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { retry } from '@octokit/plugin-retry';
import { logger } from '@libs/logger.js';

const log = logger.child({ component: 'github-octokit' });

// Waiting out a primary rate-limit reset can mean parking for the best part of
// an hour, and these calls run inside a queue job holding its lock. Past this
// point we let the request fail so the tool is marked failed and the worker slot
// is released, rather than stalling the queue.
const MAX_RATE_LIMIT_WAIT_SECONDS = 60;
const MAX_RATE_LIMIT_RETRIES = 2;

// Bounds the cache in a long-lived worker that syncs many workspaces. Instances
// are cheap; this only stops the map growing without limit.
const MAX_CACHED_CLIENTS = 32;

const clientsByTokenHash = new Map<string, Octokit>();

const ThrottledOctokit = Octokit.plugin(throttling, retry);

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createClient(token: string): Octokit {
  return new ThrottledOctokit({
    auth: token,
    throttle: {
      onRateLimit: (retryAfter: number, options: any, _octokit: unknown, retryCount: number) => {
        log.warn(
          { method: options.method, url: options.url, retryAfter, retryCount },
          'github primary rate limit hit',
        );
        return retryAfter <= MAX_RATE_LIMIT_WAIT_SECONDS && retryCount < MAX_RATE_LIMIT_RETRIES;
      },
      onSecondaryRateLimit: (retryAfter: number, options: any, _octokit: unknown, retryCount: number) => {
        log.warn(
          { method: options.method, url: options.url, retryAfter, retryCount },
          'github secondary rate limit hit',
        );
        return retryAfter <= MAX_RATE_LIMIT_WAIT_SECONDS && retryCount < MAX_RATE_LIMIT_RETRIES;
      },
    },
  });
}

/**
 * Get the shared Octokit client for a token, creating it on first use.
 * Callers must not mutate the returned instance - it is shared.
 */
export function getGitHubClient(token: string): Octokit {
  const key = hashToken(token);

  const cached = clientsByTokenHash.get(key);
  if (cached) {
    return cached;
  }

  if (clientsByTokenHash.size >= MAX_CACHED_CLIENTS) {
    const oldestKey = clientsByTokenHash.keys().next().value;
    if (oldestKey !== undefined) {
      clientsByTokenHash.delete(oldestKey);
    }
  }

  const client = createClient(token);
  clientsByTokenHash.set(key, client);
  return client;
}
