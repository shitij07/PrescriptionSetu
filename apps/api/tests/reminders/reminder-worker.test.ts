/**
 * Reminder Worker & BullMQ Queue Integration Tests (Sub-Slice 2B Corrective Verification).
 * Authoritative sources:
 * - `BUILD_ORDER.md` §4 Step 5 & Step 6
 * - `PercriptionSetuMASTERPLAN.md` §18.6, §18.8, §18.10
 * - `docs/SCHEMA.md` §2.6
 * - `SAFETY_INVARIANTS.md` SI-01, SI-02, SI-03, SI-10, SI-11, SI-14, SI-16
 */

import { getDb } from '../../src/db/connection';
import type { Knex } from 'knex';
import { ConsoleProvider } from '../../src/delivery/console-provider';
import type { MessageProvider, DeliveryResult } from '../../src/delivery/types';
import { processReminderJob } from '../../src/reminders/worker';
import { createReminderQueue, enqueueReminder } from '../../src/reminders/queue';
import { stopMedication } from '../../src/verification/gate';
import type { ReminderPayload } from '../../src/domain/types';

describe('Reminder Worker & BullMQ Corrective Verification (Sub-Slice 2B)', () => {
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
      .insert({ full_name: 'Worker Patient', preferred_language: 'mr', phone_number: '+919876543210' })
      .returning('*');
    testPatientId = patient.id;

    const [caregiver] = await db('caregivers')
      .insert({ full_name: 'Worker Caregiver' })
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
        schedule_derivable: true,
        verified_by: testCaregiverId,
        verified_at: new Date(),
      })
      .returning('*');
    testMedicationId = medication.id;
  });

  afterAll(async () => {
    if (db) {
      await db('reminders').where({ medication_id: testMedicationId }).del();
      await db('medication_audit_events').where({ medication_id: testMedicationId }).del();
      await db('medications').where({ id: testMedicationId }).del();
      await db('prescriptions').where({ id: testPrescriptionId }).del();
      await db('caregivers').where({ id: testCaregiverId }).del();
      await db('patients').where({ id: testPatientId }).del();
      await db.destroy();
    }
  });

  // --- ISSUE 1: Retry Lifecycle ---
  describe('Issue 1: BullMQ Retry & Database Status Interaction', () => {
    it('allows retry after first failure by keeping status pending until max attempts reached', async () => {
      const payload: ReminderPayload = { type: 'rendered_text', body: 'औषध वेळ', language: 'mr' };
      const [reminder] = await db('reminders')
        .insert({
          medication_id: testMedicationId,
          scheduled_time: new Date().toISOString(),
          status: 'pending',
          payload,
          attempt_count: 0,
        })
        .returning('*');

      let attempt = 0;
      const flaklyProvider: MessageProvider = {
        async sendMessage(): Promise<DeliveryResult> {
          attempt++;
          if (attempt === 1) {
            return { success: false, error_code: 'ERR_TEMPORARY_NETWORK' };
          }
          return { success: true, provider_message_id: 'msg-success-retry' };
        },
      };

      // Attempt 1: fails
      await expect(
        processReminderJob(db, flaklyProvider, { reminder_id: reminder.id }, { maxAttempts: 3 }),
      ).rejects.toThrow('Delivery failed with code: ERR_TEMPORARY_NETWORK');

      const afterAttempt1 = await db('reminders').where({ id: reminder.id }).first();
      expect(afterAttempt1.status).toBe('pending'); // Still pending for BullMQ retry
      expect(afterAttempt1.attempt_count).toBe(1);
      expect(afterAttempt1.last_error_code).toBe('ERR_TEMPORARY_NETWORK');

      // Attempt 2 (BullMQ retry): succeeds
      const result2 = await processReminderJob(db, flaklyProvider, { reminder_id: reminder.id }, { maxAttempts: 3 });
      expect(result2.status).toBe('sent');

      const afterAttempt2 = await db('reminders').where({ id: reminder.id }).first();
      expect(afterAttempt2.status).toBe('sent');
      expect(afterAttempt2.attempt_count).toBe(2);
      expect(afterAttempt2.sent_at).toBeDefined();

      // Clean up
      await db('reminders').where({ id: reminder.id }).del();
    });

    it('marks status as failed when max attempts are exhausted', async () => {
      const payload: ReminderPayload = { type: 'rendered_text', body: 'औषध वेळ', language: 'mr' };
      const [reminder] = await db('reminders')
        .insert({
          medication_id: testMedicationId,
          scheduled_time: new Date().toISOString(),
          status: 'pending',
          payload,
          attempt_count: 2, // 2 prior attempts
        })
        .returning('*');

      const alwaysFailingProvider: MessageProvider = {
        async sendMessage(): Promise<DeliveryResult> {
          return { success: false, error_code: 'ERR_RATE_LIMIT_EXCEEDED' };
        },
      };

      // 3rd attempt is final attempt (maxAttempts = 3)
      await expect(
        processReminderJob(db, alwaysFailingProvider, { reminder_id: reminder.id }, { maxAttempts: 3 }),
      ).rejects.toThrow('Delivery failed with code: ERR_RATE_LIMIT_EXCEEDED');

      const finalCheck = await db('reminders').where({ id: reminder.id }).first();
      expect(finalCheck.status).toBe('failed');
      expect(finalCheck.attempt_count).toBe(3);
      expect(finalCheck.last_error_code).toBe('ERR_RATE_LIMIT_EXCEEDED');

      // Clean up
      await db('reminders').where({ id: reminder.id }).del();
    });
  });

  // --- ISSUE 2: Explicit SI-02 / SI-03 Worker Tests ---
  describe('Issue 2: Explicit SI-02 / SI-03 Deliverability Guards', () => {
    it('refuses delivery when verification_status = pending (0 provider calls)', async () => {
      const [pendingMed] = await db('medications')
        .insert({
          prescription_id: testPrescriptionId,
          drug_name: 'Pending Drug',
          verification_status: 'pending',
          lifecycle_state: 'active',
          schedule_derivable: true,
        })
        .returning('*');

      const [reminder] = await db('reminders')
        .insert({
          medication_id: pendingMed.id,
          scheduled_time: new Date().toISOString(),
          status: 'pending',
          payload: { type: 'rendered_text', body: 'औषध वेळ', language: 'mr' },
        })
        .returning('*');

      const provider = new ConsoleProvider();
      const res = await processReminderJob(db, provider, { reminder_id: reminder.id });

      expect(res.status).toBe('skipped');
      expect(res.reason).toBe('MEDICATION_NOT_DELIVERABLE');
      expect(provider.sentMessages.length).toBe(0);

      await db('reminders').where({ id: reminder.id }).del();
      await db('medications').where({ id: pendingMed.id }).del();
    });

    it('refuses delivery when verification_status = rejected (0 provider calls)', async () => {
      const [rejectedMed] = await db('medications')
        .insert({
          prescription_id: testPrescriptionId,
          drug_name: 'Rejected Drug',
          verification_status: 'rejected',
          lifecycle_state: 'active',
          schedule_derivable: true,
        })
        .returning('*');

      const [reminder] = await db('reminders')
        .insert({
          medication_id: rejectedMed.id,
          scheduled_time: new Date().toISOString(),
          status: 'pending',
          payload: { type: 'rendered_text', body: 'औषध वेळ', language: 'mr' },
        })
        .returning('*');

      const provider = new ConsoleProvider();
      const res = await processReminderJob(db, provider, { reminder_id: reminder.id });

      expect(res.status).toBe('skipped');
      expect(res.reason).toBe('MEDICATION_NOT_DELIVERABLE');
      expect(provider.sentMessages.length).toBe(0);

      await db('reminders').where({ id: reminder.id }).del();
      await db('medications').where({ id: rejectedMed.id }).del();
    });

    it('refuses delivery when lifecycle_state != active (0 provider calls)', async () => {
      const [supersededMed] = await db('medications')
        .insert({
          prescription_id: testPrescriptionId,
          drug_name: 'Superseded Drug',
          verification_status: 'confirmed',
          lifecycle_state: 'superseded',
          schedule_derivable: true,
        })
        .returning('*');

      const [reminder] = await db('reminders')
        .insert({
          medication_id: supersededMed.id,
          scheduled_time: new Date().toISOString(),
          status: 'pending',
          payload: { type: 'rendered_text', body: 'औषध वेळ', language: 'mr' },
        })
        .returning('*');

      const provider = new ConsoleProvider();
      const res = await processReminderJob(db, provider, { reminder_id: reminder.id });

      expect(res.status).toBe('skipped');
      expect(res.reason).toBe('MEDICATION_NOT_DELIVERABLE');
      expect(provider.sentMessages.length).toBe(0);

      await db('reminders').where({ id: reminder.id }).del();
      await db('medications').where({ id: supersededMed.id }).del();
    });

    it('refuses delivery when schedule_derivable = false (0 provider calls)', async () => {
      const [prnMed] = await db('medications')
        .insert({
          prescription_id: testPrescriptionId,
          drug_name: 'PRN Drug',
          verification_status: 'confirmed',
          lifecycle_state: 'active',
          schedule_derivable: false,
          as_needed: true,
        })
        .returning('*');

      const [reminder] = await db('reminders')
        .insert({
          medication_id: prnMed.id,
          scheduled_time: new Date().toISOString(),
          status: 'pending',
          payload: { type: 'rendered_text', body: 'औषध वेळ', language: 'mr' },
        })
        .returning('*');

      const provider = new ConsoleProvider();
      const res = await processReminderJob(db, provider, { reminder_id: reminder.id });

      expect(res.status).toBe('skipped');
      expect(res.reason).toBe('MEDICATION_NOT_DELIVERABLE');
      expect(provider.sentMessages.length).toBe(0);

      await db('reminders').where({ id: reminder.id }).del();
      await db('medications').where({ id: prnMed.id }).del();
    });
  });

  // --- ISSUE 3: Already-Sent Reminder Test ---
  describe('Issue 3: Already-sent Reminder Guard', () => {
    it('refuses delivery and skips when reminder.status = sent', async () => {
      const [sentReminder] = await db('reminders')
        .insert({
          medication_id: testMedicationId,
          scheduled_time: new Date().toISOString(),
          status: 'sent',
          sent_at: new Date(),
          payload: { type: 'rendered_text', body: 'औषध वेळ', language: 'mr' },
        })
        .returning('*');

      const provider = new ConsoleProvider();
      const res = await processReminderJob(db, provider, { reminder_id: sentReminder.id });

      expect(res.status).toBe('skipped');
      expect(res.reason).toBe('REMINDER_NOT_PENDING');
      expect(provider.sentMessages.length).toBe(0);

      await db('reminders').where({ id: sentReminder.id }).del();
    });
  });

  // --- ISSUE 4: Queue Privacy Test ---
  describe('Issue 4: Queue Privacy (SI-16)', () => {
    it('guarantees BullMQ job payload contains ONLY identifiers (no clinical or PHI fields)', async () => {
      let capturedJobData: any = null;
      const mockQueue: any = {
        add: jest.fn().mockImplementation((_name, data) => {
          capturedJobData = data;
          return Promise.resolve({ id: 'job-123' });
        }),
      };

      await enqueueReminder(mockQueue, {
        id: '99999999-0000-0000-0000-000000000000',
        scheduled_time: new Date().toISOString(),
      });

      expect(capturedJobData).toBeDefined();
      expect(Object.keys(capturedJobData)).toEqual(['reminder_id']);
      expect(capturedJobData.patient_name).toBeUndefined();
      expect(capturedJobData.phone_number).toBeUndefined();
      expect(capturedJobData.drug_name).toBeUndefined();
      expect(capturedJobData.raw_ocr_text).toBeUndefined();
      expect(capturedJobData.body).toBeUndefined();
      expect(capturedJobData.payload).toBeUndefined();
      expect(capturedJobData.parse_result).toBeUndefined();
    });
  });

  // --- ISSUE 5: Queue Retry Configuration Test ---
  describe('Issue 5: Queue Retry Configuration', () => {
    it('initializes reminder queue with 3 attempts and exponential 60000ms backoff', () => {
      const queue = createReminderQueue('redis://127.0.0.1:6379');
      const defaultOpts = queue.defaultJobOptions;

      expect(defaultOpts?.attempts).toBe(3);
      expect(defaultOpts?.backoff).toEqual({
        type: 'exponential',
        delay: 60000,
      });
      expect(defaultOpts?.removeOnComplete).toBe(true);

      // Close queue connection to prevent lingering handles
      queue.close();
    });
  });

  // --- ISSUE 6: Delayed Scheduling Test ---
  describe('Issue 6: Delayed Scheduling Calculation', () => {
    it('calculates delay >= 0 for future and past scheduled times', async () => {
      let capturedOpts: any = null;
      const mockQueue: any = {
        add: jest.fn().mockImplementation((_name, _data, opts) => {
          capturedOpts = opts;
          return Promise.resolve({ id: 'job-123' });
        }),
      };

      // Future time (+1 hour)
      const futureTime = new Date(Date.now() + 3600 * 1000).toISOString();
      await enqueueReminder(mockQueue, { id: 'rem-future', scheduled_time: futureTime });
      expect(capturedOpts.delay).toBeGreaterThanOrEqual(3595000);
      expect(capturedOpts.delay).toBeLessThanOrEqual(3600000);

      // Past time (-1 hour)
      const pastTime = new Date(Date.now() - 3600 * 1000).toISOString();
      await enqueueReminder(mockQueue, { id: 'rem-past', scheduled_time: pastTime });
      expect(capturedOpts.delay).toBe(0);
    });
  });

  // --- ISSUE 7: Stop-After-Queue Integration Test ---
  describe('Issue 7: Stop-After-Queue Real Lifecycle Integration', () => {
    it('suppresses delivery when medication is stopped using the real stopMedication lifecycle after enqueue', async () => {
      // 1. Create active medication
      const [liveMed] = await db('medications')
        .insert({
          prescription_id: testPrescriptionId,
          drug_name: 'Amlodipine',
          frequency_code: 'ONCE_DAILY',
          times_per_day: 1,
          verification_status: 'confirmed',
          lifecycle_state: 'active',
          schedule_derivable: true,
          verified_by: testCaregiverId,
          verified_at: new Date(),
        })
        .returning('*');

      // 2. Create pending reminder
      const [reminder] = await db('reminders')
        .insert({
          medication_id: liveMed.id,
          scheduled_time: new Date(Date.now() + 60000).toISOString(),
          status: 'pending',
          payload: { type: 'rendered_text', body: 'अम्लोडिपाइन वेळ', language: 'mr' },
        })
        .returning('*');

      // 3. Enqueue reminder
      let enqueuedJobId: string | null = null;
      const mockQueue: any = {
        add: jest.fn().mockImplementation((_n, data, opts) => {
          enqueuedJobId = opts.jobId;
          return Promise.resolve({ id: opts.jobId });
        }),
      };
      await enqueueReminder(mockQueue, reminder);
      expect(enqueuedJobId).toBe(reminder.id);

      // 4. Stop medication using the REAL stopMedication lifecycle function (SI-10, SI-11)
      const stopResult = await stopMedication(db, liveMed.id, testCaregiverId, 'Doctor stopped Amlodipine');
      expect(stopResult.success).toBe(true);
      expect(stopResult.cancelled_reminders_count).toBe(1);

      // 5. Worker processes the queued job
      const provider = new ConsoleProvider();
      const processRes = await processReminderJob(db, provider, { reminder_id: reminder.id });

      // 6. Provider receives ZERO calls
      expect(processRes.status).toBe('skipped');
      expect(processRes.reason).toBe('REMINDER_NOT_PENDING'); // or MEDICATION_NOT_DELIVERABLE
      expect(provider.sentMessages.length).toBe(0);

      // 7. Reminder is NOT marked sent (remains cancelled)
      const checkReminder = await db('reminders').where({ id: reminder.id }).first();
      expect(checkReminder.status).toBe('cancelled');
      expect(checkReminder.sent_at).toBeNull();

      // Clean up
      await db('reminders').where({ id: reminder.id }).del();
      await db('medication_audit_events').where({ medication_id: liveMed.id }).del();
      await db('medications').where({ id: liveMed.id }).del();
    });
  });
});
