/**
 * Adherence Service Integration Tests.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 7, `PercriptionSetuMASTERPLAN.md` §18.9, `docs/SCHEMA.md` §2.7, `SAFETY_INVARIANTS.md` SI-09, SI-14, SI-15, SI-16.
 */

import { getDb } from '../../src/db/connection';
import { ConsoleProvider } from '../../src/delivery/console-provider';
import { recordAdherenceReply, getAdherenceLogsForMedication, getAdherenceSummaryForPatient } from '../../src/adherence/service';
import type { Knex } from 'knex';

describe('Adherence Service', () => {
  let db: Knex;
  let testPatientId: string;
  let testCaregiverId: string;
  let testPrescriptionId: string;
  let testMedicationId: string;
  let testReminderId: string;

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

  beforeEach(async () => {
    // 1. Create Patient
    const [patient] = await db('patients')
      .insert({
        full_name: 'Adherence Test Patient',
        phone_number: '+919876543210',
        preferred_language: 'mr',
      })
      .returning('*');
    testPatientId = patient.id;

    // 2. Create Caregiver
    const [caregiver] = await db('caregivers')
      .insert({
        full_name: 'Adherence Test Caregiver',
        phone_number: '+919988776655',
      })
      .returning('*');
    testCaregiverId = caregiver.id;

    // 3. Link Patient to Caregiver with role 'adherence_recipient'
    await db('patient_caregivers').insert({
      patient_id: testPatientId,
      caregiver_id: testCaregiverId,
      role: 'adherence_recipient',
    });

    // 4. Create Prescription
    const [prescription] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
        status: 'verified',
      })
      .returning('*');
    testPrescriptionId = prescription.id;

    // 5. Create Medication
    const [medication] = await db('medications')
      .insert({
        prescription_id: testPrescriptionId,
        drug_name: 'Metformin 500mg',
        verification_status: 'confirmed',
        lifecycle_state: 'active',
        schedule_derivable: true,
        frequency_code: 'TWICE_DAILY',
      })
      .returning('*');
    testMedicationId = medication.id;

    // 6. Create Reminder
    const [reminder] = await db('reminders')
      .insert({
        medication_id: testMedicationId,
        scheduled_time: new Date(),
        status: 'sent',
        payload: {
          type: 'rendered_text',
          body: 'नमस्कार, मेटफॉर्मिन घेण्याची वेळ झाली आहे.',
          language: 'mr',
        },
      })
      .returning('*');
    testReminderId = reminder.id;
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

  describe('Adherence Logging Persistence', () => {
    it('persists a positive "taken" reply with excluded_from_stats = false and escalated_at = null', async () => {
      const consoleProvider = new ConsoleProvider();

      const result = await recordAdherenceReply(
        db,
        {
          reminder_id: testReminderId,
          raw_reply_text: 'होय, घेतली',
        },
        consoleProvider,
      );

      expect(result.success).toBe(true);
      expect(result.adherence_log.classification).toBe('taken');
      expect(result.adherence_log.excluded_from_stats).toBe(false);
      expect(result.adherence_log.escalated_at).toBeNull();
      expect(result.adherence_log.medication_id).toBe(testMedicationId);
      expect(result.adherence_log.reminder_id).toBe(testReminderId);

      // Verify row in PostgreSQL database
      const row = await db('adherence_logs').where({ id: result.adherence_log.id }).first();
      expect(row).toBeDefined();
      expect(row.classification).toBe('taken');
      expect(row.excluded_from_stats).toBe(false);
      expect(row.escalated_at).toBeNull();

      // Zero caregiver escalation calls
      expect(consoleProvider.sentMessages).toHaveLength(0);
    });

    it('persists a "missed" reply with excluded_from_stats = false and escalated_at = null', async () => {
      const consoleProvider = new ConsoleProvider();

      const result = await recordAdherenceReply(
        db,
        {
          reminder_id: testReminderId,
          raw_reply_text: 'नाही, विसरलो',
        },
        consoleProvider,
      );

      expect(result.success).toBe(true);
      expect(result.adherence_log.classification).toBe('missed');
      expect(result.adherence_log.excluded_from_stats).toBe(false);
      expect(result.adherence_log.escalated_at).toBeNull();
      expect(consoleProvider.sentMessages).toHaveLength(0);
    });

    it('persists an "unclear" reply with excluded_from_stats = false and escalated_at = null', async () => {
      const consoleProvider = new ConsoleProvider();

      const result = await recordAdherenceReply(
        db,
        {
          reminder_id: testReminderId,
          raw_reply_text: 'Where is the pharmacy?',
        },
        consoleProvider,
      );

      expect(result.success).toBe(true);
      expect(result.adherence_log.classification).toBe('unclear');
      expect(result.adherence_log.excluded_from_stats).toBe(false);
      expect(result.adherence_log.escalated_at).toBeNull();
    });

    it('supports unsolicited adherence response with direct medication_id without reminder_id', async () => {
      const consoleProvider = new ConsoleProvider();

      const result = await recordAdherenceReply(
        db,
        {
          medication_id: testMedicationId,
          raw_reply_text: 'घेतली',
        },
        consoleProvider,
      );

      expect(result.success).toBe(true);
      expect(result.adherence_log.classification).toBe('taken');
      expect(result.adherence_log.medication_id).toBe(testMedicationId);
      expect(result.adherence_log.reminder_id).toBeNull();
    });
  });

  describe('Caregiver Escalation for Needs Attention (Safety Precedence)', () => {
    it('persists "needs_attention", sets excluded_from_stats = true, and dispatches escalation alert to caregiver', async () => {
      const consoleProvider = new ConsoleProvider();

      const result = await recordAdherenceReply(
        db,
        {
          reminder_id: testReminderId,
          raw_reply_text: 'Yes took it but feeling dizzy and vomit',
        },
        consoleProvider,
      );

      expect(result.success).toBe(true);
      expect(result.adherence_log.classification).toBe('needs_attention');
      expect(result.adherence_log.excluded_from_stats).toBe(true);
      expect(result.adherence_log.escalated_at).toBeInstanceOf(Date);

      // Verify escalation message sent to caregiver
      expect(consoleProvider.sentMessages).toHaveLength(1);
      const escalationMsg = consoleProvider.sentMessages[0];
      expect(escalationMsg.destination).toBe('+919988776655'); // Caregiver phone
      expect(escalationMsg.payload.type).toBe('rendered_text');
      if (escalationMsg.payload.type === 'rendered_text') {
        expect(escalationMsg.payload.body).toMatch(/Alert|लक्ष द्या/);
      }
    });

    it('records adherence safely with escalated_at = null if caregiver alert dispatch fails', async () => {
      const failingProvider = {
        sendMessage: jest.fn().mockResolvedValue({
          success: false,
          error_code: 'TWILIO_NETWORK_ERROR',
        }),
      };

      const result = await recordAdherenceReply(
        db,
        {
          reminder_id: testReminderId,
          raw_reply_text: 'औषध बंद केले खूप चक्कर येत आहे',
        },
        failingProvider,
      );

      // Adherence record MUST still be safely preserved
      expect(result.success).toBe(true);
      expect(result.adherence_log.classification).toBe('needs_attention');
      expect(result.adherence_log.excluded_from_stats).toBe(true);
      expect(result.adherence_log.escalated_at).toBeNull(); // Not marked escalated

      // Verify row exists in DB
      const row = await db('adherence_logs').where({ id: result.adherence_log.id }).first();
      expect(row).toBeDefined();
      expect(row.classification).toBe('needs_attention');
      expect(row.excluded_from_stats).toBe(true);
      expect(row.escalated_at).toBeNull();
    });

    it('handles escalation gracefully when patient has no linked caregivers', async () => {
      // Remove caregiver link
      await db('patient_caregivers').delete();

      const consoleProvider = new ConsoleProvider();

      const result = await recordAdherenceReply(
        db,
        {
          reminder_id: testReminderId,
          raw_reply_text: 'I stopped taking this',
        },
        consoleProvider,
      );

      expect(result.success).toBe(true);
      expect(result.adherence_log.classification).toBe('needs_attention');
      expect(result.adherence_log.excluded_from_stats).toBe(true);
      expect(result.adherence_log.escalated_at).toBeNull();
      expect(consoleProvider.sentMessages).toHaveLength(0);
    });
  });

  describe('Lifecycle Safety (Stopped Medications & Cancelled Reminders)', () => {
    it('records reply on stopped medication without altering lifecycle_state or resurrecting reminders', async () => {
      // Stop the medication
      await db('medications')
        .where({ id: testMedicationId })
        .update({ lifecycle_state: 'stopped', lifecycle_reason: 'Patient adverse reaction' });

      // Cancel the reminder
      await db('reminders')
        .where({ id: testReminderId })
        .update({ status: 'cancelled', cancelled_at: new Date() });

      const consoleProvider = new ConsoleProvider();

      const result = await recordAdherenceReply(
        db,
        {
          reminder_id: testReminderId,
          raw_reply_text: 'होय, घेतली',
        },
        consoleProvider,
      );

      expect(result.success).toBe(true);
      expect(result.adherence_log.classification).toBe('taken');

      // Verify medication remains stopped
      const medRow = await db('medications').where({ id: testMedicationId }).first();
      expect(medRow.lifecycle_state).toBe('stopped');

      // Verify reminder remains cancelled
      const remRow = await db('reminders').where({ id: testReminderId }).first();
      expect(remRow.status).toBe('cancelled');
    });
  });

  describe('Adherence Queries and Statistics Exclusion', () => {
    it('calculates adherence rate strictly excluding needs_attention rows from statistics calculation', async () => {
      const consoleProvider = new ConsoleProvider();

      // 1. Record 3 Taken
      await recordAdherenceReply(db, { medication_id: testMedicationId, raw_reply_text: 'yes' }, consoleProvider);
      await recordAdherenceReply(db, { medication_id: testMedicationId, raw_reply_text: 'taken' }, consoleProvider);
      await recordAdherenceReply(db, { medication_id: testMedicationId, raw_reply_text: 'done' }, consoleProvider);

      // 2. Record 1 Missed
      await recordAdherenceReply(db, { medication_id: testMedicationId, raw_reply_text: 'missed' }, consoleProvider);

      // 3. Record 2 Needs Attention (e.g. stopped, dizzy)
      await recordAdherenceReply(db, { medication_id: testMedicationId, raw_reply_text: 'stopped taking' }, consoleProvider);
      await recordAdherenceReply(db, { medication_id: testMedicationId, raw_reply_text: 'feeling dizzy' }, consoleProvider);

      const logs = await getAdherenceLogsForMedication(db, testMedicationId);
      expect(logs).toHaveLength(6);

      const summary = await getAdherenceSummaryForPatient(db, testPatientId);
      // Statistical pool: 3 taken + 1 missed = 4 countable events. 3 taken / 4 = 75%
      expect(summary.total_countable_events).toBe(4);
      expect(summary.taken_count).toBe(3);
      expect(summary.missed_count).toBe(1);
      expect(summary.needs_attention_count).toBe(2);
      expect(summary.adherence_rate_percentage).toBe(75);
    });
  });
});
