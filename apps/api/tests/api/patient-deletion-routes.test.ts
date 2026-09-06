/**
 * Patient API Routes Integration Tests (DPDP Erasure, Retrieval, and Safety Lifecycle).
 * Authoritative sources: `PercriptionSetuMASTERPLAN.md` §26, `docs/SCHEMA.md` §2.1, §10, `SAFETY_INVARIANTS.md` SI-10, SI-11, SI-14.
 */

import request from 'supertest';
import type { Knex } from 'knex';
import { createApp } from '../../src/app';
import { getDb } from '../../src/db/connection';
import { FixtureOcrProvider } from '../../src/ocr/fixture-provider';

describe('Patient API Routes (GET & DELETE /api/patients)', () => {
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

  beforeEach(() => {
    app = createApp(db, ocrProvider);
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

  it('1. Executes full atomic DPDP erasure via DELETE /api/patients/:id', async () => {
    // Create patient
    const [patient] = await db('patients')
      .insert({
        full_name: 'Anil Deshpande',
        phone_number: '+919822011111',
        preferred_language: 'mr',
        meal_times: JSON.stringify({ breakfast: '08:00', lunch: '13:00', dinner: '20:00', bedtime: '22:00' }),
      })
      .returning('*');

    // Create caregiver & link
    const [caregiver] = await db('caregivers')
      .insert({ full_name: 'Dr. Verifier' })
      .returning('*');

    await db('patient_caregivers').insert({
      patient_id: patient.id,
      caregiver_id: caregiver.id,
      role: 'verifier',
    });

    // Create prescription with image storage key
    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: patient.id,
        uploaded_by: caregiver.id,
        image_storage_key: 'prescriptions/image-12345.jpg',
        raw_ocr_text: 'Tab Metformin 500mg BD',
        status: 'verified',
      })
      .returning('*');

    // Create active medication
    const [medication] = await db('medications')
      .insert({
        prescription_id: prescription.id,
        drug_name: 'Metformin',
        verification_status: 'confirmed',
        lifecycle_state: 'active',
        parse_result: JSON.stringify({ matches: [] }),
      })
      .returning('*');

    // Create pending reminder
    const [reminder] = await db('reminders')
      .insert({
        medication_id: medication.id,
        scheduled_time: new Date(Date.now() + 3600000),
        status: 'pending',
        payload: JSON.stringify({ type: 'rendered_text', body: 'Test message', language: 'mr' }),
      })
      .returning('*');

    // Execute DPDP erasure
    const res = await request(app)
      .delete(`/api/patients/${patient.id}`)
      .send({ caregiver_id: caregiver.id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.patient_id).toBe(patient.id);
    expect(res.body.data.cancelled_reminders_count).toBe(1);
    expect(res.body.data.stopped_medications_count).toBe(1);
    expect(res.body.data.deleted_at).toBeDefined();

    // Verify Patient PII redacted in database
    const scrubbedPatient = await db('patients').where({ id: patient.id }).first();
    expect(scrubbedPatient.deleted_at).not.toBeNull();
    expect(scrubbedPatient.full_name).toBe('[DELETED_PATIENT]');
    expect(scrubbedPatient.phone_number).toBeNull();
    expect(scrubbedPatient.meal_times).toBeNull();

    // Verify patient_caregiver relationship link removed
    const links = await db('patient_caregivers').where({ patient_id: patient.id });
    expect(links.length).toBe(0);

    // Verify prescription image_storage_key cleared
    const scrubbedPrescription = await db('prescriptions').where({ id: prescription.id }).first();
    expect(scrubbedPrescription.image_storage_key).toBeNull();

    // Verify pending reminders cancelled (SI-10, SI-11)
    const cancelledReminder = await db('reminders').where({ id: reminder.id }).first();
    expect(cancelledReminder.status).toBe('cancelled');
    expect(cancelledReminder.cancelled_at).not.toBeNull();

    // Verify medication stopped with audit reason
    const stoppedMed = await db('medications').where({ id: medication.id }).first();
    expect(stoppedMed.lifecycle_state).toBe('stopped');
    expect(stoppedMed.lifecycle_reason).toBe('PATIENT_ERASURE_REQUEST');

    // Verify immutable audit event recorded (SI-14)
    const auditEvents = await db('medication_audit_events').where({ medication_id: medication.id });
    expect(auditEvents.length).toBe(1);
    expect(auditEvents[0].event_type).toBe('stopped');
    expect(auditEvents[0].reason).toBe('PATIENT_ERASURE_REQUEST');
  });

  it('2. Returns 404 for non-existent patient ID', async () => {
    const res = await request(app).delete('/api/patients/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PATIENT_NOT_FOUND');
  });

  it('3. Returns 404 when attempting to re-erase an already deleted patient', async () => {
    const [patient] = await db('patients')
      .insert({ full_name: 'Already Erased', deleted_at: new Date() })
      .returning('*');

    const res = await request(app).delete(`/api/patients/${patient.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PATIENT_NOT_FOUND');
  });

  it('4. Returns 400 for invalid UUID format', async () => {
    const res = await request(app).delete('/api/patients/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PATIENT_ID');
  });

  it('5. GET /api/patients lists active patients and excludes deleted patients', async () => {
    const [activePatient] = await db('patients')
      .insert({ full_name: 'Active Patient', preferred_language: 'mr' })
      .returning('*');

    await db('patients').insert({
      full_name: '[DELETED_PATIENT]',
      deleted_at: new Date(),
    });

    const res = await request(app).get('/api/patients');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.patients)).toBe(true);

    const ids = res.body.patients.map((p: any) => p.id);
    expect(ids).toContain(activePatient.id);
    expect(res.body.patients.every((p: any) => p.deleted_at === undefined)).toBe(true);
  });

  it('6. GET /api/patients/:id returns patient profile and 404 for deleted patient', async () => {
    const [patient] = await db('patients')
      .insert({ full_name: 'Target Profile Patient', phone_number: '+919999900000', preferred_language: 'mr' })
      .returning('*');

    const res = await request(app).get(`/api/patients/${patient.id}`);
    expect(res.status).toBe(200);
    expect(res.body.patient.full_name).toBe('Target Profile Patient');

    // Erase patient
    await request(app).delete(`/api/patients/${patient.id}`);

    // Now GET /:id should return 404
    const resAfter = await request(app).get(`/api/patients/${patient.id}`);
    expect(resAfter.status).toBe(404);
  });
});
