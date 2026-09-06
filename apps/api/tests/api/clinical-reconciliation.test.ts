/**
 * Clinical Discrepancy Reconciliation Automated Tests.
 * Authoritative source: `apps/api/src/scripts/reconcile-clinical-discrepancies.ts`.
 */

import type { Knex } from 'knex';
import { getDb } from '../../src/db/connection';
import { reconcileClinicalDiscrepancy } from '../../src/scripts/reconcile-clinical-discrepancies';

describe('Clinical Discrepancy Reconciliation Script', () => {
  let db: Knex;
  let testPatientId: string;
  let testPrescriptionId: string;
  let testMedicationId: string;
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

    const [caregiver] = await db('caregivers')
      .insert({ full_name: 'Test Clinical Caregiver' })
      .returning('*');
    testCaregiverId = caregiver.id;

    const [patient] = await db('patients')
      .insert({ full_name: 'Test Clinical Patient' })
      .returning('*');
    testPatientId = patient.id;

    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
        status: 'verified',
        raw_ocr_text: 'Amoxicillin 500mg 1 tab TDS',
        verified_by: testCaregiverId,
      })
      .returning('*');
    testPrescriptionId = prescription.id;

    const [medication] = await db('medications')
      .insert({
        prescription_id: testPrescriptionId,
        verification_status: 'confirmed',
        lifecycle_state: 'active',
        dose_strength_value: 500,
        dose_strength_unit: 'mcg', // Discrepancy!
        as_needed: true, // Discrepancy!
        duration_unit: 'week', // Discrepancy!
        frequency_code: 'THRICE_DAILY',
        times_per_day: 3,
        parse_result: {
          dose_strength_value: 500,
          dose_strength_unit: 'mg',
          as_needed: null,
          duration_unit: null,
          frequency_code: 'THRICE_DAILY',
          times_per_day: 3,
          matches: [
            {
              rule_id: 'STR-MASS-001',
              match_type: 'regex',
              source_span: { start: 12, end: 17 },
              matched_literal: '500mg',
              dictionary_version: '0.1.0',
            },
          ],
        },
      })
      .returning('*');
    testMedicationId = medication.id;
  });

  afterAll(async () => {
    if (db) {
      if (testMedicationId) {
        await db('reminders').where({ medication_id: testMedicationId }).del();
        await db('medication_audit_events').where({ medication_id: testMedicationId }).del();
        await db('medications').where({ id: testMedicationId }).del();
      }
      if (testPrescriptionId) {
        await db('prescriptions').where({ id: testPrescriptionId }).del();
      }
      if (testPatientId) {
        await db('patients').where({ id: testPatientId }).del();
      }
      if (testCaregiverId) {
        await db('caregivers').where({ id: testCaregiverId }).del();
      }
      await db.destroy();
    }
  });

  it('detects discrepancies in dry-run mode without altering the database', async () => {
    const report = await reconcileClinicalDiscrepancy(db, {
      execute: false,
      medicationId: testMedicationId,
    });

    expect(report.mode).toBe('dry_run');
    expect(report.reconciled).toBe(false);
    expect(report.discrepancies_detected.strength_unit.current).toBe('mcg');
    expect(report.discrepancies_detected.strength_unit.canonical).toBe('mg');
    expect(report.discrepancies_detected.as_needed.current).toBe(true);
    expect(report.discrepancies_detected.as_needed.canonical).toBe(false);

    // Verify DB was NOT modified
    const medInDb = await db('medications').where({ id: testMedicationId }).first();
    expect(medInDb.dose_strength_unit).toBe('mcg');
    expect(medInDb.as_needed).toBe(true);
  });

  it('reconciles discrepancies in execute mode, updates database row, and writes SI-14 audit event', async () => {
    const report = await reconcileClinicalDiscrepancy(db, {
      execute: true,
      medicationId: testMedicationId,
    });

    expect(report.mode).toBe('execute');
    expect(report.reconciled).toBe(true);
    expect(report.audit_event_id).toBeDefined();

    // Verify DB was modified
    const medInDb = await db('medications').where({ id: testMedicationId }).first();
    expect(medInDb.dose_strength_unit).toBe('mg');
    expect(medInDb.as_needed).toBe(false);
    expect(medInDb.duration_unit).toBeNull();

    // Verify audit event exists
    const auditEvent = await db('medication_audit_events')
      .where({ id: report.audit_event_id })
      .first();
    expect(auditEvent).toBeDefined();
    expect(auditEvent.event_type).toBe('corrected');
    expect(auditEvent.reason).toContain('canonical OCR parse');
  });

  it('is idempotent on subsequent execution when no discrepancies remain', async () => {
    const report = await reconcileClinicalDiscrepancy(db, {
      execute: true,
      medicationId: testMedicationId,
    });

    expect(report.reconciled).toBe(false);
    expect(report.audit_event_id).toBeUndefined();
    expect(report.discrepancies_detected.strength_unit.current).toBe('mg');
    expect(report.discrepancies_detected.strength_unit.canonical).toBe('mg');
    expect(report.discrepancies_detected.as_needed.current).toBe(false);
    expect(report.discrepancies_detected.as_needed.canonical).toBe(false);
  });
});
