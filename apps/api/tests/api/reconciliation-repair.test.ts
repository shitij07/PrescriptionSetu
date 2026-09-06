/**
 * Reconciliation Repair & State Integrity Automated Tests.
 *
 * Authoritative Sources:
 * - `SAFETY_INVARIANTS.md` SI-01, SI-02, SI-03, SI-10, SI-11, SI-12, SI-14, SI-16
 * - `docs/SCHEMA.md` §2.4, §2.5, §9
 */

import type { Knex } from 'knex';
import { getDb } from '../../src/db/connection';
import {
  reconcileVerificationState,
  AnomalyRecord,
} from '../../src/scripts/reconcile-verification-state';

describe('Verification State Reconciliation Repair Script', () => {
  let db: Knex;
  let testPatientId: string;
  let testCaregiverId: string;
  const createdPrescriptionIds: string[] = [];

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

    const [patient] = await db('patients')
      .insert({ full_name: 'Reconciliation SecretPatient' })
      .returning('*');
    testPatientId = patient.id;

    const [caregiver] = await db('caregivers')
      .insert({ full_name: 'Reconciliation Caregiver' })
      .returning('*');
    testCaregiverId = caregiver.id;
  });

  afterAll(async () => {
    if (db) {
      if (createdPrescriptionIds.length > 0) {
        const meds = await db('medications')
          .whereIn('prescription_id', createdPrescriptionIds)
          .select('id');
        const medIds = meds.map((m) => m.id);
        if (medIds.length > 0) {
          await db('reminders').whereIn('medication_id', medIds).del();
          await db('medication_audit_events').whereIn('medication_id', medIds).del();
          await db('medications').whereIn('id', medIds).del();
        }
        await db('prescriptions').whereIn('id', createdPrescriptionIds).del();
      }
      await db('caregivers').where({ id: testCaregiverId }).del();
      await db('patients').where({ id: testPatientId }).del();
      await db.destroy();
    }
  });

  it('1. Dry-run mode detects Class 1, Class 2, and Class 3 anomalies without making mutations', async () => {
    const now = new Date();

    // 1. Setup Class 1 Anomaly: Verified prescription, confirmed med, but lifecycle_state NULL
    const [p1] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
        status: 'verified',
        verified_at: now,
        verified_by: testCaregiverId,
        raw_ocr_text: 'Tab Amoxicillin 500mg 1 tab TDS',
        ocr_confidence: 0.95,
        uploaded_by: testCaregiverId,
      })
      .returning('*');
    createdPrescriptionIds.push(p1.id);

    const [m1] = await db('medications')
      .insert({
        prescription_id: p1.id,
        drug_name: 'SecretAmoxicillin',
        verification_status: 'confirmed',
        lifecycle_state: null, // Anomaly!
        frequency_code: 'THRICE_DAILY',
        times_per_day: 3,
        schedule_derivable: true,
        parse_result: {},
      })
      .returning('*');

    // 2. Setup Class 2 Anomaly: Verified prescription, 1 rejected med, 0 active meds
    const [p2] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
        status: 'verified',
        verified_at: now,
        verified_by: testCaregiverId,
        raw_ocr_text: 'Illegible line',
        ocr_confidence: 0.5,
        uploaded_by: testCaregiverId,
      })
      .returning('*');
    createdPrescriptionIds.push(p2.id);

    const [m2] = await db('medications')
      .insert({
        prescription_id: p2.id,
        drug_name: 'UnrecognizedDrug',
        verification_status: 'rejected',
        lifecycle_state: null,
        lifecycle_reason: 'Unreadable handwriting',
        parse_result: {},
      })
      .returning('*');

    // Add a pending reminder to Class 2 to verify reminder detection
    await db('reminders').insert({
      medication_id: m2.id,
      scheduled_time: new Date(Date.now() + 3600000),
      status: 'pending',
      payload: { type: 'rendered_text', body: 'Test reminder', language: 'mr' },
    });

    // 3. Setup Class 3 Anomaly: Verified prescription, 1 active med AND 1 rejected med
    const [p3] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
        status: 'verified',
        verified_at: now,
        verified_by: testCaregiverId,
        raw_ocr_text: 'Tab Metformin 500mg\nIllegible',
        ocr_confidence: 0.8,
        uploaded_by: testCaregiverId,
      })
      .returning('*');
    createdPrescriptionIds.push(p3.id);

    await db('medications').insert([
      {
        prescription_id: p3.id,
        drug_name: 'SecretMetformin',
        verification_status: 'confirmed',
        lifecycle_state: 'active',
        parse_result: {},
      },
      {
        prescription_id: p3.id,
        drug_name: 'SecretIllegible',
        verification_status: 'rejected',
        lifecycle_state: null,
        parse_result: {},
      },
    ]);

    // Run Dry-Run Reconciliation
    const report = await reconcileVerificationState(db, { execute: false });

    expect(report.mode).toBe('dry_run');
    expect(report.repairs_executed).toBe(0);
    expect(report.anomalies_found).toBeGreaterThanOrEqual(3);

    const class1 = report.anomalies.find((a) => a.prescription_id === p1.id);
    expect(class1?.anomaly_class).toBe('CLASS_1');
    expect(class1?.reconciled).toBe(false);

    const class2 = report.anomalies.find((a) => a.prescription_id === p2.id);
    expect(class2?.anomaly_class).toBe('CLASS_2');
    expect(class2?.pending_reminders_count).toBe(1);
    expect(class2?.reconciled).toBe(false);

    const class3 = report.anomalies.find((a) => a.prescription_id === p3.id);
    expect(class3?.anomaly_class).toBe('CLASS_3');
    expect(class3?.reconciled).toBe(false);

    // Verify database was NOT mutated during dry run
    const m1Check = await db('medications').where({ id: m1.id }).first();
    expect(m1Check.lifecycle_state).toBeNull();

    const p2Check = await db('prescriptions').where({ id: p2.id }).first();
    expect(p2Check.status).toBe('verified');
  });

  it('2. Execute mode repairs Class 1 by activating medications and ensuring reminders exist', async () => {
    // Run with execute: true
    const report = await reconcileVerificationState(db, { execute: true });

    expect(report.mode).toBe('execute');
    expect(report.repairs_executed).toBeGreaterThanOrEqual(2);

    // Verify Class 1 was repaired
    const p1Id = createdPrescriptionIds[0];
    const m1After = await db('medications').where({ prescription_id: p1Id }).first();
    expect(m1After.lifecycle_state).toBe('active');
    expect(m1After.lifecycle_changed_at).not.toBeNull();

    // Verify reminders were generated for schedulable Class 1 med
    const reminders = await db('reminders').where({ medication_id: m1After.id });
    expect(reminders.length).toBeGreaterThan(0);

    // Verify NO duplicate or synthetic audit events were inserted
    const auditEvents = await db('medication_audit_events').where({ medication_id: m1After.id });
    const invalidTypes = auditEvents.filter(
      (e) => !['parsed', 'confirmed', 'corrected', 'rejected', 'stopped'].includes(e.event_type),
    );
    expect(invalidTypes.length).toBe(0);
  });

  it('3. Execute mode repairs Class 2 by cancelling pending reminders and reverting prescription', async () => {
    const p2Id = createdPrescriptionIds[1];

    // Prescription should be reverted to pending_verification
    const p2After = await db('prescriptions').where({ id: p2Id }).first();
    expect(p2After.status).toBe('pending_verification');
    expect(p2After.verified_at).toBeNull();
    expect(p2After.verified_by).toBeNull();

    // Reminders for Class 2 should be cancelled
    const m2 = await db('medications').where({ prescription_id: p2Id }).first();
    const reminders = await db('reminders').where({ medication_id: m2.id });
    expect(reminders.length).toBe(1);
    expect(reminders[0].status).toBe('cancelled');
    expect(reminders[0].cancelled_at).not.toBeNull();

    // Medication should still be rejected and inactive
    expect(m2.verification_status).toBe('rejected');
    expect(m2.lifecycle_state).toBeNull();
  });

  it('4. Class 3 is strictly protected from automatic mutation', async () => {
    const p3Id = createdPrescriptionIds[2];

    const p3After = await db('prescriptions').where({ id: p3Id }).first();
    expect(p3After.status).toBe('verified');

    const meds = await db('medications').where({ prescription_id: p3Id });
    const activeMed = meds.find((m) => m.drug_name === 'SecretMetformin');
    const rejectedMed = meds.find((m) => m.drug_name === 'SecretIllegible');
    expect(activeMed?.lifecycle_state).toBe('active');
    expect(rejectedMed?.lifecycle_state).toBeNull();
  });

  it('5. Idempotency: Re-running reconciliation detects zero Class 1 or Class 2 anomalies', async () => {
    const secondReport = await reconcileVerificationState(db, { execute: true });
    expect(secondReport.class_1_count).toBe(0);
    expect(secondReport.class_2_count).toBe(0);
    // Class 3 remains reported for human review
    expect(secondReport.class_3_count).toBe(1);
    expect(secondReport.repairs_executed).toBe(0);
  });

  it('6. SI-16 Privacy: Structured report contains zero patient names and zero drug names', async () => {
    const report = await reconcileVerificationState(db, { execute: false });
    const serialized = JSON.stringify(report);

    // Confirm no PHI in report
    expect(serialized).not.toContain('SecretPatient');
    expect(serialized).not.toContain('SecretAmoxicillin');
    expect(serialized).not.toContain('SecretMetformin');
    expect(serialized).not.toContain('SecretIllegible');
  });
});
