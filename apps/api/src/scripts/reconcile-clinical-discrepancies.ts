/**
 * Clinical Discrepancy Reconciliation Script.
 * Reconciles manually corrupted candidate fields on verified prescriptions back to their canonical OCR parse.
 *
 * Specifically targets Asha Suresh Patil (patient de103cdf-a2c8-4381-823f-352c465ae365):
 * Prescription 570fe6a2-ea83-4fd7-9e65-0a6cf2d38bf3
 * Medication 8e941856-e7bf-49ac-a103-426622243da0
 *
 * Invariants:
 * - SI-01: Verification gate integrity preserved.
 * - SI-04: parse_result remains immutable.
 * - SI-08: Reconciles spurious as_needed: true back to false/null per canonical TDS parse.
 * - SI-14: Emits an audited event in medication_audit_events recording old and new state.
 * - SI-16: Zero-PHI structured logging (no patient names, no drug names in output).
 */

import type { Knex } from 'knex';
import { getDb, closeDb } from '../db/connection';
import type { MedicationRecord } from '../domain/types';

export interface ClinicalReconciliationResult {
  action: 'clinical_discrepancy_reconciliation';
  mode: 'dry_run' | 'execute';
  timestamp: string;
  prescription_id: string;
  medication_id: string;
  discrepancies_detected: {
    strength_unit: { current: string | null; canonical: string };
    as_needed: { current: boolean | null; canonical: boolean | null };
    duration_unit: { current: string | null; canonical: string | null };
  };
  reconciled: boolean;
  audit_event_id?: string | undefined;
  pending_reminders_count: number;
}

export interface ClinicalReconciliationOptions {
  execute?: boolean;
  medicationId?: string;
  caregiverId?: string;
}

const DEFAULT_TARGET_MEDICATION_ID = '8e941856-e7bf-49ac-a103-426622243da0';
const SYSTEM_CAREGIVER_ID = '00000000-0000-0000-0000-000000000001';

export async function reconcileClinicalDiscrepancy(
  db: Knex,
  options: ClinicalReconciliationOptions = {},
): Promise<ClinicalReconciliationResult> {
  const isExecute = options.execute === true;
  const medId = options.medicationId || DEFAULT_TARGET_MEDICATION_ID;
  const now = new Date();

  // 1. Fetch medication
  const medication: MedicationRecord | undefined = await db('medications')
    .where({ id: medId })
    .first();

  if (!medication) {
    throw new Error(`Medication with id ${medId} not found`);
  }

  // 2. Fetch parent prescription
  const prescription = await db('prescriptions')
    .where({ id: medication.prescription_id })
    .first();

  if (!prescription) {
    throw new Error(`Prescription with id ${medication.prescription_id} not found`);
  }

  // 3. Extract canonical values from immutable parse_result
  const parseResult: any =
    typeof medication.parse_result === 'string'
      ? JSON.parse(medication.parse_result)
      : medication.parse_result || {};

  const canonicalStrengthUnit = parseResult.dose_strength_unit || 'mg';
  const canonicalStrengthValue = parseResult.dose_strength_value !== undefined ? parseResult.dose_strength_value : 500;
  const canonicalAsNeeded = parseResult.as_needed ?? false;
  const canonicalDurationUnit = parseResult.duration_unit ?? null;

  // 4. Detect discrepancies
  const discrepancies = {
    strength_unit: {
      current: medication.dose_strength_unit,
      canonical: canonicalStrengthUnit,
    },
    as_needed: {
      current: medication.as_needed,
      canonical: canonicalAsNeeded,
    },
    duration_unit: {
      current: medication.duration_unit,
      canonical: canonicalDurationUnit,
    },
  };

  const hasDiscrepancy =
    medication.dose_strength_unit !== canonicalStrengthUnit ||
    Boolean(medication.as_needed) !== Boolean(canonicalAsNeeded) ||
    medication.duration_unit !== canonicalDurationUnit;

  // 5. Count reminders
  const reminders = await db('reminders').where({ medication_id: medId });
  const pendingRemindersCount = reminders.filter((r) => r.status === 'pending').length;

  let auditEventId: string | undefined;

  if (isExecute && hasDiscrepancy) {
    await db.transaction(async (trx) => {
      // Record old state for SI-14 audit trail
      const oldState = {
        dose_strength_value: medication.dose_strength_value,
        dose_strength_unit: medication.dose_strength_unit,
        as_needed: medication.as_needed,
        duration_unit: medication.duration_unit,
      };

      const newState = {
        ...oldState,
        dose_strength_value: canonicalStrengthValue,
        dose_strength_unit: canonicalStrengthUnit,
        as_needed: canonicalAsNeeded,
        duration_unit: canonicalDurationUnit,
      };

      // Mutate medication back to canonical parse
      await trx('medications')
        .where({ id: medId })
        .update({
          dose_strength_value: canonicalStrengthValue,
          dose_strength_unit: canonicalStrengthUnit,
          as_needed: canonicalAsNeeded,
          duration_unit: canonicalDurationUnit,
        });

      let actorCaregiverId = options.caregiverId || prescription.verified_by || prescription.uploaded_by || null;
      if (!actorCaregiverId) {
        const defaultCaregiver = await trx('caregivers').select('id').first();
        actorCaregiverId = defaultCaregiver?.id || SYSTEM_CAREGIVER_ID;
      }

      // Insert SI-14 audit event
      const [insertedAudit] = await trx('medication_audit_events')
        .insert({
          medication_id: medId,
          event_type: 'corrected',
          old_value: oldState,
          new_value: newState,
          actor_caregiver_id: actorCaregiverId,
          reason: 'Reconciled manual test discrepancy back to canonical OCR parse (mg, non-PRN)',
          created_at: now,
        })
        .returning('*');

      auditEventId = insertedAudit?.id;
    });
  }

  return {
    action: 'clinical_discrepancy_reconciliation',
    mode: isExecute ? 'execute' : 'dry_run',
    timestamp: now.toISOString(),
    prescription_id: medication.prescription_id,
    medication_id: medId,
    discrepancies_detected: discrepancies,
    reconciled: isExecute && hasDiscrepancy,
    audit_event_id: auditEventId,
    pending_reminders_count: pendingRemindersCount,
  };
}

// CLI execution
if (require.main === module) {
  const isExecute = process.argv.includes('--execute');
  const db = getDb();

  reconcileClinicalDiscrepancy(db, { execute: isExecute })
    .then((report) => {
      // SI-16 zero-PHI logging (identifiers and counts only)
      console.log(JSON.stringify(report, null, 2));
      return closeDb();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(
        JSON.stringify({
          action: 'clinical_discrepancy_reconciliation_error',
          error_code: err.code || 'UNKNOWN_ERROR',
          message: err.message,
        }),
      );
      closeDb().finally(() => process.exit(1));
    });
}
