/**
 * Reminder Generation & Persistence Service.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 5, `PercriptionSetuMASTERPLAN.md` §18.6, `docs/SCHEMA.md` §2.6, `docs/DECISIONS.md` D-030, `SAFETY_INVARIANTS.md` SI-01, SI-02, SI-03.
 */

import type { Knex } from 'knex';
import type { Queue } from 'bullmq';
import type { MedicationRecord, ReminderPayload } from '../domain/types';
import { canGenerateReminders } from '../verification/guards';
import { scheduleReminders } from './scheduler';
import type { PatientMealTimes } from './types';
import { ReminderJobData, enqueueReminder } from './queue';

export interface GenerateRemindersResult {
  success: boolean;
  prescription_id: string;
  generated_reminders_count: number;
}

/**
 * Builds a plain-text reminder notification message per D-030.
 *
 * @param medication The target medication record.
 * @param language Preferred language code ('mr' or 'en').
 */
function buildReminderBody(medication: MedicationRecord, language: string): string {
  const drugName = medication.drug_name || 'औषध';
  let doseStr = '';
  if (medication.dose_amount && medication.dose_unit) {
    doseStr = ` (${medication.dose_amount} ${medication.dose_unit})`;
  }

  if (language === 'mr') {
    return `नमस्कार, ${drugName}${doseStr} घेण्याची वेळ झाली आहे.`;
  }

  return `Hello, it is time to take your medication: ${drugName}${doseStr}.`;
}

/**
 * Generates and persists concrete reminder records for all deliverable medications on a prescription.
 * Optionally enqueues delayed jobs into a BullMQ queue.
 *
 * Atomically:
 * 1. Loads the prescription and patient meal-time/language preferences.
 * 2. Fetches associated active medications.
 * 3. Evaluates SI-02/SI-03 guards (`canGenerateReminders`).
 * 4. Calls the pure `scheduleReminders()` engine.
 * 5. Persists rows in `reminders` table with `status = 'pending'` and D-030 polymorphic JSONB payload.
 * 6. Enforces idempotency to avoid duplicating pending reminder slots.
 * 7. If `queue` is provided, enqueues the delayed BullMQ job with `jobId: reminder.id`.
 *
 * @param dbOrTrx Knex instance or active transaction.
 * @param prescriptionId UUID of the verified prescription.
 * @param queue Optional BullMQ queue instance for delayed dispatch.
 */
export async function generateAndPersistReminders(
  dbOrTrx: Knex | Knex.Transaction,
  prescriptionId: string,
  queue?: Queue<ReminderJobData>,
): Promise<GenerateRemindersResult> {
  const prescription = await dbOrTrx('prescriptions').where({ id: prescriptionId }).first();
  if (!prescription) {
    return {
      success: true,
      prescription_id: prescriptionId,
      generated_reminders_count: 0,
    };
  }

  const patient = await dbOrTrx('patients').where({ id: prescription.patient_id }).first();
  const mealTimes = (patient?.meal_times as PatientMealTimes | null) || null;
  const language = patient?.preferred_language || 'mr';

  const medications: MedicationRecord[] = await dbOrTrx('medications').where({
    prescription_id: prescriptionId,
  });

  let totalCreated = 0;

  for (const med of medications) {
    // SI-02 / SI-03 guard check
    if (!canGenerateReminders(med)) {
      continue;
    }

    const scheduledReminders = scheduleReminders(med, mealTimes);

    for (const item of scheduledReminders) {
      // Idempotency: check if identical pending reminder already exists
      const existing = await dbOrTrx('reminders')
        .where({
          medication_id: med.id,
          scheduled_time: item.scheduled_time,
          status: 'pending',
        })
        .first();

      if (!existing) {
        const payload: ReminderPayload = {
          type: 'rendered_text',
          body: buildReminderBody(med, language),
          language,
        };

        const [created] = await dbOrTrx('reminders')
          .insert({
            medication_id: med.id,
            scheduled_time: item.scheduled_time,
            status: 'pending',
            payload,
            attempt_count: 0,
          })
          .returning('*');

        if (queue && created?.id) {
          await enqueueReminder(queue, { id: created.id, scheduled_time: item.scheduled_time });
        }

        totalCreated++;
      }
    }
  }

  return {
    success: true,
    prescription_id: prescriptionId,
    generated_reminders_count: totalCreated,
  };
}

