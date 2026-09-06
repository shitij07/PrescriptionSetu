/**
 * Persistence repository for Prescriptions and parsed Medication Candidates.
 * Authoritative sources: `docs/SCHEMA.md`, `docs/API_CONTRACTS.md`, `SAFETY_INVARIANTS.md`.
 */

import type { Knex } from 'knex';
import type { ParseResult, MedicationCandidate } from '../parser/types';
import type { PrescriptionRecord, MedicationRecord } from '../domain/types';

export interface SavedPrescriptionResult {
  prescription: PrescriptionRecord;
  medications: MedicationRecord[];
}

/**
 * Persists a prescription and its parsed medication candidates in an atomic transaction.
 *
 * @param db Knex database instance.
 * @param patientId ID of the patient.
 * @param uploaderCaregiverId ID of the uploading caregiver.
 * @param rawOcrText Exact raw OCR text.
 * @param parseResult The ParseResult emitted by parse().
 * @returns The saved prescription and medication records.
 */
export async function savePrescriptionWithParseResult(
  db: Knex,
  patientId: string,
  uploaderCaregiverId: string | null,
  rawOcrText: string,
  parseResult: ParseResult,
  ocrConfidence: number | null = null,
  ocrMetadata: Record<string, unknown> | null = null,
): Promise<SavedPrescriptionResult> {
  const now = new Date();

  return await db.transaction(async (trx) => {
    // 1. Insert prescription
    const [prescription] = await trx('prescriptions')
      .insert({
        patient_id: patientId,
        uploaded_by: uploaderCaregiverId,
        raw_ocr_text: rawOcrText,
        ocr_confidence: ocrConfidence,
        ocr_metadata: ocrMetadata ? JSON.stringify(ocrMetadata) : null,
        status: 'pending_verification',
        created_at: now,
        updated_at: now,
      })
      .returning('*');

    const savedMedications: MedicationRecord[] = [];

    // 2. Insert each candidate as a pending medication row
    for (const candidate of parseResult.candidates) {
      const [med] = await trx('medications')
        .insert({
          prescription_id: prescription.id,
          frequency_code: candidate.frequency_code,
          times_per_day: candidate.times_per_day,
          timing_anchors: candidate.timing_anchors,
          dose_amount: candidate.dose_amount ? JSON.stringify(candidate.dose_amount) : null,
          dose_unit: candidate.dose_unit,
          dose_strength_value: candidate.dose_strength_value,
          dose_strength_unit: candidate.dose_strength_unit,
          duration_value: candidate.duration_value,
          duration_unit: candidate.duration_unit,
          duration_indefinite: candidate.duration_indefinite,
          as_needed: candidate.as_needed,
          total_doses: candidate.total_doses,
          recurring: candidate.recurring,
          immediate: candidate.immediate,
          schedule_derivable: candidate.schedule_derivable,
          verifier_action_required: candidate.verifier_action_required,
          parse_result: JSON.stringify(candidate),
          verification_status: 'pending',
          lifecycle_state: null,
          created_at: now,
        })
        .returning('*');

      // 3. Emit initial audit event 'parsed' (SI-14)
      await trx('medication_audit_events').insert({
        medication_id: med.id,
        event_type: 'parsed',
        new_value: JSON.stringify(candidate),
        actor_caregiver_id: uploaderCaregiverId,
        created_at: now,
      });

      savedMedications.push(med);
    }

    return {
      prescription,
      medications: savedMedications,
    };
  });
}

/**
 * Retrieves all prescriptions pending verification (optionally filtered by caregiver).
 */
export async function getPendingPrescriptions(
  db: Knex,
  caregiverId?: string,
): Promise<PrescriptionRecord[]> {
  let query = db('prescriptions')
    .where({ status: 'pending_verification' })
    .orderBy('created_at', 'desc');

  if (caregiverId) {
    query = query.where({ uploaded_by: caregiverId });
  }

  return await query;
}

/**
 * Retrieves full details for a prescription and all associated medication line items.
 */
export async function getPrescriptionDetailWithMedications(
  db: Knex,
  prescriptionId: string,
): Promise<{ prescription: PrescriptionRecord; medications: MedicationRecord[] } | null> {
  const prescription = await db('prescriptions').where({ id: prescriptionId }).first();
  if (!prescription) {
    return null;
  }

  const medications = await db('medications')
    .where({ prescription_id: prescriptionId })
    .orderBy('created_at', 'asc');

  return {
    prescription,
    medications,
  };
}

/**
 * Retrieves a single medication record by its ID.
 */
export async function getMedicationById(
  db: Knex,
  medicationId: string,
): Promise<MedicationRecord | null> {
  return await db('medications').where({ id: medicationId }).first();
}
