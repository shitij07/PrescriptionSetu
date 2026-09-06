/**
 * Adherence API Routes Integration Tests.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 7, `PercriptionSetuMASTERPLAN.md` §18.9, `SAFETY_INVARIANTS.md` SI-14, SI-15, SI-16.
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { getDb } from '../../src/db/connection';
import { FixtureOcrProvider } from '../../src/ocr/fixture-provider';
import { ConsoleProvider } from '../../src/delivery/console-provider';
import type { Knex } from 'knex';

describe('Adherence API Routes (/api/adherence)', () => {
  let db: Knex;
  let app: any;
  let ocrProvider: FixtureOcrProvider;
  let consoleProvider: ConsoleProvider;
  let testPatientId: string;
  let testCaregiverId: string;
  let testPrescriptionId: string;
  let testMedicationId: string;
  let testReminderId: string;

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
    consoleProvider = new ConsoleProvider();
    app = createApp(db, ocrProvider, consoleProvider);
  });

  beforeEach(async () => {
    consoleProvider.clear();

    const [patient] = await db('patients')
      .insert({ full_name: 'Adherence API Patient', phone_number: '+919876543210', preferred_language: 'mr' })
      .returning('*');
    testPatientId = patient.id;

    const [caregiver] = await db('caregivers')
      .insert({ full_name: 'Adherence API Caregiver', phone_number: '+919988776655' })
      .returning('*');
    testCaregiverId = caregiver.id;

    await db('patient_caregivers').insert({
      patient_id: testPatientId,
      caregiver_id: testCaregiverId,
      role: 'adherence_recipient',
    });

    const [prescription] = await db('prescriptions')
      .insert({ patient_id: testPatientId, status: 'verified' })
      .returning('*');
    testPrescriptionId = prescription.id;

    const [medication] = await db('medications')
      .insert({
        prescription_id: testPrescriptionId,
        drug_name: 'Amlodipine 5mg',
        verification_status: 'confirmed',
        lifecycle_state: 'active',
        schedule_derivable: true,
        frequency_code: 'ONCE_DAILY',
      })
      .returning('*');
    testMedicationId = medication.id;

    const [reminder] = await db('reminders')
      .insert({
        medication_id: testMedicationId,
        scheduled_time: new Date(),
        status: 'sent',
        payload: {
          type: 'rendered_text',
          body: 'Amlodipine reminder',
          language: 'en',
        },
      })
      .returning('*');
    testReminderId = reminder.id;
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

  describe('POST /api/adherence/reply', () => {
    it('successfully classifies and records a taken reply', async () => {
      const response = await request(app)
        .post('/api/adherence/reply')
        .send({
          reminder_id: testReminderId,
          raw_reply_text: 'yes, taken',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.adherence_log.classification).toBe('taken');
      expect(response.body.data.adherence_log.excluded_from_stats).toBe(false);
      expect(response.body.data.escalation_dispatched).toBe(false);
    });

    it('triggers caregiver escalation for needs_attention reply', async () => {
      const response = await request(app)
        .post('/api/adherence/reply')
        .send({
          reminder_id: testReminderId,
          raw_reply_text: 'Yes took it but severe headache and dizziness',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.adherence_log.classification).toBe('needs_attention');
      expect(response.body.data.adherence_log.excluded_from_stats).toBe(true);
      expect(response.body.data.escalation_dispatched).toBe(true);

      // Verify message provider received caregiver notification
      expect(consoleProvider.sentMessages).toHaveLength(1);
      expect(consoleProvider.sentMessages[0].destination).toBe('+919988776655');
    });

    it('returns 400 when raw_reply_text is missing or empty', async () => {
      const response = await request(app)
        .post('/api/adherence/reply')
        .send({
          reminder_id: testReminderId,
          raw_reply_text: '',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('RAW_REPLY_TEXT_REQUIRED');
    });
  });

  describe('GET /api/adherence/medication/:id', () => {
    it('returns historical adherence logs for a specific medication', async () => {
      await request(app)
        .post('/api/adherence/reply')
        .send({ medication_id: testMedicationId, raw_reply_text: 'yes' });

      await request(app)
        .post('/api/adherence/reply')
        .send({ medication_id: testMedicationId, raw_reply_text: 'no, missed' });

      const response = await request(app).get(`/api/adherence/medication/${testMedicationId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].classification).toBeDefined();
    });
  });

  describe('GET /api/adherence/patient/:id', () => {
    it('returns patient adherence summary strictly excluding needs_attention from adherence rate calculation', async () => {
      // 2 taken, 1 missed, 1 needs_attention
      await request(app).post('/api/adherence/reply').send({ medication_id: testMedicationId, raw_reply_text: 'yes' });
      await request(app).post('/api/adherence/reply').send({ medication_id: testMedicationId, raw_reply_text: 'done' });
      await request(app).post('/api/adherence/reply').send({ medication_id: testMedicationId, raw_reply_text: 'missed' });
      await request(app).post('/api/adherence/reply').send({ medication_id: testMedicationId, raw_reply_text: 'stopped medication' });

      const response = await request(app).get(`/api/adherence/patient/${testPatientId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.total_responses).toBe(4);
      expect(response.body.data.taken_count).toBe(2);
      expect(response.body.data.missed_count).toBe(1);
      expect(response.body.data.needs_attention_count).toBe(1);
      // Countable events = 2 taken + 1 missed = 3. 2 / 3 = 67%
      expect(response.body.data.total_countable_events).toBe(3);
      expect(response.body.data.adherence_rate_percentage).toBe(67);
    });
  });
});
