/**
 * Automated Verification Tests for Database Seeding Infrastructure (Slice 1).
 * Authoritative sources: `docs/SCHEMA.md`, `SAFETY_INVARIANTS.md` SI-01, SI-02, SI-03, SI-14.
 */

import { getDb, closeDb } from '../../src/db/connection';
import type { Knex } from 'knex';
import {
  seed,
  DEV_CAREGIVER_ID,
  DEV_PATIENT_1_ID,
  DEV_PATIENT_2_ID,
  DEV_PATIENT_3_ID,
  DEV_RX_PENDING_ID,
  DEV_RX_VERIFIED_ID,
  DEV_MED_PENDING_ID,
  DEV_MED_ACTIVE_1_ID,
  DEV_MED_ACTIVE_2_ID,
} from '../../src/db/seeds/01_dev_fixtures';

describe('Database Seeding Infrastructure (Slice 1)', () => {
  let db: Knex;

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
  });

  afterAll(async () => {
    if (db) {
      await db.destroy();
    }
  });

  it('strictly blocks execution if NODE_ENV is set to production', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      await expect(seed(db)).rejects.toThrow(
        /CRITICAL SAFETY ERROR: SEED DATA MUST NEVER RUN IN A PRODUCTION ENVIRONMENT/,
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('executes seed idempotently and populates all core relational tables', async () => {
    // Run seed twice to prove idempotency
    await seed(db);
    await seed(db);

    // 1. Verify Caregivers
    const caregiver = await db('caregivers').where({ id: DEV_CAREGIVER_ID }).first();
    expect(caregiver).toBeDefined();
    expect(caregiver.full_name).toBe('Dr. Ananya Patil');
    expect(caregiver.phone_number).toBe('+91 00000 00000');

    // 2. Verify Patients
    const patients = await db('patients')
      .whereIn('id', [DEV_PATIENT_1_ID, DEV_PATIENT_2_ID, DEV_PATIENT_3_ID])
      .orderBy('id');
    expect(patients).toHaveLength(3);
    expect(patients.every((p) => p.full_name.startsWith('[DEV]'))).toBe(true);
    expect(patients.every((p) => p.phone_number.startsWith('+91 00000'))).toBe(true);

    // 3. Verify Patient-Caregiver associations
    const links = await db('patient_caregivers')
      .whereIn('patient_id', [DEV_PATIENT_1_ID, DEV_PATIENT_2_ID, DEV_PATIENT_3_ID]);
    expect(links.length).toBe(6);

    // 4. Verify Prescriptions (1 pending, 1 verified)
    const pendingRx = await db('prescriptions').where({ id: DEV_RX_PENDING_ID }).first();
    expect(pendingRx).toBeDefined();
    expect(pendingRx.status).toBe('pending_verification');
    expect(pendingRx.patient_id).toBe(DEV_PATIENT_2_ID);

    const verifiedRx = await db('prescriptions').where({ id: DEV_RX_VERIFIED_ID }).first();
    expect(verifiedRx).toBeDefined();
    expect(verifiedRx.status).toBe('verified');
    expect(verifiedRx.verified_by).toBe(DEV_CAREGIVER_ID);
    expect(verifiedRx.patient_id).toBe(DEV_PATIENT_1_ID);

    // 5. Verify Medications and SI-01 Invariant
    const pendingMed = await db('medications').where({ id: DEV_MED_PENDING_ID }).first();
    expect(pendingMed).toBeDefined();
    expect(pendingMed.verification_status).toBe('pending');
    expect(pendingMed.lifecycle_state).toBeNull(); // SI-12: unverified med has NULL lifecycle
    expect(pendingMed.drug_name).toBe('Amoxicillin');

    const activeMeds = await db('medications')
      .whereIn('id', [DEV_MED_ACTIVE_1_ID, DEV_MED_ACTIVE_2_ID]);
    expect(activeMeds).toHaveLength(2);
    for (const med of activeMeds) {
      expect(med.verification_status).toBe('confirmed');
      expect(med.lifecycle_state).toBe('active');
      expect(med.verified_by).toBe(DEV_CAREGIVER_ID);
    }

    // SI-01 Check: verified prescription has ZERO unconfirmed/rejected medications
    const verifiedRxMeds = await db('medications').where({ prescription_id: DEV_RX_VERIFIED_ID });
    expect(verifiedRxMeds.length).toBeGreaterThan(0);
    const nonConfirmed = verifiedRxMeds.filter((m) => m.verification_status !== 'confirmed');
    expect(nonConfirmed).toHaveLength(0);

    // 6. Verify SI-14 Audit Events
    const auditEvents = await db('medication_audit_events')
      .whereIn('medication_id', [DEV_MED_PENDING_ID, DEV_MED_ACTIVE_1_ID, DEV_MED_ACTIVE_2_ID]);
    expect(auditEvents.length).toBe(5);

    // 7. Verify Reminders & SI-02 / SI-03 Invariant
    const reminders = await db('reminders')
      .whereIn('medication_id', [DEV_MED_PENDING_ID, DEV_MED_ACTIVE_1_ID, DEV_MED_ACTIVE_2_ID]);
    expect(reminders).toHaveLength(2);
    // Ensure zero reminders were generated for the pending medication
    const pendingReminders = reminders.filter((r) => r.medication_id === DEV_MED_PENDING_ID);
    expect(pendingReminders).toHaveLength(0);

    // 8. Verify Adherence Logs
    const adherence = await db('adherence_logs')
      .whereIn('medication_id', [DEV_MED_ACTIVE_1_ID, DEV_MED_ACTIVE_2_ID]);
    expect(adherence).toHaveLength(2);
    expect(adherence.every((a) => a.classification === 'taken')).toBe(true);
  });
});
