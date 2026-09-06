/**
 * Reminder Generation & Persistence Service Integration Tests (Sub-Slice 2A).
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 5, `PercriptionSetuMASTERPLAN.md` §18.6, §18.8, `docs/SCHEMA.md` §2.6, `docs/DECISIONS.md` D-030, `SAFETY_INVARIANTS.md` SI-01, SI-02, SI-03, SI-11.
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { getDb } from '../../src/db/connection';
import { FixtureOcrProvider } from '../../src/ocr/fixture-provider';
import type { Knex } from 'knex';
import { generateAndPersistReminders } from '../../src/reminders/service';
import { verifyPrescription } from '../../src/verification/gate';

describe('Reminder Generation & Persistence Service (Sub-Slice 2A)', () => {
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

    const [patient] = await db('patients')
      .insert({
        full_name: 'Reminder Service Test Patient',
        preferred_language: 'mr',
        meal_times: {
          breakfast: '08:30',
          lunch: '13:30',
          dinner: '20:30',
          bedtime: '22:30',
        },
      })
      .returning('*');
    testPatientId = patient.id;

    const [caregiver] = await db('caregivers')
      .insert({ full_name: 'Reminder Service Caregiver' })
      .returning('*');
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

  it('1. generates and persists pending reminders when a prescription is verified (SI-01, SI-03, D-030)', async () => {
    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
        uploaded_by: testCaregiverId,
        raw_ocr_text: 'Tab Metformin 500mg BD x 5 days',
        status: 'pending_verification',
      })
      .returning('*');

    const [medication] = await db('medications')
      .insert({
        prescription_id: prescription.id,
        drug_name: 'Metformin',
        frequency_code: 'TWICE_DAILY',
        times_per_day: 2,
        duration_value: 5,
        duration_unit: 'day',
        dose_amount: 1,
        dose_unit: 'tablet',
        schedule_derivable: true,
        verification_status: 'confirmed',
        lifecycle_state: null,
        parse_result: { mock: 'provenance_tree' },
      })
      .returning('*');

    // Call verify endpoint
    const res = await request(app)
      .post(`/api/prescriptions/${prescription.id}/verify`)
      .send({ verifier_caregiver_id: testCaregiverId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.prescription_status).toBe('verified');

    // Metformin BD (twice daily: breakfast + dinner) for 5 days = 10 reminders
    const reminders = await db('reminders').where({ medication_id: medication.id }).orderBy('scheduled_time', 'asc');
    expect(reminders.length).toBe(10);

    for (const reminder of reminders) {
      expect(reminder.status).toBe('pending');
      expect(reminder.attempt_count).toBe(0);
      expect(reminder.sent_at).toBeNull();
      expect(reminder.cancelled_at).toBeNull();
      expect(reminder.payload).toBeDefined();
      expect(reminder.payload.type).toBe('rendered_text');
      expect(reminder.payload.language).toBe('mr');
      expect(reminder.payload.body).toContain('Metformin');
    }

    // Check custom patient meal-time was respected (08:30 and 20:30 IST)
    const firstReminderTime = new Date(reminders[0].scheduled_time).toISOString();
    // 08:30 IST is 03:00 UTC
    expect(firstReminderTime).toContain('T03:00:00.000Z');

    // Ensure parse_result is preserved immutably
    const checkMed = await db('medications').where({ id: medication.id }).first();
    expect(checkMed.parse_result).toEqual({ mock: 'provenance_tree' });
  });

  it('2. skips reminder generation for non-derivable (SOS/PRN/STAT) medications on verified prescription', async () => {
    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
        uploaded_by: testCaregiverId,
        raw_ocr_text: 'Tab Paracetamol SOS',
        status: 'pending_verification',
      })
      .returning('*');

    const [medication] = await db('medications')
      .insert({
        prescription_id: prescription.id,
        drug_name: 'Paracetamol',
        as_needed: true,
        schedule_derivable: false,
        verification_status: 'confirmed',
        lifecycle_state: null,
      })
      .returning('*');

    const res = await request(app)
      .post(`/api/prescriptions/${prescription.id}/verify`)
      .send({ verifier_caregiver_id: testCaregiverId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const reminders = await db('reminders').where({ medication_id: medication.id });
    expect(reminders.length).toBe(0);
  });

  it('3. does NOT generate reminders if prescription fails verification gate (SI-01 gate guard)', async () => {
    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
        uploaded_by: testCaregiverId,
        raw_ocr_text: 'Tab Metformin BD',
        status: 'pending_verification',
      })
      .returning('*');

    const [medication] = await db('medications')
      .insert({
        prescription_id: prescription.id,
        drug_name: 'Metformin',
        frequency_code: 'TWICE_DAILY',
        schedule_derivable: true,
        verification_status: 'pending', // Pending line -> gate fails
        lifecycle_state: null,
      })
      .returning('*');

    const res = await request(app)
      .post(`/api/prescriptions/${prescription.id}/verify`)
      .send({ verifier_caregiver_id: testCaregiverId });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VERIFICATION_GATE_REJECTED');

    const reminders = await db('reminders').where({ medication_id: medication.id });
    expect(reminders.length).toBe(0);
  });

  it('4. ensures idempotency: repeated generateAndPersistReminders calls do not duplicate pending reminders', async () => {
    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
        uploaded_by: testCaregiverId,
        raw_ocr_text: 'Tab Metformin 500mg OD x 2 days',
        status: 'pending_verification',
      })
      .returning('*');

    const [medication] = await db('medications')
      .insert({
        prescription_id: prescription.id,
        drug_name: 'Metformin',
        frequency_code: 'ONCE_DAILY',
        times_per_day: 1,
        duration_value: 2,
        duration_unit: 'day',
        schedule_derivable: true,
        verification_status: 'confirmed',
        lifecycle_state: null,
      })
      .returning('*');

    await verifyPrescription(db, prescription.id, testCaregiverId);

    const initialReminders = await db('reminders').where({ medication_id: medication.id });
    expect(initialReminders.length).toBe(2);

    // Call generateAndPersistReminders again directly
    const result = await generateAndPersistReminders(db, prescription.id);
    expect(result.success).toBe(true);

    const afterReminders = await db('reminders').where({ medication_id: medication.id });
    expect(afterReminders.length).toBe(2); // Still 2, no duplicates created
  });

  it('5. formats English payload when patient preferred_language is en', async () => {
    const [enPatient] = await db('patients')
      .insert({
        full_name: 'English Test Patient',
        preferred_language: 'en',
      })
      .returning('*');

    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: enPatient.id,
        uploaded_by: testCaregiverId,
        raw_ocr_text: 'Tab Amoxicillin 500mg OD x 1 day',
        status: 'pending_verification',
      })
      .returning('*');

    const [medication] = await db('medications')
      .insert({
        prescription_id: prescription.id,
        drug_name: 'Amoxicillin',
        frequency_code: 'ONCE_DAILY',
        times_per_day: 1,
        duration_value: 1,
        duration_unit: 'day',
        schedule_derivable: true,
        verification_status: 'confirmed',
        lifecycle_state: null,
      })
      .returning('*');

    const res = await request(app)
      .post(`/api/prescriptions/${prescription.id}/verify`)
      .send({ verifier_caregiver_id: testCaregiverId });

    expect(res.status).toBe(200);

    const [reminder] = await db('reminders').where({ medication_id: medication.id });
    expect(reminder).toBeDefined();
    expect(reminder.payload.language).toBe('en');
    expect(reminder.payload.body).toContain('Hello, it is time to take your medication: Amoxicillin');

    // Clean up enPatient
    await db('reminders').where({ medication_id: medication.id }).del();
    await db('medications').where({ id: medication.id }).del();
    await db('prescriptions').where({ id: prescription.id }).del();
    await db('patients').where({ id: enPatient.id }).del();
  });

  it('6. generates reminders for multiple derivable medications on the same prescription', async () => {
    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
        uploaded_by: testCaregiverId,
        raw_ocr_text: 'Tab Metformin 500mg BD x 2 days\nTab Atorvastatin 10mg OD x 3 days',
        status: 'pending_verification',
      })
      .returning('*');

    const [med1] = await db('medications')
      .insert({
        prescription_id: prescription.id,
        drug_name: 'Metformin',
        frequency_code: 'TWICE_DAILY',
        times_per_day: 2,
        duration_value: 2,
        duration_unit: 'day',
        schedule_derivable: true,
        verification_status: 'confirmed',
        lifecycle_state: null,
      })
      .returning('*');

    const [med2] = await db('medications')
      .insert({
        prescription_id: prescription.id,
        drug_name: 'Atorvastatin',
        frequency_code: 'ONCE_DAILY',
        times_per_day: 1,
        duration_value: 3,
        duration_unit: 'day',
        schedule_derivable: true,
        verification_status: 'confirmed',
        lifecycle_state: null,
      })
      .returning('*');

    const res = await request(app)
      .post(`/api/prescriptions/${prescription.id}/verify`)
      .send({ verifier_caregiver_id: testCaregiverId });

    expect(res.status).toBe(200);
    expect(res.body.generated_reminders_count).toBe(7); // 4 + 3 = 7

    const rem1 = await db('reminders').where({ medication_id: med1.id });
    expect(rem1.length).toBe(4); // 2 days * 2 times = 4

    const rem2 = await db('reminders').where({ medication_id: med2.id });
    expect(rem2.length).toBe(3); // 3 days * 1 time = 3
  });
});

