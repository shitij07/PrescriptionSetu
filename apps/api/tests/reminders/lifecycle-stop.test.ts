/**
 * Transactional Medication Stop & Lifecycle Integration Tests (SI-10, SI-11, SI-12, SI-14).
 * Authoritative sources: `SAFETY_INVARIANTS.md` SI-10, SI-11, SI-12, SI-14, `PercriptionSetuMASTERPLAN.md` §18.10, `docs/SCHEMA.md` §2.6, §9.
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { getDb } from '../../src/db/connection';
import { FixtureOcrProvider } from '../../src/ocr/fixture-provider';
import type { Knex } from 'knex';
import type { ReminderPayload } from '../../src/domain/types';

describe('Transactional Medication Stop & Lifecycle (SI-10, SI-11)', () => {
  let db: Knex;
  let app: any;
  let ocrProvider: FixtureOcrProvider;
  let testPatientId: string;
  let testCaregiverId: string;
  let testPrescriptionId: string;

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
    app = createApp(db, ocrProvider);

    const [patient] = await db('patients')
      .insert({ full_name: 'Lifecycle Stop Patient', preferred_language: 'mr' })
      .returning('*');
    testPatientId = patient.id;

    const [caregiver] = await db('caregivers')
      .insert({ full_name: 'Lifecycle Stop Caregiver' })
      .returning('*');
    testCaregiverId = caregiver.id;

    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
        uploaded_by: testCaregiverId,
        raw_ocr_text: 'Tab Metformin 500mg BD',
        status: 'verified',
        verified_by: testCaregiverId,
        verified_at: new Date(),
      })
      .returning('*');
    testPrescriptionId = prescription.id;
  });

  afterAll(async () => {
    if (db) {
      const pRows = await db('prescriptions').where({ patient_id: testPatientId }).select('id');
      const pIds = pRows.map((p: any) => p.id);
      if (pIds.length > 0) {
        const mRows = await db('medications').whereIn('prescription_id', pIds).select('id');
        const mIds = mRows.map((m: any) => m.id);
        if (mIds.length > 0) {
          await db('reminders').whereIn('medication_id', mIds).del();
          await db('medication_audit_events').whereIn('medication_id', mIds).del();
        }
        await db('medications').whereIn('prescription_id', pIds).del();
        await db('prescriptions').whereIn('id', pIds).del();
      }
      await db('caregivers').where({ id: testCaregiverId }).del();
      await db('patients').where({ id: testPatientId }).del();
      await db.destroy();
    }
  });

  it('1. stops an active medication and cancels all pending reminders atomically (SI-10, SI-11)', async () => {
    const [medication] = await db('medications')
      .insert({
        prescription_id: testPrescriptionId,
        drug_name: 'Metformin',
        frequency_code: 'TWICE_DAILY',
        times_per_day: 2,
        verification_status: 'confirmed',
        lifecycle_state: 'active',
        verified_by: testCaregiverId,
        verified_at: new Date(),
        parse_result: { mock: 'provenance_tree' },
      })
      .returning('*');

    const payload: ReminderPayload = {
      type: 'rendered_text',
      body: 'मेटफॉर्मिन ५०० मि.ग्रॅ. घेण्याची वेळ',
      language: 'mr',
    };

    // Insert 2 pending reminders
    const [r1, r2] = await db('reminders')
      .insert([
        { medication_id: medication.id, scheduled_time: '2026-08-30T08:00:00+05:30', status: 'pending', payload },
        { medication_id: medication.id, scheduled_time: '2026-08-30T20:00:00+05:30', status: 'pending', payload },
      ])
      .returning('*');

    const res = await request(app)
      .post(`/api/medications/${medication.id}/stop`)
      .send({
        caregiver_id: testCaregiverId,
        reason: 'Patient reported adverse gastrointestinal reaction',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.medication_id).toBe(medication.id);
    expect(res.body.lifecycle_state).toBe('stopped');
    expect(res.body.cancelled_reminders_count).toBe(2);

    // Verify medication row
    const updatedMed = await db('medications').where({ id: medication.id }).first();
    expect(updatedMed.lifecycle_state).toBe('stopped');
    expect(updatedMed.lifecycle_reason).toBe('Patient reported adverse gastrointestinal reaction');
    expect(updatedMed.lifecycle_changed_at).toBeDefined();
    // Invariant: parse_result preserved
    expect(updatedMed.parse_result).toEqual({ mock: 'provenance_tree' });

    // Verify reminders are cancelled
    const updatedR1 = await db('reminders').where({ id: r1.id }).first();
    const updatedR2 = await db('reminders').where({ id: r2.id }).first();
    expect(updatedR1.status).toBe('cancelled');
    expect(updatedR1.cancelled_at).toBeDefined();
    expect(updatedR2.status).toBe('cancelled');
    expect(updatedR2.cancelled_at).toBeDefined();

    // Verify audit event
    const audit = await db('medication_audit_events')
      .where({ medication_id: medication.id, event_type: 'stopped' })
      .first();
    expect(audit).toBeDefined();
    expect(audit.actor_caregiver_id).toBe(testCaregiverId);
    expect(audit.reason).toBe('Patient reported adverse gastrointestinal reaction');
  });

  it('2. does NOT cancel already-sent or already-failed reminders when stopping medication', async () => {
    const [medication] = await db('medications')
      .insert({
        prescription_id: testPrescriptionId,
        drug_name: 'Paracetamol',
        frequency_code: 'ONCE_DAILY',
        verification_status: 'confirmed',
        lifecycle_state: 'active',
        verified_by: testCaregiverId,
        verified_at: new Date(),
      })
      .returning('*');

    const payload: ReminderPayload = {
      type: 'rendered_text',
      body: 'पॅरासिटामॉल घेण्याची वेळ',
      language: 'mr',
    };

    const [sentRem, failedRem, pendingRem] = await db('reminders')
      .insert([
        { medication_id: medication.id, scheduled_time: '2026-08-29T08:00:00+05:30', status: 'sent', sent_at: new Date(), payload },
        { medication_id: medication.id, scheduled_time: '2026-08-29T20:00:00+05:30', status: 'failed', last_error_code: 'DELIVERY_TIMEOUT', payload },
        { medication_id: medication.id, scheduled_time: '2026-08-30T08:00:00+05:30', status: 'pending', payload },
      ])
      .returning('*');

    const res = await request(app)
      .post(`/api/medications/${medication.id}/stop`)
      .send({
        caregiver_id: testCaregiverId,
        reason: 'Fever resolved',
      });

    expect(res.status).toBe(200);
    expect(res.body.cancelled_reminders_count).toBe(1);

    const checkSent = await db('reminders').where({ id: sentRem.id }).first();
    expect(checkSent.status).toBe('sent');
    expect(checkSent.cancelled_at).toBeNull();

    const checkFailed = await db('reminders').where({ id: failedRem.id }).first();
    expect(checkFailed.status).toBe('failed');
    expect(checkFailed.cancelled_at).toBeNull();

    const checkPending = await db('reminders').where({ id: pendingRem.id }).first();
    expect(checkPending.status).toBe('cancelled');
    expect(checkPending.cancelled_at).toBeDefined();
  });

  it('3. rejects stopping an already-stopped medication with 422 (SI-12 invalid lifecycle transition)', async () => {
    const [medication] = await db('medications')
      .insert({
        prescription_id: testPrescriptionId,
        drug_name: 'Metformin',
        verification_status: 'confirmed',
        lifecycle_state: 'stopped',
        lifecycle_reason: 'Prior stop reason',
        verified_by: testCaregiverId,
        verified_at: new Date(),
      })
      .returning('*');

    const res = await request(app)
      .post(`/api/medications/${medication.id}/stop`)
      .send({
        caregiver_id: testCaregiverId,
        reason: 'Attempting second stop',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_LIFECYCLE_TRANSITION');
  });

  it('4. rejects stopping a non-active (NULL lifecycle / pending verification) medication with 422', async () => {
    const [medication] = await db('medications')
      .insert({
        prescription_id: testPrescriptionId,
        drug_name: 'Unverified Drug',
        verification_status: 'pending',
        lifecycle_state: null,
      })
      .returning('*');

    const res = await request(app)
      .post(`/api/medications/${medication.id}/stop`)
      .send({
        caregiver_id: testCaregiverId,
        reason: 'Trying to stop unverified medication',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_LIFECYCLE_TRANSITION');
  });

  it('5. returns 404 for non-existent medication UUID', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .post(`/api/medications/${nonExistentId}/stop`)
      .send({
        caregiver_id: testCaregiverId,
        reason: 'Stop non-existent',
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('6. returns 400 when reason is missing or empty', async () => {
    const [medication] = await db('medications')
      .insert({
        prescription_id: testPrescriptionId,
        drug_name: 'Metformin',
        verification_status: 'confirmed',
        lifecycle_state: 'active',
      })
      .returning('*');

    const res = await request(app)
      .post(`/api/medications/${medication.id}/stop`)
      .send({
        caregiver_id: testCaregiverId,
        reason: '   ',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('7. returns 400 when caregiver_id is missing or malformed', async () => {
    const [medication] = await db('medications')
      .insert({
        prescription_id: testPrescriptionId,
        drug_name: 'Metformin',
        verification_status: 'confirmed',
        lifecycle_state: 'active',
      })
      .returning('*');

    const res = await request(app)
      .post(`/api/medications/${medication.id}/stop`)
      .send({
        caregiver_id: 'not-a-valid-uuid',
        reason: 'Valid reason',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('8. verifies transactional atomicity: if an audit insert fails, medication and reminders remain unstopped (rollback)', async () => {
    const [medication] = await db('medications')
      .insert({
        prescription_id: testPrescriptionId,
        drug_name: 'Metformin',
        verification_status: 'confirmed',
        lifecycle_state: 'active',
      })
      .returning('*');

    const payload: ReminderPayload = {
      type: 'rendered_text',
      body: 'औषध वेळ',
      language: 'mr',
    };

    const [pendingRem] = await db('reminders')
      .insert({
        medication_id: medication.id,
        scheduled_time: '2026-08-30T08:00:00+05:30',
        status: 'pending',
        payload,
      })
      .returning('*');

    // Pass a non-existent caregiver UUID to trigger FK violation in audit_events insert inside the transaction
    const nonExistentCaregiverId = '99999999-0000-0000-0000-000000000000';
    const res = await request(app)
      .post(`/api/medications/${medication.id}/stop`)
      .send({
        caregiver_id: nonExistentCaregiverId,
        reason: 'Valid stop reason',
      });

    // Foreign key violation triggers 500/error and transaction rollback
    expect(res.status).toBe(500);

    // Assert medication is STILL active (rolled back)
    const checkMed = await db('medications').where({ id: medication.id }).first();
    expect(checkMed.lifecycle_state).toBe('active');
    expect(checkMed.lifecycle_reason).toBeNull();

    // Assert reminder is STILL pending (rolled back)
    const checkRem = await db('reminders').where({ id: pendingRem.id }).first();
    expect(checkRem.status).toBe('pending');
    expect(checkRem.cancelled_at).toBeNull();
  });
});

