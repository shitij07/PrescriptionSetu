/**
 * Upload Route Rate Limiting Integration Tests.
 * Authoritative sources: `BUILD_ORDER.md` Step 8, `PercriptionSetuMASTERPLAN.md` §26, §33, `SAFETY_INVARIANTS.md` SI-16.
 */

import request from 'supertest';
import type { Knex } from 'knex';
import { createApp } from '../../src/app';
import { getDb } from '../../src/db/connection';
import { FixtureOcrProvider } from '../../src/ocr/fixture-provider';
import { Logger } from '../../src/logging/logger';
import { InMemoryRateLimitStore } from '../../src/middleware/rate-limiter';

describe('POST /api/prescriptions/upload Rate Limiting Integration', () => {
  let db: Knex;
  let ocrProvider: FixtureOcrProvider;
  let capturedLogs: string[];
  let testLogger: Logger;
  let testPatientId: string;
  let testCaregiverId: string;

  beforeAll(async () => {
    db = getDb({
      client: 'pg',
      connection: process.env.TEST_DATABASE_URL || {
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT) || 5432,
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.TEST_PGDATABASE || 'prescriptionsetu_test',
      },
      pool: { min: 1, max: 2 },
    });
    ocrProvider = new FixtureOcrProvider();
  });

  beforeEach(async () => {
    capturedLogs = [];
    testLogger = new Logger({
      stream: {
        write: (msg: string) => {
          capturedLogs.push(msg);
        },
      },
    });

    await db('adherence_logs').delete();
    await db('reminders').delete();
    await db('medication_audit_events').delete();
    await db('medications').delete();
    await db('prescriptions').delete();
    await db('patient_caregivers').delete();
    await db('caregivers').delete();
    await db('patients').delete();

    const [patient] = await db('patients')
      .insert({ full_name: 'Rate Limit Patient', preferred_language: 'mr' })
      .returning('*');
    testPatientId = patient.id;

    const [caregiver] = await db('caregivers')
      .insert({ full_name: 'Rate Limit Caregiver', phone_number: '+919988776655' })
      .returning('*');
    testCaregiverId = caregiver.id;
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('rejects uploads exceeding rate limit with 429 and does NOT invoke OCR or insert DB rows', async () => {
    const rateLimitStore = new InMemoryRateLimitStore();
    const rateLimitOptions = {
      maxRequests: 2,
      windowMs: 60000,
      store: rateLimitStore,
      logger: testLogger,
    };

    const app = createApp(db, ocrProvider, undefined, testLogger, rateLimitOptions);

    const payload = {
      patient_id: testPatientId,
      caregiver_id: testCaregiverId,
      raw_text: 'Tab Metformin 500mg BD',
    };

    // 1st request -> 201 Created
    const res1 = await request(app).post('/api/prescriptions/upload').send(payload);
    expect(res1.status).toBe(201);

    // 2nd request -> 201 Created
    const res2 = await request(app).post('/api/prescriptions/upload').send(payload);
    expect(res2.status).toBe(201);

    // 3rd request -> 429 Too Many Requests
    const res3 = await request(app).post('/api/prescriptions/upload').send(payload);
    expect(res3.status).toBe(429);
    expect(res3.header['retry-after']).toBeDefined();
    expect(res3.body).toEqual({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many prescription upload requests. Please try again later.',
      },
    });

    // Verify DB contains exactly 2 prescriptions (the 3rd was blocked before DB insertion)
    const count = await db('prescriptions').count<{ count: string }>('id as count').first();
    expect(Number(count?.count)).toBe(2);

    // Verify structured logging contains 429 event without sensitive body/OCR text (SI-16)
    const combinedLogs = capturedLogs.join('\n');
    expect(combinedLogs).toContain('RATE_LIMIT_EXCEEDED');
    expect(combinedLogs).not.toContain('Metformin');
    expect(combinedLogs).not.toContain('Tab Metformin 500mg BD');
  });
});
