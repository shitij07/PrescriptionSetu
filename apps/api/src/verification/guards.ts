/**
 * Verification guards and deliverability predicates.
 * Authoritative sources:
 *   - `SAFETY_INVARIANTS.md` SI-01, SI-02, SI-03, SI-15
 *   - `docs/SCHEMA.md` §2.5 (Deliverable predicate)
 *   - `PercriptionSetuMASTERPLAN.md` §26
 */

import type { MedicationRecord } from '../domain/types';

/**
 * Evaluates the non-negotiable deliverable predicate (docs/SCHEMA.md §2.5, SAFETY_INVARIANTS.md SI-02, SI-15):
 * `verification_status ∈ ('confirmed', 'corrected') AND lifecycle_state === 'active'`.
 *
 * @param medication The medication record to check.
 * @returns true if and only if the medication is confirmed/corrected and active.
 */
export function isMedicationDeliverable(
  medication: Pick<MedicationRecord, 'verification_status' | 'lifecycle_state'>,
): boolean {
  const isVerified =
    medication.verification_status === 'confirmed' || medication.verification_status === 'corrected';
  const isActive = medication.lifecycle_state === 'active';
  return isVerified && isActive;
}

/**
 * Checks if reminder generation is permissible for a medication (SAFETY_INVARIANTS.md SI-03, docs/SCHEMA.md §2.5).
 * Requires deliverability PLUS `schedule_derivable === true`.
 *
 * @param medication The medication record to check.
 * @returns true if and only if the medication is deliverable and schedulable.
 */
export function canGenerateReminders(
  medication: Pick<MedicationRecord, 'verification_status' | 'lifecycle_state' | 'schedule_derivable'>,
): boolean {
  return isMedicationDeliverable(medication) && medication.schedule_derivable === true;
}

/**
 * Enforces the SI-01 prescription verification gate condition.
 * A prescription can transition to `verified` IF AND ONLY IF every associated medication
 * is in a confirmed or corrected state (SAFETY_INVARIANTS.md SI-01, docs/SCHEMA.md §2.4).
 *
 * @param medications The collection of medications associated with the prescription.
 * @throws Error if any medication is pending, rejected, or missing.
 */
export function assertPrescriptionVerifiable(
  medications: readonly Pick<MedicationRecord, 'verification_status'>[],
): void {
  if (!medications || medications.length === 0) {
    throw new Error('Prescription has no medications to verify');
  }

  for (const med of medications) {
    if (med.verification_status === 'pending') {
      throw new Error('Cannot verify prescription: medication is still pending verification');
    }
    if (med.verification_status === 'rejected') {
      throw new Error('Cannot verify prescription: medication has been rejected');
    }
    if (med.verification_status !== 'confirmed' && med.verification_status !== 'corrected') {
      throw new Error(
        `Cannot verify prescription: invalid medication verification status '${med.verification_status}'`,
      );
    }
  }
}
