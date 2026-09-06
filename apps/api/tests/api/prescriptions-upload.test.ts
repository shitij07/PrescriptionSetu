/**
 * Prescription Upload & Ingestion API Integration Tests.
 * Authoritative sources: `PercriptionSetuMASTERPLAN.md` §18.1, `docs/SCHEMA.md`, `SAFETY_INVARIANTS.md`.
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { getDb } from '../../src/db/connection';
import { FixtureOcrProvider } from '../../src/ocr/fixture-provider';
import type { Knex } from 'knex';

describe('POST /api/prescriptions/upload', () => {
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

    const [patient] = await db('patients').insert({ full_name: 'Patient Upload Test' }).returning('*');
    testPatientId = patient.id;

    const [caregiver] = await db('caregivers').insert({ full_name: 'Caregiver Upload Test' }).returning('*');
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

  it('1. successfully uploads a prescription and creates pending medication candidates', async () => {
    const res = await request(app)
      .post('/api/prescriptions/upload')
      .send({
        patient_id: testPatientId,
        caregiver_id: testCaregiverId,
        fixture_key: 'paracetamol_bd_5days',
      });

    expect(res.status).toBe(201);
    expect(res.body.prescription).toBeDefined();
    expect(res.body.prescription.status).toBe('pending_verification');
    expect(res.body.prescription.raw_ocr_text).toBe('Tab Paracetamol 500mg 1 tab BD x 5 days');
    expect(Number(res.body.prescription.ocr_confidence)).toBeCloseTo(0.92);

    expect(res.body.medications).toHaveLength(1);
    expect(res.body.medications[0].frequency_code).toBe('TWICE_DAILY');
    expect(res.body.medications[0].verification_status).toBe('pending');
    expect(res.body.medications[0].lifecycle_state).toBeNull();
  });

  it('2. returns 400 when patient_id or caregiver_id is missing', async () => {
    const res = await request(app)
      .post('/api/prescriptions/upload')
      .send({
        fixture_key: 'paracetamol_bd_5days',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('3. returns 400 when patient_id is not a valid UUID format', async () => {
    const res = await request(app)
      .post('/api/prescriptions/upload')
      .send({
        patient_id: 'not-a-uuid',
        caregiver_id: testCaregiverId,
        fixture_key: 'paracetamol_bd_5days',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('4. returns 404/400 when fixture_key is unknown', async () => {
    const res = await request(app)
      .post('/api/prescriptions/upload')
      .send({
        patient_id: testPatientId,
        caregiver_id: testCaregiverId,
        fixture_key: 'unknown_prescription_key',
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('FIXTURE_NOT_FOUND');
  });

  it('5. ingests multiline OCR creating separate medication records for each recognized line', async () => {
    const res = await request(app)
      .post('/api/prescriptions/upload')
      .send({
        patient_id: testPatientId,
        caregiver_id: testCaregiverId,
        fixture_key: 'metformin_paracetamol_multiline',
      });

    expect(res.status).toBe(201);
    expect(res.body.medications).toHaveLength(2);
    expect(res.body.medications[0].frequency_code).toBe('TWICE_DAILY');
    expect(res.body.medications[1].as_needed).toBe(true);
  });

  it('6. preserves raw OCR text faithfully in PostgreSQL', async () => {
    const res = await request(app)
      .post('/api/prescriptions/upload')
      .send({
        patient_id: testPatientId,
        caregiver_id: testCaregiverId,
        fixture_key: 'amoxicillin_500mg_tds',
      });

    expect(res.status).toBe(201);
    const inDb = await db('prescriptions').where({ id: res.body.prescription.id }).first();
    expect(inDb.raw_ocr_text).toBe('Tab Amoxicillin 500mg 1 tab TDS');
  });

  it('7. creates initial parsed audit events for all ingested medication rows', async () => {
    const res = await request(app)
      .post('/api/prescriptions/upload')
      .send({
        patient_id: testPatientId,
        caregiver_id: testCaregiverId,
        fixture_key: 'paracetamol_bd_5days',
      });

    const medId = res.body.medications[0].id;
    const audit = await db('medication_audit_events').where({ medication_id: medId, event_type: 'parsed' }).first();
    expect(audit).toBeDefined();
    expect(audit.actor_caregiver_id).toBe(testCaregiverId);
  });
});
