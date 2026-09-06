/**
 * Application HTTP Server Entrypoint.
 */

import { createApp } from './app';
import { getDb } from './db/connection';
import { FixtureOcrProvider } from './ocr/fixture-provider';
import { defaultLogger } from './logging/logger';

const PORT = Number(process.env.PORT) || 3000;

async function startServer(): Promise<void> {
  const db = getDb();
  const ocrProvider = new FixtureOcrProvider();

  const app = createApp(db, ocrProvider, undefined, defaultLogger);

  app.listen(PORT, () => {
    // SI-16 compliant startup log
    defaultLogger.info('SERVER_STARTED', {
      action: 'listen',
      status_code: PORT,
    });
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    defaultLogger.error('SERVER_START_FAILED', err);
    process.exit(1);
  });
}
