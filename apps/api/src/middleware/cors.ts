/**
 * Cross-Origin Resource Sharing (CORS) Middleware.
 * Configured specifically for the Caregiver Dashboard origin (http://localhost:3001).
 * Authoritative sources: `SAFETY_INVARIANTS.md`, `PercriptionSetuMASTERPLAN.md` §18.5.
 */

import type { Request, Response, NextFunction } from 'express';

export interface CorsOptions {
  allowedOrigins?: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  maxAge?: number;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

export function createCorsMiddleware(options: CorsOptions = {}) {
  const envOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : process.env.DASHBOARD_URL
    ? [process.env.DASHBOARD_URL.trim()]
    : [];

  const allowedOrigins =
    options.allowedOrigins || (envOrigins.length > 0 ? envOrigins : DEFAULT_ALLOWED_ORIGINS);
  const allowedMethods =
    options.allowedMethods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
  const allowedHeaders =
    options.allowedHeaders || ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'];
  const maxAge = options.maxAge ?? 86400;

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
      res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
      res.setHeader('Access-Control-Max-Age', maxAge.toString());
    }

    if (req.method === 'OPTIONS') {
      if (origin && allowedOrigins.includes(origin)) {
        res.status(204).end();
        return;
      }
      res.status(204).end();
      return;
    }

    next();
  };
}
