/**
 * PostgreSQL Schema Integrity & Verification Integration Tests.
 * Authoritative sources: `docs/SCHEMA.md` v0.1.0, `docs/API_CONTRACTS.md`, `SAFETY_INVARIANTS.md`.
 */

import { getDb, closeDb } from '../../src/db/connection';
import { savePrescriptionWithParseResult } from '../../src/db/repository';
import { confirmMedication, correctMedication, rejectMedication, verifyPrescription } from '../../src/verification/gate';
import { isMedicationDeliverable, canGenerateReminders } from '../../src/verification/guards';
import { parse } from '../../src/parser/parse';
import type { Knex } from 'knex';

describe('PostgreSQL Schema Integrity & Safety Invariants', () => {
  let db: Knex;
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

    // Create fixture patient and caregiver
    const [patient] = await db('patients')
      .insert({
        full_name: 'Anandi Gopal Joshi',
        preferred_language: 'mr',
      })
      .returning('*');
    testPatientId = patient.id;

    const [caregiver] = await db('caregivers')
      .insert({
        full_name: 'Ramesh Joshi',
      })
      .returning('*');
    testCaregiverId = caregiver.id;
  });

  afterAll(async () => {
    // Clean up test data
    if (db) {
      const pRows = await db('prescriptions').where({ patient_id: testPatientId }).select('id');
      const pIds = pRows.map((p: any) => p.id);
      if (pIds.length > 0) {
        const mRows = await db('medications').whereIn('prescription_id', pIds).select('id');
        const mIds = mRows.map((m: any) => m.id);
        if (mIds.length > 0) {
          await db('adherence_logs').whereIn('medication_id', mIds).del();
          await db('medication_audit_events').whereIn('medication_id', mIds).del();
        }
        await db('medications').whereIn('prescription_id', pIds).del();
        await db('prescriptions').whereIn('id', pIds).del();
      }
      await db('patient_caregivers').where({ patient_id: testPatientId }).del();
      await db('caregivers').where({ id: testCaregiverId }).del();
      await db('patients').where({ id: testPatientId }).del();
      await db.destroy();
    }
  });

  it('1. enforces prescription status CHECK constraint', async () => {
    await expect(
      db('prescriptions').insert({
        patient_id: testPatientId,
        status: 'invalid_status_value',
      }),
    ).rejects.toThrow(/chk_prescription_status/);
  });

  it('2. enforces medication verification_status CHECK constraint', async () => {
    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
        status: 'pending_verification',
      })
      .returning('*');

    await expect(
      db('medications').insert({
        prescription_id: prescription.id,
        verification_status: 'invalid_verification',
      }),
    ).rejects.toThrow(/chk_medication_verification_status/);
  });

  it('3. enforces medication lifecycle_state CHECK constraint', async () => {
    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
        status: 'pending_verification',
      })
      .returning('*');

    await expect(
      db('medications').insert({
        prescription_id: prescription.id,
        verification_status: 'pending',
        lifecycle_state: 'invalid_lifecycle',
      }),
    ).rejects.toThrow(/chk_medication_lifecycle_state/);
  });

  it('4. enforces frequency_code and times_per_day CHECK constraints', async () => {
    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
      })
      .returning('*');

    // Invalid frequency code
    await expect(
      db('medications').insert({
        prescription_id: prescription.id,
        frequency_code: 'FIVE_TIMES_DAILY',
      }),
    ).rejects.toThrow(/chk_medication_frequency_code/);

    // Invalid times per day (> 4)
    await expect(
      db('medications').insert({
        prescription_id: prescription.id,
        times_per_day: 5,
      }),
    ).rejects.toThrow(/chk_medication_times_per_day/);
  });

  it('5. enforces unit CHECK constraints (dose_unit, dose_strength_unit, duration_unit)', async () => {
    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
      })
      .returning('*');

    await expect(
      db('medications').insert({
        prescription_id: prescription.id,
        dose_unit: 'drop', // only 'tablet' or 'ml'
      }),
    ).rejects.toThrow(/chk_medication_dose_unit/);

    await expect(
      db('medications').insert({
        prescription_id: prescription.id,
        dose_strength_unit: 'IU', // only 'mg', 'mcg', 'g'
      }),
    ).rejects.toThrow(/chk_medication_dose_strength_unit/);

    await expect(
      db('medications').insert({
        prescription_id: prescription.id,
        duration_unit: 'month', // only 'day', 'week'
      }),
    ).rejects.toThrow(/chk_medication_duration_unit/);
  });

  it('6. clinical fields and SI-08 ceiling fields carry no DB defaults and are nullable', async () => {
    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
      })
      .returning('*');

    const [med] = await db('medications')
      .insert({
        prescription_id: prescription.id,
      })
      .returning('*');

    expect(med.frequency_code).toBeNull();
    expect(med.times_per_day).toBeNull();
    expect(med.timing_anchors).toBeNull();
    expect(med.dose_amount).toBeNull();
    expect(med.dose_unit).toBeNull();
    expect(med.dose_strength_value).toBeNull();
    expect(med.dose_strength_unit).toBeNull();
    expect(med.duration_value).toBeNull();
    expect(med.duration_unit).toBeNull();
    expect(med.as_needed).toBeNull();
    expect(med.max_doses_per_day).toBeNull();
    expect(med.min_interval_hours).toBeNull();
    expect(med.verification_status).toBe('pending');
    expect(med.lifecycle_state).toBeNull();
  });

  it('7. enforces patient_caregiver role and adherence_log classification CHECK constraints', async () => {
    // Invalid patient_caregiver role
    await expect(
      db('patient_caregivers').insert({
        patient_id: testPatientId,
        caregiver_id: testCaregiverId,
        role: 'admin',
      }),
    ).rejects.toThrow(/chk_patient_caregiver_role/);

    // Invalid adherence classification
    await expect(
      db('adherence_logs').insert({
        classification: 'unknown_reply',
      }),
    ).rejects.toThrow(/chk_adherence_classification/);
  });

  it('8. enforces audit event_type CHECK constraint', async () => {
    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
      })
      .returning('*');

    const [med] = await db('medications')
      .insert({
        prescription_id: prescription.id,
      })
      .returning('*');

    await expect(
      db('medication_audit_events').insert({
        medication_id: med.id,
        event_type: 'deleted_item',
      }),
    ).rejects.toThrow(/chk_audit_event_type/);
  });

  it('9. executes end-to-end parser persistence, verification gate, and deliverability verification', async () => {
    const rawOcr = 'Tab Metformin 500mg 1 tab BD\nTab Paracetamol 500mg 1 tab SOS';
    const parseResult = parse(rawOcr);

    expect(parseResult.candidates).toHaveLength(2);

    // 1. Persist parser result
    const saved = await savePrescriptionWithParseResult(
      db,
      testPatientId,
      testCaregiverId,
      rawOcr,
      parseResult,
    );

    expect(saved.prescription.status).toBe('pending_verification');
    expect(saved.medications).toHaveLength(2);
    expect(saved.medications[0].verification_status).toBe('pending');
    expect(saved.medications[0].lifecycle_state).toBeNull();
    expect(saved.medications[1].verification_status).toBe('pending');
    expect(saved.medications[1].lifecycle_state).toBeNull();

    // Verify SI-02 deliverability guard at pending state
    expect(isMedicationDeliverable(saved.medications[0])).toBe(false);
    expect(canGenerateReminders(saved.medications[0])).toBe(false);

    // 2. Attempt gate transition while medications are pending -> MUST REJECT (SI-01)
    await expect(
      verifyPrescription(db, saved.prescription.id, testCaregiverId),
    ).rejects.toThrow('Cannot verify prescription: medication is still pending verification');

    // 3. Confirm first medication
    await confirmMedication(db, saved.medications[0].id, testCaregiverId);

    // 4. Correct second medication (enter max doses per day)
    await correctMedication(
      db,
      saved.medications[1].id,
      { max_doses_per_day: 3 },
      testCaregiverId,
      'Added max daily ceiling per doctor note',
    );

    // 5. Now execute SI-01 gate -> MUST SUCCEED
    const gateResult = await verifyPrescription(db, saved.prescription.id, testCaregiverId);
    expect(gateResult.success).toBe(true);
    expect(gateResult.prescription_status).toBe('verified');

    // 6. Reload updated records from PostgreSQL
    const updatedPrescription = await db('prescriptions').where({ id: saved.prescription.id }).first();
    const updatedMeds = await db('medications')
      .where({ prescription_id: saved.prescription.id })
      .orderBy('id');

    expect(updatedPrescription.status).toBe('verified');
    expect(updatedPrescription.verified_by).toBe(testCaregiverId);
    expect(updatedPrescription.verified_at).not.toBeNull();

    // Both medications are now active (SI-01)
    expect(updatedMeds[0].lifecycle_state).toBe('active');
    expect(updatedMeds[1].lifecycle_state).toBe('active');

    // Deliverability Check (SI-02 / SI-03)
    expect(isMedicationDeliverable(updatedMeds[0])).toBe(true);
    expect(isMedicationDeliverable(updatedMeds[1])).toBe(true);

    // Initial parser state: schedule_derivable is null for BD (not yet scheduled) and false for SOS
    expect(canGenerateReminders(updatedMeds[0])).toBe(false); // null schedule_derivable cannot generate reminders
    expect(canGenerateReminders(updatedMeds[1])).toBe(false); // false schedule_derivable (SOS) cannot generate reminders

    // When anchor times are resolved and schedule_derivable is promoted to true (SCHEMA §2.5, API_CONTRACTS §4.4):
    const schedulableMed = { ...updatedMeds[0], schedule_derivable: true };
    expect(canGenerateReminders(schedulableMed)).toBe(true);

    // Verify Audit Trail (SI-14)
    const auditEvents = await db('medication_audit_events')
      .whereIn('medication_id', [saved.medications[0].id, saved.medications[1].id])
      .orderBy('created_at', 'asc');

    // Expected events: 2 'parsed', 1 'confirmed', 1 'corrected'
    expect(auditEvents.length).toBeGreaterThanOrEqual(4);
    const eventTypes = auditEvents.map((e) => e.event_type);
    expect(eventTypes).toContain('parsed');
    expect(eventTypes).toContain('confirmed');
    expect(eventTypes).toContain('corrected');
  });
});
