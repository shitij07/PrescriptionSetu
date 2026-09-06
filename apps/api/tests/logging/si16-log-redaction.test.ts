/**
 * SI-16 Sensitive Data Log Redaction & Structured Logging Tests.
 * Authoritative sources: `SAFETY_INVARIANTS.md` SI-16, `BUILD_ORDER.md` Step 8, `PercriptionSetuMASTERPLAN.md` §26, §33.
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { getDb } from '../../src/db/connection';
import { FixtureOcrProvider } from '../../src/ocr/fixture-provider';
import { Logger } from '../../src/logging/logger';
import { httpLogger } from '../../src/logging/http-middleware';
import type { Knex } from 'knex';

describe('SI-16 Sensitive Data Log Redaction & Structured Logging', () => {
  let capturedLogs: string[] = [];
  let logger: Logger;
  let customStream: { write: (msg: string) => void };

  const SENSITIVE_FIXTURES = {
    RAW_OCR_TEXT: 'Tab Metformin 500mg BD after meals 5 days',
    DRUG_NAME: 'Metformin',
    PATIENT_NAME: 'Ramesh S. Patil',
    PHONE_NUMBER: '+919876543210',
    RAW_REPLY_TEXT: 'होय घेतली पण चक्कर आली आणि उलटी झाली',
    SYMPTOM: 'चक्कर',
  };

  beforeEach(() => {
    capturedLogs = [];
    customStream = {
      write: (msg: string) => {
        capturedLogs.push(msg);
      },
    };
    logger = new Logger({ stream: customStream });
  });

  describe('Structured Logger Allow-List Key Filtering', () => {
    it('preserves allow-listed operational IDs and metadata', () => {
      logger.info('REMINDER_DISPATCHED', {
        prescription_id: '11111111-1111-1111-1111-111111111111',
        medication_id: '22222222-2222-2222-2222-222222222222',
        reminder_id: '33333333-3333-3333-3333-333333333333',
        patient_id: '44444444-4444-4444-4444-444444444444',
        caregiver_id: '55555555-5555-5555-5555-555555555555',
        attempt_count: 1,
        module: 'reminders',
        action: 'dispatch',
      });

      expect(capturedLogs).toHaveLength(1);
      const entry = JSON.parse(capturedLogs[0]);
      expect(entry.event).toBe('REMINDER_DISPATCHED');
      expect(entry.prescription_id).toBe('11111111-1111-1111-1111-111111111111');
      expect(entry.medication_id).toBe('22222222-2222-2222-2222-222222222222');
      expect(entry.reminder_id).toBe('33333333-3333-3333-3333-333333333333');
      expect(entry.patient_id).toBe('44444444-4444-4444-4444-444444444444');
      expect(entry.caregiver_id).toBe('55555555-5555-5555-5555-555555555555');
      expect(entry.attempt_count).toBe(1);
    });

    it('strictly strips sensitive health and personal keys', () => {
      logger.info('PRESCRIPTION_PARSED', {
        prescription_id: '11111111-1111-1111-1111-111111111111',
        raw_ocr_text: SENSITIVE_FIXTURES.RAW_OCR_TEXT,
        drug_name: SENSITIVE_FIXTURES.DRUG_NAME,
        full_name: SENSITIVE_FIXTURES.PATIENT_NAME,
        phone_number: SENSITIVE_FIXTURES.PHONE_NUMBER,
        raw_reply_text: SENSITIVE_FIXTURES.RAW_REPLY_TEXT,
        dose_amount: '1',
        payload: { body: 'Take Metformin' },
      });

      expect(capturedLogs).toHaveLength(1);
      const logLine = capturedLogs[0];
      const entry = JSON.parse(logLine);

      // Verify prescription_id is retained
      expect(entry.prescription_id).toBe('11111111-1111-1111-1111-111111111111');

      // Verify no sensitive fields exist on entry
      expect(entry.raw_ocr_text).toBeUndefined();
      expect(entry.drug_name).toBeUndefined();
      expect(entry.full_name).toBeUndefined();
      expect(entry.phone_number).toBeUndefined();
      expect(entry.raw_reply_text).toBeUndefined();
      expect(entry.payload).toBeUndefined();

      // Verify raw text literals NEVER appear anywhere in the output JSON string
      expect(logLine).not.toContain(SENSITIVE_FIXTURES.RAW_OCR_TEXT);
      expect(logLine).not.toContain(SENSITIVE_FIXTURES.DRUG_NAME);
      expect(logLine).not.toContain(SENSITIVE_FIXTURES.PATIENT_NAME);
      expect(logLine).not.toContain(SENSITIVE_FIXTURES.PHONE_NUMBER);
      expect(logLine).not.toContain(SENSITIVE_FIXTURES.RAW_REPLY_TEXT);
    });
  });

  describe('Error Object Sanitization', () => {
    it('sanitizes Error messages containing drug names or raw OCR fragments', () => {
      const sensitiveError = new Error(`Failed to process drug ${SENSITIVE_FIXTURES.DRUG_NAME} from ${SENSITIVE_FIXTURES.RAW_OCR_TEXT}`);
      logger.error('PROCESSING_ERROR', sensitiveError, {
        medication_id: '22222222-2222-2222-2222-222222222222',
        error_code: 'PARSING_FAILED',
      });

      expect(capturedLogs).toHaveLength(1);
      const logLine = capturedLogs[0];
      const entry = JSON.parse(logLine);

      expect(entry.event).toBe('PROCESSING_ERROR');
      expect(entry.error_code).toBe('PARSING_FAILED');
      expect(entry.medication_id).toBe('22222222-2222-2222-2222-222222222222');

      // Crucial: No sensitive substring in the log output
      expect(logLine).not.toContain(SENSITIVE_FIXTURES.DRUG_NAME);
      expect(logLine).not.toContain(SENSITIVE_FIXTURES.RAW_OCR_TEXT);
    });

    it('sanitizes Database/Knex SQL query errors containing parameter bindings', () => {
      const sqlError = new Error(`insert into "prescriptions" ("raw_ocr_text") values ('${SENSITIVE_FIXTURES.RAW_OCR_TEXT}') - duplicate key value`);
      logger.error('DATABASE_QUERY_ERROR', sqlError, {
        prescription_id: '11111111-1111-1111-1111-111111111111',
        error_code: 'DB_INSERT_FAILED',
      });

      expect(capturedLogs).toHaveLength(1);
      const logLine = capturedLogs[0];
      expect(logLine).not.toContain(SENSITIVE_FIXTURES.RAW_OCR_TEXT);
    });
  });

  describe('Express HTTP Request Logger Middleware', () => {
    let db: Knex;
    let app: any;
    let ocrProvider: FixtureOcrProvider;

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

    let testPatientId: string;
    let testCaregiverId: string;

    beforeEach(async () => {
      app = createApp(db, ocrProvider, undefined, logger);

      const [patient] = await db('patients')
        .insert({ full_name: 'Logging Test Patient', phone_number: '+919876543210', preferred_language: 'mr' })
        .returning('*');
      testPatientId = patient.id;

      const [caregiver] = await db('caregivers')
        .insert({ full_name: 'Logging Test Caregiver', phone_number: '+919988776655' })
        .returning('*');
      testCaregiverId = caregiver.id;
    });

    afterEach(async () => {
      await db('adherence_logs').delete();
      await db('reminders').delete();
      await db('medication_audit_events').delete();
      await db('medications').delete();
      await db('prescriptions').delete();
      await db('patient_caregivers').delete();
      await db('caregivers').delete();
      await db('patients').delete();
    });

    afterAll(async () => {
      await db.destroy();
    });

    it('logs HTTP requests with method, path, status, and duration without logging request body', async () => {
      const res = await request(app)
        .post('/api/prescriptions/upload')
        .send({
          patient_id: testPatientId,
          caregiver_id: testCaregiverId,
          raw_text: SENSITIVE_FIXTURES.RAW_OCR_TEXT,
        });

      expect(res.status).toBe(201);
      expect(capturedLogs.length).toBeGreaterThanOrEqual(1);

      const combinedLogs = capturedLogs.join('\n');
      // Must contain HTTP operational metadata
      expect(combinedLogs).toContain('/api/prescriptions/upload');
      expect(combinedLogs).toContain('POST');

      // Must NOT contain sensitive OCR text, drug name, or body
      expect(combinedLogs).not.toContain(SENSITIVE_FIXTURES.RAW_OCR_TEXT);
      expect(combinedLogs).not.toContain(SENSITIVE_FIXTURES.DRUG_NAME);
    });

    it('logs adherence webhook replies with zero patient symptom or reply text in logs', async () => {
      const res = await request(app)
        .post('/api/adherence/reply')
        .send({
          raw_reply_text: SENSITIVE_FIXTURES.RAW_REPLY_TEXT,
        });

      expect(res.status).toBe(201);
      const combinedLogs = capturedLogs.join('\n');

      expect(combinedLogs).toContain('/api/adherence/reply');
      expect(combinedLogs).not.toContain(SENSITIVE_FIXTURES.RAW_REPLY_TEXT);
      expect(combinedLogs).not.toContain(SENSITIVE_FIXTURES.SYMPTOM);
    });
  });
});
