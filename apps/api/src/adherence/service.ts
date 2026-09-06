/**
 * Adherence Service.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 7, `PercriptionSetuMASTERPLAN.md` §18.9, `docs/SCHEMA.md` §2.7, `SAFETY_INVARIANTS.md` SI-09, SI-14, SI-15, SI-16.
 */

import type { Knex } from 'knex';
import type { MessageProvider } from '../delivery/types';
import type { AdherenceLogRecord, ReminderPayload } from '../domain/types';
import { classifyReply } from './classifier';
import type {
  RecordAdherenceInput,
  RecordAdherenceResult,
  PatientAdherenceSummary,
} from './types';

/**
 * Builds standard caregiver escalation alert payload.
 * Follows MASTERPLAN §18.9: avoids automated clinical triage/advice, ensures human attention.
 */
function buildCaregiverEscalationPayload(language: string): ReminderPayload {
  if (language === 'mr') {
    return {
      type: 'rendered_text',
      body: 'लक्ष द्या: रुग्णाने औषधाच्या स्मरणपत्राला संभाव्य त्रास किंवा औषध थांबवल्याचा प्रतिसाद दिला आहे. कृपया रुग्णाशी त्वरित संपर्क साधा.',
      language: 'mr',
    };
  }

  return {
    type: 'rendered_text',
    body: 'PrescriptionSetu Alert: The patient replied to a medication reminder indicating potential discomfort, excess dose, or cessation. Please check on the patient immediately.',
    language: 'en',
  };
}

/**
 * Records an inbound patient or caregiver adherence reply.
 * Atomically classifies the response, logs it to `adherence_logs`, and dispatches caregiver alerts on `needs_attention`.
 */
export async function recordAdherenceReply(
  dbOrTrx: Knex | Knex.Transaction,
  input: RecordAdherenceInput,
  messageProvider?: MessageProvider,
): Promise<RecordAdherenceResult> {
  let resolvedMedicationId: string | null = input.medication_id || null;
  let patientId: string | null = null;
  let preferredLanguage = 'mr';

  // 1. Resolve medication_id and patient_id from reminder_id if provided
  if (input.reminder_id) {
    const reminder = await dbOrTrx('reminders').where({ id: input.reminder_id }).first();
    if (reminder?.medication_id) {
      resolvedMedicationId = reminder.medication_id;
    }
  }

  // 2. Resolve patient details if medication_id is known
  if (resolvedMedicationId) {
    const medication = await dbOrTrx('medications').where({ id: resolvedMedicationId }).first();
    if (medication?.prescription_id) {
      const prescription = await dbOrTrx('prescriptions')
        .where({ id: medication.prescription_id })
        .first();
      if (prescription?.patient_id) {
        patientId = prescription.patient_id;
        const patient = await dbOrTrx('patients').where({ id: patientId }).first();
        if (patient?.preferred_language) {
          preferredLanguage = patient.preferred_language;
        }
      }
    }
  }

  // 3. Classify reply
  const classification = input.classification || classifyReply(input.raw_reply_text).classification;

  // 4. Determine stats exclusion (MASTERPLAN §18.9: needs_attention is excluded from statistical averages)
  const excludedFromStats = classification === 'needs_attention';

  // 5. Handle Caregiver Escalation for `needs_attention`
  let escalatedAt: Date | null = null;
  let escalationDispatched = false;

  if (classification === 'needs_attention' && patientId && messageProvider) {
    // Look for linked caregiver with role 'adherence_recipient' or any linked caregiver
    const caregiverLinks = await dbOrTrx('patient_caregivers')
      .join('caregivers', 'patient_caregivers.caregiver_id', 'caregivers.id')
      .where({ 'patient_caregivers.patient_id': patientId })
      .select('caregivers.*', 'patient_caregivers.role');

    // Prioritize adherence_recipient role
    const recipientCaregiver =
      caregiverLinks.find((c) => c.role === 'adherence_recipient') || caregiverLinks[0];

    if (recipientCaregiver?.phone_number) {
      const escalationPayload = buildCaregiverEscalationPayload(preferredLanguage);
      try {
        const deliveryResult = await messageProvider.sendMessage(
          recipientCaregiver.phone_number,
          escalationPayload,
        );
        if (deliveryResult.success) {
          escalatedAt = new Date();
          escalationDispatched = true;
        }
      } catch {
        // Safe degradation: non-fatal delivery error leaves escalatedAt null without aborting log insert
        escalatedAt = null;
        escalationDispatched = false;
      }
    }
  }

  // 6. Persist to adherence_logs table (Append-only)
  const [created] = await dbOrTrx('adherence_logs')
    .insert({
      medication_id: resolvedMedicationId,
      reminder_id: input.reminder_id || null,
      responder_caregiver_id: input.responder_caregiver_id || null,
      classification,
      raw_reply_text: input.raw_reply_text,
      excluded_from_stats: excludedFromStats,
      escalated_at: escalatedAt,
      received_at: new Date(),
    })
    .returning('*');

  return {
    success: true,
    adherence_log: created as AdherenceLogRecord,
    escalation_dispatched: escalationDispatched,
  };
}

/**
 * Returns all adherence logs for a specific medication.
 */
export async function getAdherenceLogsForMedication(
  db: Knex,
  medicationId: string,
): Promise<AdherenceLogRecord[]> {
  return await db('adherence_logs')
    .where({ medication_id: medicationId })
    .orderBy('received_at', 'desc');
}

/**
 * Returns an adherence summary for a patient, calculating adherence rate strictly
 * excluding `needs_attention` events from the countable denominator per MASTERPLAN §18.9.
 */
export async function getAdherenceSummaryForPatient(
  db: Knex,
  patientId: string,
): Promise<PatientAdherenceSummary> {
  const logs = await db('adherence_logs')
    .join('medications', 'adherence_logs.medication_id', 'medications.id')
    .join('prescriptions', 'medications.prescription_id', 'prescriptions.id')
    .where({ 'prescriptions.patient_id': patientId })
    .select('adherence_logs.*');

  let takenCount = 0;
  let missedCount = 0;
  let unclearCount = 0;
  let needsAttentionCount = 0;

  for (const log of logs) {
    switch (log.classification) {
      case 'taken':
        takenCount++;
        break;
      case 'missed':
        missedCount++;
        break;
      case 'unclear':
        unclearCount++;
        break;
      case 'needs_attention':
        needsAttentionCount++;
        break;
    }
  }

  // Total countable events excludes needs_attention and unclear
  const totalCountableEvents = takenCount + missedCount;
  const adherenceRatePercentage =
    totalCountableEvents > 0 ? Math.round((takenCount / totalCountableEvents) * 100) : 0;

  return {
    patient_id: patientId,
    total_responses: logs.length,
    total_countable_events: totalCountableEvents,
    taken_count: takenCount,
    missed_count: missedCount,
    unclear_count: unclearCount,
    needs_attention_count: needsAttentionCount,
    adherence_rate_percentage: adherenceRatePercentage,
  };
}
