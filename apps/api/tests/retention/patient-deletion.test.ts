/**
 * DPDP Patient Erasure & Data Lifecycle Service Integration Tests.
 * Authoritative sources: `SAFETY_INVARIANTS.md` SI-10, SI-11, SI-14, SI-16, `PercriptionSetuMASTERPLAN.md` §26, `docs/SCHEMA.md` §2.1, §10.
 */

import type { Knex } from 'knex';
import { getDb } from '../../src/db/connection';
import { deletePatient, deleteCaregiver } from '../../src/retention/service';

describe('DPDP Patient & Caregiver Erasure Service', () => {
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

  const cleanTables = async () => {
    await db('adherence_logs').delete();
    await db('reminders').delete();
    await db('medication_audit_events').delete();
    await db('medications').delete();
    await db('prescriptions').delete();
    await db('patient_caregivers').delete();
    await db('caregivers').delete();
    await db('patients').delete();
  };

  beforeEach(async () => {
    await cleanTables();
  });

  afterEach(async () => {
    await cleanTables();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('atomically redacts patient PII, unlinks caregivers, cancels pending reminders, and records audit trail', async () => {
    // 1. Seed patient, caregiver, prescription, medication, reminders
    const [patient] = await db('patients')
      .insert({
        full_name: 'Anand K. Joshi',
        phone_number: '+919876543210',
        preferred_language: 'mr',
        meal_times: JSON.stringify({ breakfast: '08:30', lunch: '13:00', dinner: '20:30' }),
      })
      .returning('*');

    const [caregiver] = await db('caregivers')
      .insert({
        full_name: 'Sunita Joshi',
        phone_number: '+919988776655',
      })
      .returning('*');

    await db('patient_caregivers').insert({
      patient_id: patient.id,
      caregiver_id: caregiver.id,
      role: 'uploader',
    });

    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: patient.id,
        uploaded_by: caregiver.id,
        raw_ocr_text: 'Tab Metformin 500mg BD',
        image_storage_key: 'prescriptions/img-123.jpg',
        status: 'verified',
        verified_at: new Date(),
        verified_by: caregiver.id,
      })
      .returning('*');

    const [medication] = await db('medications')
      .insert({
        prescription_id: prescription.id,
        drug_name: 'Metformin',
        frequency_code: 'TWICE_DAILY',
        dose_amount: JSON.stringify({ value: '1', unit: 'tablet' }),
        dose_unit: 'tablet',
        timing_anchors: ['AFTER_MEAL'],
        lifecycle_state: 'active',
        verification_status: 'confirmed',
        parse_result: {
          drug_name: 'Metformin',
          source_span: { start: 0, end: 23, matched_literal: 'Tab Metformin 500mg BD' },
        },
      })
      .returning('*');

    // Insert 2 pending reminders, 1 already sent reminder
    const [remPending1] = await db('reminders')
      .insert({
        medication_id: medication.id,
        scheduled_time: new Date(Date.now() + 3600000),
        status: 'pending',
        payload: { type: 'rendered_text', body: 'औषध घ्या', language: 'mr' },
      })
      .returning('*');

    const [remPending2] = await db('reminders')
      .insert({
        medication_id: medication.id,
        scheduled_time: new Date(Date.now() + 7200000),
        status: 'pending',
        payload: { type: 'rendered_text', body: 'औषध घ्या', language: 'mr' },
      })
      .returning('*');

    const [remSent] = await db('reminders')
      .insert({
        medication_id: medication.id,
        scheduled_time: new Date(Date.now() - 3600000),
        status: 'sent',
        sent_at: new Date(Date.now() - 3500000),
        payload: { type: 'rendered_text', body: 'औषध घ्या', language: 'mr' },
      })
      .returning('*');

    // 2. Execute DPDP deletion
    const result = await deletePatient(db, patient.id, caregiver.id);

    expect(result.success).toBe(true);
    expect(result.patient_id).toBe(patient.id);
    expect(result.cancelled_reminders_count).toBe(2);
    expect(result.stopped_medications_count).toBe(1);

    // 3. Verify patient PII scrubbed
    const updatedPatient = await db('patients').where({ id: patient.id }).first();
    expect(updatedPatient.deleted_at).not.toBeNull();
    expect(updatedPatient.full_name).toBe('[DELETED_PATIENT]');
    expect(updatedPatient.phone_number).toBeNull();
    expect(updatedPatient.meal_times).toBeNull();

    // 4. Verify caregiver unlinked
    const links = await db('patient_caregivers').where({ patient_id: patient.id });
    expect(links).toHaveLength(0);

    // 5. Verify reminder statuses
    const updatedPending1 = await db('reminders').where({ id: remPending1.id }).first();
    expect(updatedPending1.status).toBe('cancelled');
    expect(updatedPending1.cancelled_at).not.toBeNull();

    const updatedPending2 = await db('reminders').where({ id: remPending2.id }).first();
    expect(updatedPending2.status).toBe('cancelled');
    expect(updatedPending2.cancelled_at).not.toBeNull();

    const updatedSent = await db('reminders').where({ id: remSent.id }).first();
    expect(updatedSent.status).toBe('sent'); // already-sent reminders remain untouched

    // 6. Verify medication lifecycle stopped
    const updatedMed = await db('medications').where({ id: medication.id }).first();
    expect(updatedMed.lifecycle_state).toBe('stopped');
    expect(updatedMed.lifecycle_reason).toBe('PATIENT_ERASURE_REQUEST');

    // 7. Verify audit trail appended (SI-14)
    const auditEvents = await db('medication_audit_events')
      .where({ medication_id: medication.id, event_type: 'stopped' });
    expect(auditEvents.length).toBeGreaterThanOrEqual(1);
    expect(auditEvents[0].reason).toBe('PATIENT_ERASURE_REQUEST');

    // 8. Verify prescription image key cleared
    const updatedPrescription = await db('prescriptions').where({ id: prescription.id }).first();
    expect(updatedPrescription.image_storage_key).toBeNull();
  });

  it('returns false / throws meaningful error for non-existent patient', async () => {
    await expect(deletePatient(db, '00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      'PATIENT_NOT_FOUND',
    );
  });

  it('redacts caregiver PII on deleteCaregiver', async () => {
    const [caregiver] = await db('caregivers')
      .insert({
        full_name: 'Caregiver To Delete',
        phone_number: '+919123456789',
      })
      .returning('*');

    const result = await deleteCaregiver(db, caregiver.id);
    expect(result.success).toBe(true);

    const updated = await db('caregivers').where({ id: caregiver.id }).first();
    expect(updated.deleted_at).not.toBeNull();
    expect(updated.full_name).toBe('[DELETED_CAREGIVER]');
    expect(updated.phone_number).toBeNull();
  });
});
