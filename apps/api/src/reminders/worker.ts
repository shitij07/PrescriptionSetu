/**
 * Reminder BullMQ Worker & Double-Check Dispatch Logic.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 5 & Step 6, `SAFETY_INVARIANTS.md` SI-02, SI-11, SI-16.
 */

import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { Knex } from 'knex';
import type { MessageProvider } from '../delivery/types';
import { canGenerateReminders } from '../verification/guards';
import { REMINDERS_QUEUE_NAME, ReminderJobData, createRedisConnection } from './queue';

export interface ProcessResult {
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
  reminder_id?: string;
}

export interface ProcessJobOptions {
  maxAttempts?: number;
}

/**
 * Pure processor executing the SI-02 / SI-03 / SI-11 double-check guard against PostgreSQL before delivery.
 *
 * CRITICAL SAFETY INVARIANTS:
 * 1. SI-11: If medication lifecycle is stopped/superseded, or if reminder status is cancelled,
 *    ABORT dispatch immediately with zero messages sent.
 * 2. SI-02 / SI-03: Deliverability predicate and schedule_derivable are re-evaluated live.
 * 3. SI-16: Only sanitized error codes are recorded in `last_error_code` on failure.
 */
export async function processReminderJob(
  db: Knex,
  messageProvider: MessageProvider,
  jobData: ReminderJobData,
  options?: ProcessJobOptions,
): Promise<ProcessResult> {
  const reminder = await db('reminders').where({ id: jobData.reminder_id }).first();
  if (!reminder) {
    return { status: 'skipped', reason: 'REMINDER_NOT_FOUND' };
  }

  // 1. SI-11: Ensure reminder is still pending
  if (reminder.status !== 'pending') {
    return { status: 'skipped', reason: 'REMINDER_NOT_PENDING' };
  }

  // 2. SI-02 / SI-03 / SI-11: Live check that medication remains deliverable and schedulable
  const medication = await db('medications').where({ id: reminder.medication_id }).first();
  if (!medication || !canGenerateReminders(medication)) {
    return { status: 'skipped', reason: 'MEDICATION_NOT_DELIVERABLE' };
  }

  // 3. Resolve destination phone number
  const prescription = await db('prescriptions').where({ id: medication.prescription_id }).first();
  let destination = 'default-recipient';
  if (prescription?.patient_id) {
    const patient = await db('patients').where({ id: prescription.patient_id }).first();
    if (patient?.phone_number) {
      destination = patient.phone_number;
    }
  }

  // 4. Dispatch via MessageProvider seam
  const deliveryResult = await messageProvider.sendMessage(destination, reminder.payload);

  if (deliveryResult.success) {
    await db('reminders')
      .where({ id: reminder.id })
      .update({
        status: 'sent',
        sent_at: new Date(),
        attempt_count: reminder.attempt_count + 1,
      });

    return { status: 'sent', reminder_id: reminder.id };
  } else {
    const errorCode = deliveryResult.error_code || 'DELIVERY_FAILED';
    const nextAttempt = reminder.attempt_count + 1;
    const maxAttempts = options?.maxAttempts ?? 3;
    const isFinalAttempt = nextAttempt >= maxAttempts;

    await db('reminders')
      .where({ id: reminder.id })
      .update({
        status: isFinalAttempt ? 'failed' : 'pending',
        last_error_code: errorCode,
        attempt_count: nextAttempt,
      });

    throw new Error(`Delivery failed with code: ${errorCode}`);
  }
}


/**
 * Creates a BullMQ Worker instance for the reminders queue.
 */
export function createReminderWorker(
  db: Knex,
  messageProvider: MessageProvider,
  connectionOrUrl?: Redis | string,
): Worker<ReminderJobData> {
  const connection =
    connectionOrUrl instanceof Redis
      ? connectionOrUrl
      : createRedisConnection(typeof connectionOrUrl === 'string' ? connectionOrUrl : undefined);

  return new Worker<ReminderJobData>(
    REMINDERS_QUEUE_NAME,
    async (job: Job<ReminderJobData>) => {
      return await processReminderJob(db, messageProvider, job.data);
    },
    { connection },
  );
}
