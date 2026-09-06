/**
 * Express HTTP Request / Response Logger Middleware (SI-16).
 * Logs strictly operational metadata: method, path, status, duration. Never logs request/response bodies or sensitive headers.
 */

import type { Request, Response, NextFunction } from 'express';
import { Logger, defaultLogger } from './logger';

export function httpLogger(loggerInstance: Logger = defaultLogger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      const path = req.originalUrl || req.baseUrl + req.path || req.path;

      loggerInstance.info('HTTP_REQUEST', {
        http_method: req.method,
        path: path.split('?')[0], // strip raw query string to prevent query parameter leaks
        status_code: res.statusCode,
        duration_ms: durationMs,
      });
    });

    next();
  };
}
