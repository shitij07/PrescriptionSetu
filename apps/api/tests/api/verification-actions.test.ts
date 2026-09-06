/**
 * Verification Actions API Integration Tests (Confirm, Correct, Reject, Verify).
 * Authoritative sources: `SAFETY_INVARIANTS.md` SI-01, SI-04, SI-08, SI-14, `docs/SCHEMA.md`.
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { getDb } from '../../src/db/connection';
import { FixtureOcrProvider } from '../../src/ocr/fixture-provider';
import { savePrescriptionWithParseResult } from '../../src/db/repository';
import { parse } from '../../src/parser/parse';
import type { Knex } from 'knex';

describe('Verification Actions API (Confirm, Correct, Reject, Verify)', () => {
  let db: Knex;
  let app: any;
  let ocrProvider: FixtureOcrProvider;
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
    app = createApp(db, ocrProvider);

    const [patient] = await db('patients').insert({ full_name: 'Actions Patient' }).returning('*');
    testPatientId = patient.id;

    const [caregiver] = await db('caregivers').insert({ full_name: 'Actions Caregiver' }).returning('*');
    testCaregiverId = caregiver.id;
  });

  afterAll(async () => {
    if (db) {
      const pRows = await db('prescriptions').where({ patient_id: testPatientId }).select('id');
      const pIds = pRows.map((p: any) => p.id);
      if (pIds.length > 0) {
        const mRows = await db('medications').whereIn('prescription_id', pIds).select('id');
        const mIds = mRows.map((m: any) => m.id);
        if (mIds.length > 0) {
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

  it('1. POST /api/medications/:id/confirm marks medication confirmed and emits audit event', async () => {
    const rawOcr = 'Tab Metformin 500mg 1 tab BD';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));
    const medId = saved.medications[0].id;

    const res = await request(app)
      .post(`/api/medications/${medId}/confirm`)
      .send({ verifier_caregiver_id: testCaregiverId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.verification_status).toBe('confirmed');

    const updatedMed = await db('medications').where({ id: medId }).first();
    expect(updatedMed.verification_status).toBe('confirmed');
    expect(updatedMed.verified_by).toBe(testCaregiverId);

    const audit = await db('medication_audit_events').where({ medication_id: medId, event_type: 'confirmed' }).first();
    expect(audit).toBeDefined();
  });

  it('2. POST /api/medications/:id/correct updates clinical fields, preserves parse_result, and emits audit event', async () => {
    const rawOcr = 'Tab Metformin 500mg 1 tab BD';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));
    const medId = saved.medications[0].id;
    const originalParseResult = saved.medications[0].parse_result;

    const res = await request(app)
      .post(`/api/medications/${medId}/correct`)
      .send({
        verifier_caregiver_id: testCaregiverId,
        corrections: {
          frequency_code: 'THRICE_DAILY',
          times_per_day: 3,
          max_doses_per_day: 4,
        },
        reason: 'Adjusted to TDS with max 4 doses ceiling',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.verification_status).toBe('corrected');

    const updatedMed = await db('medications').where({ id: medId }).first();
    expect(updatedMed.frequency_code).toBe('THRICE_DAILY');
    expect(updatedMed.times_per_day).toBe(3);
    expect(updatedMed.max_doses_per_day).toBe(4);
    expect(updatedMed.verification_status).toBe('corrected');

    // SI-04 invariant: parse_result remains intact and immutable
    expect(updatedMed.parse_result).toEqual(originalParseResult);

    const audit = await db('medication_audit_events').where({ medication_id: medId, event_type: 'corrected' }).first();
    expect(audit).toBeDefined();
    expect(audit.reason).toBe('Adjusted to TDS with max 4 doses ceiling');
  });

  it('3. POST /api/medications/:id/correct rejects attempts to modify unauthorized/system fields', async () => {
    const rawOcr = 'Tab Metformin 500mg BD';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));
    const medId = saved.medications[0].id;

    const res = await request(app)
      .post(`/api/medications/${medId}/correct`)
      .send({
        verifier_caregiver_id: testCaregiverId,
        corrections: {
          lifecycle_state: 'active', // Unauthorized direct lifecycle manipulation
        },
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_CORRECTION_FIELD');
  });

  it('4. POST /api/medications/:id/reject marks medication rejected with reason and emits audit event', async () => {
    const rawOcr = 'Illegible scribble 500mg';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));
    const medId = saved.medications[0].id;

    const res = await request(app)
      .post(`/api/medications/${medId}/reject`)
      .send({
        verifier_caregiver_id: testCaregiverId,
        reason: 'Handwriting unreadable, unable to determine drug or frequency',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.verification_status).toBe('rejected');

    const updatedMed = await db('medications').where({ id: medId }).first();
    expect(updatedMed.verification_status).toBe('rejected');
    expect(updatedMed.lifecycle_state).toBeNull();
  });

  it('5. POST /api/medications/:id/reject returns 400 when reason is missing', async () => {
    const rawOcr = 'Tab Metformin 500mg BD';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));
    const medId = saved.medications[0].id;

    const res = await request(app)
      .post(`/api/medications/${medId}/reject`)
      .send({
        verifier_caregiver_id: testCaregiverId,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('6. POST /api/prescriptions/:id/verify rejects with 422 when any medication is still pending (SI-01)', async () => {
    const rawOcr = 'Tab Metformin 500mg BD\nTab Paracetamol 500mg TDS';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));

    // Confirm only the first medication; second is still pending
    await request(app)
      .post(`/api/medications/${saved.medications[0].id}/confirm`)
      .send({ verifier_caregiver_id: testCaregiverId });

    const res = await request(app)
      .post(`/api/prescriptions/${saved.prescription.id}/verify`)
      .send({ verifier_caregiver_id: testCaregiverId });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VERIFICATION_GATE_REJECTED');
    expect(res.body.error.message).toContain('still pending verification');

    const checkP = await db('prescriptions').where({ id: saved.prescription.id }).first();
    expect(checkP.status).toBe('pending_verification');
  });

  it('7. POST /api/prescriptions/:id/verify rejects with 422 when any medication is rejected (SI-01)', async () => {
    const rawOcr = 'Tab Metformin 500mg BD\nTab Paracetamol 500mg TDS';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));

    await request(app)
      .post(`/api/medications/${saved.medications[0].id}/confirm`)
      .send({ verifier_caregiver_id: testCaregiverId });

    await request(app)
      .post(`/api/medications/${saved.medications[1].id}/reject`)
      .send({ verifier_caregiver_id: testCaregiverId, reason: 'Illegible line item' });

    const res = await request(app)
      .post(`/api/prescriptions/${saved.prescription.id}/verify`)
      .send({ verifier_caregiver_id: testCaregiverId });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VERIFICATION_GATE_REJECTED');
    expect(res.body.error.message).toContain('has been rejected');
  });

  it('8. POST /api/prescriptions/:id/verify succeeds when all medications are confirmed/corrected (SI-01 atomic activation)', async () => {
    const rawOcr = 'Tab Metformin 500mg BD\nTab Paracetamol 500mg TDS';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));

    // Confirm med 1, correct med 2
    await request(app)
      .post(`/api/medications/${saved.medications[0].id}/confirm`)
      .send({ verifier_caregiver_id: testCaregiverId });

    await request(app)
      .post(`/api/medications/${saved.medications[1].id}/correct`)
      .send({
        verifier_caregiver_id: testCaregiverId,
        corrections: { duration_value: 7, duration_unit: 'day' },
      });

    const res = await request(app)
      .post(`/api/prescriptions/${saved.prescription.id}/verify`)
      .send({ verifier_caregiver_id: testCaregiverId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.prescription_status).toBe('verified');
    expect(res.body.activated_medication_count).toBe(2);

    const updatedP = await db('prescriptions').where({ id: saved.prescription.id }).first();
    expect(updatedP.status).toBe('verified');
    expect(updatedP.verified_by).toBe(testCaregiverId);

    const updatedMeds = await db('medications').where({ prescription_id: saved.prescription.id });
    expect(updatedMeds[0].lifecycle_state).toBe('active');
    expect(updatedMeds[1].lifecycle_state).toBe('active');
  });

  it('9. POST /api/medications/:id/confirm returns 404 for non-existent medication UUID', async () => {
    const nonExistentMedUuid = '88888888-0000-0000-0000-000000000000';
    const res = await request(app)
      .post(`/api/medications/${nonExistentMedUuid}/confirm`)
      .send({ verifier_caregiver_id: testCaregiverId });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('10. returns 400 for malformed verifier_caregiver_id UUID format', async () => {
    const rawOcr = 'Tab Metformin 500mg BD';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));
    const medId = saved.medications[0].id;

    const res = await request(app)
      .post(`/api/medications/${medId}/confirm`)
      .send({ verifier_caregiver_id: 'invalid-verifier-uuid' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('11. POST /api/medications/:id/confirm returns 422 PRESCRIPTION_ALREADY_VERIFIED when prescription is already verified', async () => {
    const rawOcr = 'Tab Metformin 500mg 1 tab BD';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));
    const medId = saved.medications[0].id;

    // Confirm and verify prescription
    await request(app)
      .post(`/api/medications/${medId}/confirm`)
      .send({ verifier_caregiver_id: testCaregiverId });

    await request(app)
      .post(`/api/prescriptions/${saved.prescription.id}/verify`)
      .send({ verifier_caregiver_id: testCaregiverId });

    // Attempt post-verification confirm
    const postVerifyRes = await request(app)
      .post(`/api/medications/${medId}/confirm`)
      .send({ verifier_caregiver_id: testCaregiverId });

    expect(postVerifyRes.status).toBe(422);
    expect(postVerifyRes.body.error.code).toBe('PRESCRIPTION_ALREADY_VERIFIED');
    expect(postVerifyRes.body.error.message).toContain('already been verified');
  });

  it('12. POST /api/medications/:id/correct returns 422 CANNOT_EDIT_VERIFIED_MEDICATION when prescription is already verified (SI-12)', async () => {
    const rawOcr = 'Tab Metformin 500mg 1 tab BD';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));
    const medId = saved.medications[0].id;

    await request(app)
      .post(`/api/medications/${medId}/confirm`)
      .send({ verifier_caregiver_id: testCaregiverId });

    await request(app)
      .post(`/api/prescriptions/${saved.prescription.id}/verify`)
      .send({ verifier_caregiver_id: testCaregiverId });

    // Attempt post-verification correct
    const postVerifyRes = await request(app)
      .post(`/api/medications/${medId}/correct`)
      .send({
        verifier_caregiver_id: testCaregiverId,
        corrections: { frequency_code: 'THRICE_DAILY', times_per_day: 3 },
      });

    expect(postVerifyRes.status).toBe(422);
    expect(postVerifyRes.body.error.code).toBe('CANNOT_EDIT_VERIFIED_MEDICATION');
    expect(postVerifyRes.body.error.message).toContain('SI-12');
  });

  it('13. POST /api/medications/:id/reject returns 422 CANNOT_REJECT_VERIFIED_MEDICATION when prescription is already verified', async () => {
    const rawOcr = 'Tab Metformin 500mg 1 tab BD';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));
    const medId = saved.medications[0].id;

    await request(app)
      .post(`/api/medications/${medId}/confirm`)
      .send({ verifier_caregiver_id: testCaregiverId });

    await request(app)
      .post(`/api/prescriptions/${saved.prescription.id}/verify`)
      .send({ verifier_caregiver_id: testCaregiverId });

    // Attempt post-verification reject
    const postVerifyRes = await request(app)
      .post(`/api/medications/${medId}/reject`)
      .send({
        verifier_caregiver_id: testCaregiverId,
        reason: 'Post-verification rejection attempt',
      });

    expect(postVerifyRes.status).toBe(422);
    expect(postVerifyRes.body.error.code).toBe('CANNOT_REJECT_VERIFIED_MEDICATION');
    expect(postVerifyRes.body.error.message).toContain('already been verified');
  });

  it('14. POST /api/prescriptions/:id/verify returns 422 PRESCRIPTION_ALREADY_VERIFIED if prescription is already verified (regression invariance)', async () => {
    const rawOcr = 'Tab Metformin 500mg 1 tab BD';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));
    const medId = saved.medications[0].id;

    await request(app)
      .post(`/api/medications/${medId}/confirm`)
      .send({ verifier_caregiver_id: testCaregiverId });

    const firstVerify = await request(app)
      .post(`/api/prescriptions/${saved.prescription.id}/verify`)
      .send({ verifier_caregiver_id: testCaregiverId });
    expect(firstVerify.status).toBe(200);

    // Second verify attempt
    const secondVerify = await request(app)
      .post(`/api/prescriptions/${saved.prescription.id}/verify`)
      .send({ verifier_caregiver_id: testCaregiverId });

    expect(secondVerify.status).toBe(422);
    expect(secondVerify.body.error.code).toBe('PRESCRIPTION_ALREADY_VERIFIED');
    expect(secondVerify.body.error.message).toContain('already been verified');
  });

  it('15. POST /api/medications/:id/stop operates independently on verified/active medication (SI-10, SI-11)', async () => {
    const rawOcr = 'Tab Metformin 500mg 1 tab BD';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));
    const medId = saved.medications[0].id;

    await request(app)
      .post(`/api/medications/${medId}/confirm`)
      .send({ verifier_caregiver_id: testCaregiverId });

    await request(app)
      .post(`/api/prescriptions/${saved.prescription.id}/verify`)
      .send({ verifier_caregiver_id: testCaregiverId });

    // Stop the active medication
    const stopRes = await request(app)
      .post(`/api/medications/${medId}/stop`)
      .send({
        caregiver_id: testCaregiverId,
        reason: 'Patient reported adverse reaction',
      });

    expect(stopRes.status).toBe(200);
    expect(stopRes.body.success).toBe(true);
    expect(stopRes.body.lifecycle_state).toBe('stopped');

    const medAfter = await db('medications').where({ id: medId }).first();
    expect(medAfter.lifecycle_state).toBe('stopped');

    // Confirm that pending reminders were cancelled (SI-11)
    const remainingPending = await db('reminders')
      .where({ medication_id: medId, status: 'pending' })
      .count('* as count')
      .first();
    expect(Number(remainingPending?.count || 0)).toBe(0);
  });

  it('16. Lock hierarchy serializes concurrent operations without deadlock', async () => {
    const rawOcr = 'Tab Metformin 500mg 1 tab BD';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));
    const medId = saved.medications[0].id;

    // Concurrently trigger confirm and verify
    const [confirmRes, verifyRes] = await Promise.all([
      request(app).post(`/api/medications/${medId}/confirm`).send({ verifier_caregiver_id: testCaregiverId }),
      request(app).post(`/api/prescriptions/${saved.prescription.id}/verify`).send({ verifier_caregiver_id: testCaregiverId }),
    ]);

    // Either confirm finishes first and verify succeeds, or verify evaluates gate first and rejects with 422
    // In NEITHER case should an unhandled 500 or deadlock occur
    expect([200, 422]).toContain(confirmRes.status);
    expect([200, 422]).toContain(verifyRes.status);
  });
});
