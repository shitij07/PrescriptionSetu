/**
 * SI-01 Verification Gate & Medication Verification Handlers.
 *
 * Authoritative sources:
 *   - `SAFETY_INVARIANTS.md` SI-01, SI-02, SI-03, SI-04, SI-10, SI-12, SI-14
 *   - `docs/SCHEMA.md` §2.4, §2.5, §3.1, §9
 *   - `PercriptionSetuMASTERPLAN.md` §21, §26
 */

import type { Knex } from 'knex';
import type { MedicationRecord, PrescriptionRecord, VerificationStatus } from '../domain/types';
import { assertPrescriptionVerifiable } from './guards';
import { generateAndPersistReminders } from '../reminders/service';

export interface VerificationResult {
  success: boolean;
  medication_id?: string;
  prescription_id?: string;
  verification_status?: VerificationStatus;
  prescription_status?: 'verified';
  activated_medication_count?: number;
  generated_reminders_count?: number;
}

/**
 * Confirms a medication line as-is by human verifier (SI-01, SI-14).
 */
export async function confirmMedication(
  db: Knex,
  medicationId: string,
  verifierCaregiverId: string,
): Promise<VerificationResult> {
  const now = new Date();

  const execute = async (trx: Knex.Transaction | Knex) => {
    await trx('medications')
      .where({ id: medicationId })
      .update({
        verification_status: 'confirmed',
        verified_by: verifierCaregiverId,
        verified_at: now,
      });

    await trx('medication_audit_events').insert({
      medication_id: medicationId,
      event_type: 'confirmed',
      actor_caregiver_id: verifierCaregiverId,
      created_at: now,
    });
  };

  if (typeof (db as any).transaction === 'function') {
    await db.transaction(execute);
  } else {
    await execute(db);
  }

  return {
    success: true,
    medication_id: medicationId,
    verification_status: 'confirmed',
  };
}

/**
 * Corrects one or more clinical fields on a medication line (SI-01, SI-04, SI-14).
 * IMPORTANT: Original parse_result is preserved verbatim and is never overwritten.
 */
export async function correctMedication(
  db: Knex,
  medicationId: string,
  corrections: Partial<
    Pick<
      MedicationRecord,
      | 'drug_name'
      | 'frequency_code'
      | 'times_per_day'
      | 'timing_anchors'
      | 'dose_amount'
      | 'dose_unit'
      | 'dose_strength_value'
      | 'dose_strength_unit'
      | 'duration_value'
      | 'duration_unit'
      | 'duration_indefinite'
      | 'as_needed'
      | 'max_doses_per_day'
      | 'min_interval_hours'
    >
  >,
  verifierCaregiverId: string,
  reason?: string,
): Promise<VerificationResult> {
  const now = new Date();

  const execute = async (trx: Knex.Transaction | Knex) => {
    const existing = await trx('medications').where({ id: medicationId }).first();
    if (!existing) {
      throw new Error(`Medication with id ${medicationId} not found`);
    }

    // Update clinical fields and set verification_status = 'corrected'
    await trx('medications')
      .where({ id: medicationId })
      .update({
        ...corrections,
        verification_status: 'corrected',
        verified_by: verifierCaregiverId,
        verified_at: now,
      });

    // Record audit event preserving old and new values (SI-14)
    await trx('medication_audit_events').insert({
      medication_id: medicationId,
      event_type: 'corrected',
      old_value: existing,
      new_value: { ...existing, ...corrections, verification_status: 'corrected' },
      actor_caregiver_id: verifierCaregiverId,
      reason: reason || null,
      created_at: now,
    });
  };

  if (typeof (db as any).transaction === 'function') {
    await db.transaction(execute);
  } else {
    await execute(db);
  }

  return {
    success: true,
    medication_id: medicationId,
    verification_status: 'corrected',
  };
}

/**
 * Rejects a medication line item (SI-01, SI-14).
 * A rejected medication line never activates and is never deliverable.
 */
export async function rejectMedication(
  db: Knex,
  medicationId: string,
  reason: string,
  verifierCaregiverId: string,
): Promise<VerificationResult> {
  const now = new Date();

  const execute = async (trx: Knex.Transaction | Knex) => {
    await trx('medications')
      .where({ id: medicationId })
      .update({
        verification_status: 'rejected',
        lifecycle_state: null,
        verified_by: verifierCaregiverId,
        verified_at: now,
        lifecycle_reason: reason,
      });

    await trx('medication_audit_events').insert({
      medication_id: medicationId,
      event_type: 'rejected',
      actor_caregiver_id: verifierCaregiverId,
      reason,
      created_at: now,
    });
  };

  if (typeof (db as any).transaction === 'function') {
    await db.transaction(execute);
  } else {
    await execute(db);
  }

  return {
    success: true,
    medication_id: medicationId,
    verification_status: 'rejected',
  };
}

/**
 * Evaluates the SI-01 Human Verification Gate for a prescription.
 *
 * Transitions `prescriptions.status` to 'verified' and activates all confirmed/corrected
 * medications (lifecycle_state: NULL -> 'active') atomically inside a single transaction.
 *
 * @throws Error if any medication is pending, rejected, or if no medications exist.
 */
export async function verifyPrescription(
  db: Knex,
  prescriptionId: string,
  verifierCaregiverId: string,
): Promise<VerificationResult> {
  const now = new Date();

  return await db.transaction(async (trx) => {
    // 1. Fetch all associated medications
    const medications = await trx('medications').where({ prescription_id: prescriptionId });

    // 2. Enforce SI-01 Gate Condition
    assertPrescriptionVerifiable(medications);

    // 3. Mark prescription verified
    await trx('prescriptions')
      .where({ id: prescriptionId })
      .update({
        status: 'verified',
        verified_by: verifierCaregiverId,
        verified_at: now,
        updated_at: now,
      });

    // 4. Atomically activate all confirmed/corrected medications (SCHEMA §9, SI-01)
    await trx('medications')
      .where({ prescription_id: prescriptionId })
      .whereIn('verification_status', ['confirmed', 'corrected'])
      .update({
        lifecycle_state: 'active',
        lifecycle_changed_at: now,
      });

    // 5. Atomically generate and persist concrete reminder rows for all derivable medications (SI-03, D-030)
    const reminderResult = await generateAndPersistReminders(trx, prescriptionId);

    return {
      success: true,
      prescription_id: prescriptionId,
      prescription_status: 'verified' as const,
      activated_medication_count: medications.length,
      generated_reminders_count: reminderResult.generated_reminders_count,
    };
  });
}


export interface StopMedicationResult {
  success: boolean;
  medication_id: string;
  lifecycle_state: 'stopped';
  cancelled_reminders_count: number;
}

/**
 * Transactionally stops an active medication and cancels its pending reminders (SI-10, SI-11, SI-12, SI-14).
 *
 * Atomically in a single database transaction:
 * 1. Validates that the medication is currently in the 'active' lifecycle state.
 * 2. Updates `medications.lifecycle_state = 'stopped'` with reason and timestamp.
 * 3. Cancels all `reminders` in status 'pending' (marking them 'cancelled' with cancelled_at).
 * 4. Appends a 'stopped' audit event in `medication_audit_events`.
 *
 * @throws Error if medication not found or if lifecycle state is not 'active'.
 */
export async function stopMedication(
  db: Knex,
  medicationId: string,
  caregiverId: string,
  reason: string,
): Promise<StopMedicationResult> {
  const now = new Date();

  return await db.transaction(async (trx) => {
    // 1. Fetch medication and lock/check lifecycle state
    const existing = await trx('medications').where({ id: medicationId }).first();
    if (!existing) {
      const err: any = new Error(`Medication with id ${medicationId} not found`);
      err.code = 'RESOURCE_NOT_FOUND';
      throw err;
    }

    if (existing.lifecycle_state !== 'active') {
      const err: any = new Error(
        `Cannot stop medication: current lifecycle state is '${existing.lifecycle_state || 'null'}' (only active medications can be stopped)`,
      );
      err.code = 'INVALID_LIFECYCLE_TRANSITION';
      throw err;
    }

    // 2. Update medication lifecycle state to 'stopped'
    await trx('medications')
      .where({ id: medicationId })
      .update({
        lifecycle_state: 'stopped',
        lifecycle_reason: reason,
        lifecycle_changed_at: now,
      });

    // 3. Atomically cancel all pending reminders for this medication (SI-11)
    const cancelledCount = await trx('reminders')
      .where({ medication_id: medicationId, status: 'pending' })
      .update({
        status: 'cancelled',
        cancelled_at: now,
      });

    // 4. Record append-only audit event (SI-14)
    await trx('medication_audit_events').insert({
      medication_id: medicationId,
      event_type: 'stopped',
      old_value: { lifecycle_state: existing.lifecycle_state },
      new_value: { lifecycle_state: 'stopped' },
      actor_caregiver_id: caregiverId,
      reason,
      created_at: now,
    });

    return {
      success: true,
      medication_id: medicationId,
      lifecycle_state: 'stopped' as const,
      cancelled_reminders_count: cancelledCount,
    };
  });
}

