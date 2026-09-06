/**
 * Express Application Factory.
 * Authoritative sources: `PercriptionSetuMASTERPLAN.md` §19, `SAFETY_INVARIANTS.md` SI-16.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import type { Knex } from 'knex';
import type { OcrProvider } from './ocr/types';
import type { MessageProvider } from './delivery/types';
import { OcrError } from './ocr/types';
import { Logger, defaultLogger } from './logging/logger';
import { httpLogger } from './logging/http-middleware';
import { createPrescriptionsRouter } from './routes/prescriptions';
import { createMedicationsRouter } from './routes/medications';
import { createAdherenceRouter } from './routes/adherence';
import { createPatientsRouter } from './routes/patients';
import { createRateLimiter, RateLimitOptions } from './middleware/rate-limiter';
import { createCorsMiddleware, CorsOptions } from './middleware/cors';

export function createApp(
  db: Knex,
  ocrProvider: OcrProvider,
  messageProvider?: MessageProvider,
  loggerInstance: Logger = defaultLogger,
  rateLimitOptions?: RateLimitOptions,
  corsOptions?: CorsOptions,
): Express {
  const app = express();

  app.use(createCorsMiddleware(corsOptions));
  app.use(express.json());
  app.use(httpLogger(loggerInstance));

  const uploadLimiter = createRateLimiter({
    logger: loggerInstance,
    ...rateLimitOptions,
  });

  // Mount API routers
  app.use('/api/prescriptions', createPrescriptionsRouter(db, ocrProvider, uploadLimiter));
  app.use('/api/medications', createMedicationsRouter(db));
  app.use('/api/adherence', createAdherenceRouter(db, messageProvider));
  app.use('/api/patients', createPatientsRouter(db, loggerInstance));

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  // Centralized Sanitized Error Handler (SI-16)
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof OcrError) {
      const statusCode = err.code === 'FIXTURE_NOT_FOUND' ? 404 : 400;
      return res.status(statusCode).json({
        error: {
          code: err.code,
          message: err.message,
        },
      });
    }

    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({
        error: {
          code: 'MALFORMED_JSON',
          message: 'Invalid JSON payload received',
        },
      });
    }

    // Structured Sanitized Log of 500 error (SI-16: Never leak stack traces, queries, or user inputs)
    loggerInstance.error('INTERNAL_SERVER_ERROR', err, {
      path: req.path,
      http_method: req.method,
      status_code: 500,
    });

    // Generic Internal Error (SI-16: Never leak stack traces, SQL queries, or sensitive data)
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected internal error occurred',
      },
    });
  });

  return app;
}
