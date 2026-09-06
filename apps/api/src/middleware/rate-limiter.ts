/**
 * Sliding Window In-Memory Rate Limiter Middleware.
 * Authoritative sources: `BUILD_ORDER.md` Step 8, `PercriptionSetuMASTERPLAN.md` §26, §33, `SAFETY_INVARIANTS.md` SI-16.
 */

import type { Request, Response, NextFunction } from 'express';
import { Logger, defaultLogger } from '../logging/logger';

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (req: Request) => string;
  store?: RateLimitStore;
  logger?: Logger;
}

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ totalHits: number; oldestTimestamp: number }>;
  reset(key?: string): Promise<void>;
}

/**
 * Pure in-memory sliding-window store with automatic timestamp pruning.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private hits: Map<string, number[]> = new Map();

  async increment(key: string, windowMs: number): Promise<{ totalHits: number; oldestTimestamp: number }> {
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = this.hits.get(key) || [];
    // Evict expired hits outside window
    timestamps = timestamps.filter((t) => t > windowStart);

    // Record current hit
    timestamps.push(now);
    this.hits.set(key, timestamps);

    return {
      totalHits: timestamps.length,
      oldestTimestamp: timestamps[0] || now,
    };
  }

  async reset(key?: string): Promise<void> {
    if (key) {
      this.hits.delete(key);
    } else {
      this.hits.clear();
    }
  }
}

const defaultStore = new InMemoryRateLimitStore();

/**
 * Factory creating rate-limiting Express middleware.
 */
export function createRateLimiter(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs || 60 * 1000; // default 1 minute
  const maxRequests = options.maxRequests || 10; // default 10 requests / min
  const store = options.store || defaultStore;
  const logger = options.logger || defaultLogger;

  const keyGenerator =
    options.keyGenerator ||
    ((req: Request) => {
      return (
        (req.headers?.['x-forwarded-for'] as string) ||
        req.ip ||
        req.socket?.remoteAddress ||
        'unknown-client'
      );
    });

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const clientKey = keyGenerator(req);
      const { totalHits, oldestTimestamp } = await store.increment(clientKey, windowMs);

      if (totalHits > maxRequests) {
        const now = Date.now();
        const retryAfterSeconds = Math.max(1, Math.ceil((oldestTimestamp + windowMs - now) / 1000));

        res.setHeader('Retry-After', retryAfterSeconds);

        // Structured SI-16 safe log (zero PHI or request body)
        logger.warn('RATE_LIMIT_EXCEEDED', {
          http_method: req.method,
          path: req.baseUrl + req.path,
          status_code: 429,
          action: 'rate_limit_throttle',
        });

        res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many prescription upload requests. Please try again later.',
          },
        });
        return;
      }

      next();
    } catch (err) {
      // Fail open if rate limiter fails to prevent blocking legitimate clinical traffic
      logger.error('RATE_LIMITER_ERROR', err);
      next();
    }
  };
}
