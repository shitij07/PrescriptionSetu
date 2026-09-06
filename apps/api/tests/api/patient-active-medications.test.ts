/**
 * Patient Active Medication Regimens Integration Tests.
 * Authoritative sources:
 *   - `docs/API_CONTRACTS.md` §13.7
 *   - `docs/SCHEMA.md` §2.5 (Deliverable Predicate)
 *   - `SAFETY_INVARIANTS.md` SI-01, SI-02, SI-15
 */

import request from 'supertest';
import type { Knex } from 'knex';
import { createApp } from '../../src/app';
import { getDb } from '../../src/db/connection';
import { FixtureOcrProvider } from '../../src/ocr/fixture-provider';
import { Logger } from '../../src/logging/logger';

describe('Patient Profile Active Medications API (GET /api/patients/:id)', () => {
  let db: Knex;
  let app: any;
  let ocrProvider: FixtureOcrProvider;
  let testLogger: Logger;

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

  beforeEach(() => {
    testLogger = new Logger({
      stream: {
        write: () => {},
      },
    });
    app = createApp(db, ocrProvider, undefined, testLogger);
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

  it('rejects invalid patient UUID format with 400', async () => {
    const res = await request(app).get('/api/patients/not-a-valid-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PATIENT_ID');
  });

  it('returns 404 for non-existent patient UUID', async () => {
    const res = await request(app).get('/api/patients/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PATIENT_NOT_FOUND');
  });

  it('returns 404 for soft-deleted patient (deleted_at IS NOT NULL)', async () => {
    const [patient] = await db('patients')
      .insert({
        full_name: 'Deleted Patient',
        deleted_at: new Date(),
      })
      .returning('*');

    const res = await request(app).get(`/api/patients/${patient.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PATIENT_NOT_FOUND');
  });

  it('returns empty active_medications array when patient has no prescriptions', async () => {
    const [patient] = await db('patients')
      .insert({
        full_name: 'Asha Patil',
        phone_number: '+919876543210',
        preferred_language: 'mr',
        meal_times: JSON.stringify({ breakfast: '08:30', lunch: '13:00', dinner: '20:30', bedtime: '22:00' }),
      })
      .returning('*');

    const res = await request(app).get(`/api/patients/${patient.id}`);
    expect(res.status).toBe(200);
    expect(res.body.patient.id).toBe(patient.id);
    expect(res.body.patient.full_name).toBe('Asha Patil');
    expect(res.body.patient.meal_times).toEqual({
      breakfast: '08:30',
      lunch: '13:00',
      dinner: '20:30',
      bedtime: '22:00',
    });
    expect(res.body.active_prescriptions_count).toBe(0);
    expect(res.body.active_medications).toEqual([]);
  });

  it('enforces SI-01/SI-02/SI-15 deliverable predicate: excludes pending, rejected, and stopped medications', async () => {
    const [patient] = await db('patients')
      .insert({ full_name: 'Ganpatrao More' })
      .returning('*');

    const [caregiver] = await db('caregivers')
      .insert({ full_name: 'Dr. Shinde' })
      .returning('*');

    const [rx] = await db('prescriptions')
      .insert({
        patient_id: patient.id,
        uploaded_by: caregiver.id,
        status: 'pending_verification',
        raw_ocr_text: 'Tab Amoxicillin 500mg TDS\nTab Paracetamol 650mg BD',
      })
      .returning('*');

    // 1. Pending candidate (lifecycle_state = null, verification_status = 'pending')
    await db('medications').insert({
      prescription_id: rx.id,
      drug_name: 'Amoxicillin',
      verification_status: 'pending',
      lifecycle_state: null,
      frequency_code: 'THRICE_DAILY',
      times_per_day: 3,
      parse_result: JSON.stringify({
        matches: [
          {
            rule_id: 'FREQ-TDS-001',
            matched_literal: 'TDS',
            source_span: { start: 20, end: 23 },
          },
        ],
      }),
    });

    // 2. Rejected candidate (lifecycle_state = null, verification_status = 'rejected')
    await db('medications').insert({
      prescription_id: rx.id,
      drug_name: 'Paracetamol',
      verification_status: 'rejected',
      lifecycle_state: null,
      frequency_code: 'TWICE_DAILY',
      times_per_day: 2,
    });

    // 3. Stopped medication (verification_status = 'confirmed', lifecycle_state = 'stopped')
    await db('medications').insert({
      prescription_id: rx.id,
      drug_name: 'Ibuprofen',
      verification_status: 'confirmed',
      lifecycle_state: 'stopped',
      frequency_code: 'ONCE_DAILY',
      times_per_day: 1,
    });

    const res = await request(app).get(`/api/patients/${patient.id}`);
    expect(res.status).toBe(200);
    expect(res.body.active_prescriptions_count).toBe(1);
    // Crucial: Pending, rejected, and stopped medications MUST NOT be returned
    expect(res.body.active_medications).toHaveLength(0);
  });

  it('returns confirmed and corrected active medications with formatted display expansions', async () => {
    const [patient] = await db('patients')
      .insert({ full_name: 'Dattatray Shinde' })
      .returning('*');

    const [caregiver] = await db('caregivers')
      .insert({ full_name: 'Dr. Sarah Wilson' })
      .returning('*');

    const [rx] = await db('prescriptions')
      .insert({
        patient_id: patient.id,
        uploaded_by: caregiver.id,
        status: 'verified',
        raw_ocr_text: 'Tab Metformin 500mg BD\nTab Telmisartan 40mg OD',
      })
      .returning('*');

    // 1. Confirmed + Active medication
    await db('medications').insert({
      prescription_id: rx.id,
      drug_name: 'Metformin',
      verification_status: 'confirmed',
      lifecycle_state: 'active',
      frequency_code: 'TWICE_DAILY',
      times_per_day: 2,
      timing_anchors: ['AFTER_MEAL'],
      dose_amount: 1,
      dose_unit: 'tablet',
      dose_strength_value: 500,
      dose_strength_unit: 'mg',
      parse_result: JSON.stringify({
        matches: [
          {
            rule_id: 'FREQ-BD-001',
            matched_literal: 'BD',
            source_span: { start: 18, end: 20 },
          },
        ],
      }),
    });

    // 2. Corrected + Active medication
    await db('medications').insert({
      prescription_id: rx.id,
      drug_name: 'Telmisartan',
      verification_status: 'corrected',
      lifecycle_state: 'active',
      frequency_code: 'ONCE_DAILY',
      times_per_day: 1,
      timing_anchors: ['BEDTIME'],
      dose_amount: 1,
      dose_unit: 'tablet',
      dose_strength_value: 40,
      dose_strength_unit: 'mg',
      duration_value: 30,
      duration_unit: 'day',
      parse_result: JSON.stringify({
        matches: [
          {
            rule_id: 'FREQ-OD-001',
            matched_literal: 'OD',
            source_span: { start: 21, end: 23 },
          },
        ],
      }),
    });

    const res = await request(app).get(`/api/patients/${patient.id}`);
    expect(res.status).toBe(200);
    expect(res.body.active_prescriptions_count).toBe(1);
    expect(res.body.active_medications).toHaveLength(2);

    // Verify Metformin structure
    const metformin = res.body.active_medications.find((m: any) => m.drug_name === 'Metformin');
    expect(metformin).toBeDefined();
    expect(metformin.verification_status).toBe('confirmed');
    expect(metformin.lifecycle_state).toBe('active');
    expect(metformin.effective_fields.frequency_code).toBe('TWICE_DAILY');
    expect(metformin.effective_fields.times_per_day).toBe(2);
    expect(Number(metformin.effective_fields.dose_strength_value)).toBe(500);
    expect(metformin.display_expansions).toEqual([
      {
        rule_id: 'FREQ-BD-001',
        matched_literal: 'BD',
        canonical_expansion: 'twice daily',
        source_span: { start: 18, end: 20 },
      },
    ]);

    // Verify Telmisartan structure
    const telmisartan = res.body.active_medications.find((m: any) => m.drug_name === 'Telmisartan');
    expect(telmisartan).toBeDefined();
    expect(telmisartan.verification_status).toBe('corrected');
    expect(telmisartan.lifecycle_state).toBe('active');
    expect(telmisartan.effective_fields.frequency_code).toBe('ONCE_DAILY');
    expect(telmisartan.effective_fields.duration_value).toBe(30);
    expect(telmisartan.display_expansions).toEqual([
      {
        rule_id: 'FREQ-OD-001',
        matched_literal: 'OD',
        canonical_expansion: 'once daily',
        source_span: { start: 21, end: 23 },
      },
    ]);
  });

  it('enforces patient isolation: does not return active medications belonging to another patient', async () => {
    const [patientA] = await db('patients').insert({ full_name: 'Patient A' }).returning('*');
    const [patientB] = await db('patients').insert({ full_name: 'Patient B' }).returning('*');

    const [rxB] = await db('prescriptions')
      .insert({
        patient_id: patientB.id,
        status: 'verified',
        raw_ocr_text: 'Tab Aspirin 75mg OD',
      })
      .returning('*');

    await db('medications').insert({
      prescription_id: rxB.id,
      drug_name: 'Aspirin',
      verification_status: 'confirmed',
      lifecycle_state: 'active',
      frequency_code: 'ONCE_DAILY',
      times_per_day: 1,
    });

    const resA = await request(app).get(`/api/patients/${patientA.id}`);
    expect(resA.status).toBe(200);
    expect(resA.body.active_prescriptions_count).toBe(0);
    expect(resA.body.active_medications).toHaveLength(0);

    const resB = await request(app).get(`/api/patients/${patientB.id}`);
    expect(resB.status).toBe(200);
    expect(resB.body.active_prescriptions_count).toBe(1);
    expect(resB.body.active_medications).toHaveLength(1);
    expect(resB.body.active_medications[0].drug_name).toBe('Aspirin');
  });
});
