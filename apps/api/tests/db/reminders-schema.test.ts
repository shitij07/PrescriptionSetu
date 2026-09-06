/**
 * Reminders Table Schema Integrity Integration Tests.
 * Authoritative sources: `docs/SCHEMA.md` §2.6, `docs/DECISIONS.md` D-030.
 */

import { getDb } from '../../src/db/connection';
import type { Knex } from 'knex';
import type { ReminderRecord, ReminderPayload } from '../../src/domain/types';

describe('Reminders Table Schema Integrity (D-030 / OQ-02 resolved)', () => {
  let db: Knex;
  let testPatientId: string;
  let testCaregiverId: string;
  let testPrescriptionId: string;
  let testMedicationId: string;

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
      .insert({ full_name: 'Reminder Test Patient', preferred_language: 'mr' })
      .returning('*');
    testPatientId = patient.id;

    const [caregiver] = await db('caregivers')
      .insert({ full_name: 'Reminder Test Caregiver' })
      .returning('*');
    testCaregiverId = caregiver.id;

    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
        uploaded_by: testCaregiverId,
        raw_ocr_text: 'Tab Metformin 500mg BD',
        status: 'verified',
        verified_by: testCaregiverId,
        verified_at: new Date(),
      })
      .returning('*');
    testPrescriptionId = prescription.id;

    const [medication] = await db('medications')
      .insert({
        prescription_id: testPrescriptionId,
        drug_name: 'Metformin',
        frequency_code: 'TWICE_DAILY',
        times_per_day: 2,
        verification_status: 'confirmed',
        lifecycle_state: 'active',
        verified_by: testCaregiverId,
        verified_at: new Date(),
      })
      .returning('*');
    testMedicationId = medication.id;
  });

  afterAll(async () => {
    if (db) {
      const hasReminders = await db.schema.hasTable('reminders');
      if (hasReminders) {
        await db('reminders').where({ medication_id: testMedicationId }).del();
      }
      await db('medications').where({ id: testMedicationId }).del();
      await db('prescriptions').where({ id: testPrescriptionId }).del();
      await db('caregivers').where({ id: testCaregiverId }).del();
      await db('patients').where({ id: testPatientId }).del();
      await db.destroy();
    }
  });

  it('1. persists and round-trips a rendered_text payload (D-030 Variant 1)', async () => {
    const renderedPayload: ReminderPayload = {
      type: 'rendered_text',
      body: 'नमस्कार, मेटफॉर्मिन ५०० मि.ग्रॅ. १ गोळी घेण्याची वेळ झाली आहे.',
      language: 'mr',
    };

    const [reminder] = await db('reminders')
      .insert({
        medication_id: testMedicationId,
        scheduled_time: '2026-08-30T08:00:00+05:30',
        payload: renderedPayload,
      })
      .returning('*');

    expect(reminder.id).toBeDefined();
    expect(reminder.medication_id).toBe(testMedicationId);
    expect(reminder.status).toBe('pending');
    expect(reminder.attempt_count).toBe(0);
    expect(reminder.payload).toEqual(renderedPayload);
    expect(new Date(reminder.scheduled_time)).toEqual(new Date('2026-08-30T08:00:00+05:30'));
  });

  it('2. persists and round-trips a template payload (D-030 Variant 2)', async () => {
    const templatePayload: ReminderPayload = {
      type: 'template',
      template_name: 'medication_reminder_v1',
      language: 'mr',
      variables: ['मेटफॉर्मिन', '१ गोळी'],
    };

    const [reminder] = await db('reminders')
      .insert({
        medication_id: testMedicationId,
        scheduled_time: '2026-08-30T20:00:00+05:30',
        status: 'pending',
        payload: templatePayload,
      })
      .returning('*');

    expect(reminder.id).toBeDefined();
    expect(reminder.payload).toEqual(templatePayload);
  });

  it('3. rejects invalid status enum value via check constraint', async () => {
    const payload: ReminderPayload = {
      type: 'rendered_text',
      body: 'Test reminder body',
      language: 'en',
    };

    await expect(
      db('reminders').insert({
        medication_id: testMedicationId,
        scheduled_time: '2026-08-30T08:00:00+05:30',
        status: 'queued', // Disallowed status (only pending, sent, failed, cancelled)
        payload,
      }),
    ).rejects.toThrow();
  });

  it('4. enforces foreign key constraint to medications.id', async () => {
    const nonExistentMedId = '99999999-9999-9999-9999-999999999999';
    const payload: ReminderPayload = {
      type: 'rendered_text',
      body: 'Test reminder body',
      language: 'en',
    };

    await expect(
      db('reminders').insert({
        medication_id: nonExistentMedId,
        scheduled_time: '2026-08-30T08:00:00+05:30',
        payload,
      }),
    ).rejects.toThrow();
  });
});
