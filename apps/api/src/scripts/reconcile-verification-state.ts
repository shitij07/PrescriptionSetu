/**
 * Verification & Lifecycle State Reconciliation Script.
 *
 * Authoritative Sources:
 * - `SAFETY_INVARIANTS.md` SI-01, SI-02, SI-03, SI-10, SI-11, SI-12, SI-14, SI-16
 * - `docs/SCHEMA.md` §2.4, §2.5, §9
 * - `PercriptionSetuMASTERPLAN.md` §21, §26
 *
 * Anomaly Classification:
 * - Class 1: Verified prescription, all meds confirmed/corrected, one or more meds lifecycle_state NULL,
 *            0 meds rejected/pending. Eligible for lifecycle_state NULL -> 'active' reconciliation.
 * - Class 2: Verified prescription, one or more meds rejected/pending, 0 meds active.
 *            Prescription reverted to 'pending_verification' after atomically cancelling pending reminders (SI-11).
 * - Class 3: Verified prescription, one or more meds rejected/pending, AND one or more meds active.
 *            Flagged for manual clinical review (NO automatic mutation).
 * - Class 4: Unrecognized anomalous state (e.g. unverified prescription with active meds).
 *            Flagged for review (NO automatic mutation).
 *
 * Privacy (SI-16): Structured output contains zero patient names and zero drug names (identifiers and counts only).
 */

import type { Knex } from 'knex';
import { getDb, closeDb } from '../db/connection';
import { generateAndPersistReminders } from '../reminders/service';

export type AnomalyClass = 'CLASS_1' | 'CLASS_2' | 'CLASS_3' | 'CLASS_4';

export interface AnomalyRecord {
  prescription_id: string;
  patient_id: string;
  anomaly_class: AnomalyClass;
  prescription_status: string;
  total_medications: number;
  medication_summary: {
    confirmed_or_corrected: number;
    rejected: number;
    pending: number;
    active: number;
    null_lifecycle: number;
    stopped: number;
  };
  medications: Array<{
    medication_id: string;
    verification_status: string;
    lifecycle_state: string | null;
  }>;
  pending_reminders_count: number;
  description: string;
  action_proposed: string;
  action_taken?: string | undefined;
  reconciled: boolean;
}

export interface ReconciliationReport {
  action: 'reconciliation_scan';
  mode: 'dry_run' | 'execute';
  timestamp: string;
  total_prescriptions_scanned: number;
  anomalies_found: number;
  class_1_count: number;
  class_2_count: number;
  class_3_count: number;
  class_4_count: number;
  repairs_executed: number;
  anomalies: AnomalyRecord[];
}

export interface ReconciliationOptions {
  execute?: boolean;
}

/**
 * Scans the database for verification/lifecycle state anomalies and reconciles safe classes when execute=true.
 */
export async function reconcileVerificationState(
  db: Knex,
  options: ReconciliationOptions = {},
): Promise<ReconciliationReport> {
  const isExecute = options.execute === true;
  const now = new Date();

  // 1. Fetch all prescriptions
  const prescriptions = await db('prescriptions').select(
    'id',
    'patient_id',
    'status',
    'verified_at',
    'verified_by',
    'created_at',
  );

  const anomalies: AnomalyRecord[] = [];
  let class1Count = 0;
  let class2Count = 0;
  let class3Count = 0;
  let class4Count = 0;
  let repairsExecuted = 0;

  for (const prescription of prescriptions) {
    const meds = await db('medications')
      .where({ prescription_id: prescription.id })
      .select('id', 'verification_status', 'lifecycle_state', 'schedule_derivable');

    const medIds = meds.map((m) => m.id);

    // Count pending reminders for this prescription's medications
    let pendingRemindersCount = 0;
    if (medIds.length > 0) {
      const reminderCountRes = await db('reminders')
        .whereIn('medication_id', medIds)
        .where({ status: 'pending' })
        .count('* as count')
        .first();
      pendingRemindersCount = Number(reminderCountRes?.count || 0);
    }

    const totalMeds = meds.length;
    const confirmedOrCorrected = meds.filter(
      (m) => m.verification_status === 'confirmed' || m.verification_status === 'corrected',
    );
    const rejected = meds.filter((m) => m.verification_status === 'rejected');
    const pending = meds.filter((m) => m.verification_status === 'pending');
    const active = meds.filter((m) => m.lifecycle_state === 'active');
    const nullLifecycle = meds.filter((m) => m.lifecycle_state === null);
    const stopped = meds.filter((m) => m.lifecycle_state === 'stopped');

    const summary = {
      confirmed_or_corrected: confirmedOrCorrected.length,
      rejected: rejected.length,
      pending: pending.length,
      active: active.length,
      null_lifecycle: nullLifecycle.length,
      stopped: stopped.length,
    };

    const sanitizedMeds = meds.map((m) => ({
      medication_id: m.id,
      verification_status: m.verification_status,
      lifecycle_state: m.lifecycle_state,
    }));

    let anomalyClass: AnomalyClass | null = null;
    let description = '';
    let actionProposed = '';

    if (prescription.status === 'verified') {
      // Consistent state: all confirmed/corrected AND all active
      const isConsistent =
        totalMeds > 0 &&
        rejected.length === 0 &&
        pending.length === 0 &&
        nullLifecycle.length === 0 &&
        active.length === totalMeds;

      if (!isConsistent) {
        if (totalMeds > 0 && rejected.length === 0 && pending.length === 0 && nullLifecycle.length > 0) {
          // Class 1: Verified prescription, all meds confirmed/corrected, but some/all have lifecycle_state NULL
          anomalyClass = 'CLASS_1';
          description = `Verified prescription has ${nullLifecycle.length} confirmed/corrected medication(s) with lifecycle_state = NULL.`;
          actionProposed = `Activate ${nullLifecycle.length} medication(s) (lifecycle_state: NULL -> 'active') and verify reminder generation.`;
          class1Count++;
        } else if ((rejected.length > 0 || pending.length > 0) && active.length === 0) {
          // Class 2: Verified prescription, with rejected/pending meds and ZERO active meds
          anomalyClass = 'CLASS_2';
          description = `Verified prescription contains ${rejected.length} rejected and ${pending.length} pending medication(s) with 0 active medications (SI-01 violation).`;
          actionProposed = `Revert prescription to 'pending_verification' and cancel any pending reminders.`;
          class2Count++;
        } else if ((rejected.length > 0 || pending.length > 0) && active.length > 0) {
          // Class 3: Verified prescription, has rejected/pending meds AND active meds
          anomalyClass = 'CLASS_3';
          description = `Verified prescription contains rejected/pending meds alongside active meds. Requires clinical intervention.`;
          actionProposed = `Manual clinical review required. Automatic repair skipped for safety.`;
          class3Count++;
        } else {
          // Class 4: Other verified anomalies (e.g. 0 medications)
          anomalyClass = 'CLASS_4';
          description = `Verified prescription has anomalous medication state combination.`;
          actionProposed = `Manual review required. Automatic repair skipped for safety.`;
          class4Count++;
        }
      }
    } else {
      // Unverified prescription with active medications
      if (active.length > 0) {
        anomalyClass = 'CLASS_4';
        description = `Unverified prescription (${prescription.status}) has ${active.length} active medication(s).`;
        actionProposed = `Manual review required. Automatic repair skipped for safety.`;
        class4Count++;
      }
    }

    if (anomalyClass) {
      let actionTaken: string | undefined;
      let reconciled = false;

      if (isExecute) {
        if (anomalyClass === 'CLASS_1') {
          // Execute Class 1 repair atomically
          await db.transaction(async (trx) => {
            // Lock hierarchy: lock prescription first
            await trx('prescriptions').where({ id: prescription.id }).forUpdate().first();

            // Lock medications second
            await trx('medications').where({ prescription_id: prescription.id }).forUpdate();

            // Update NULL lifecycle medications to 'active'
            const updatedCount = await trx('medications')
              .where({ prescription_id: prescription.id })
              .whereNull('lifecycle_state')
              .whereIn('verification_status', ['confirmed', 'corrected'])
              .update({
                lifecycle_state: 'active',
                lifecycle_changed_at: now,
              });

            // Inspect reminders: if 0 exist for schedulable medications, generate them
            let remindersGenerated = 0;
            if (medIds.length > 0) {
              const existingRemindersCount = await trx('reminders')
                .whereIn('medication_id', medIds)
                .count('* as count')
                .first();

              if (Number(existingRemindersCount?.count || 0) === 0) {
                const genRes = await generateAndPersistReminders(trx, prescription.id);
                remindersGenerated = genRes.generated_reminders_count;
              }
            }

            actionTaken = `Activated ${updatedCount} medication(s). Reminders checked (generated ${remindersGenerated} new reminders).`;
            reconciled = true;
            repairsExecuted++;
          });
        } else if (anomalyClass === 'CLASS_2') {
          // Execute Class 2 repair atomically
          await db.transaction(async (trx) => {
            // Lock hierarchy: lock prescription first
            await trx('prescriptions').where({ id: prescription.id }).forUpdate().first();

            // Lock medications second
            if (medIds.length > 0) {
              await trx('medications').whereIn('id', medIds).forUpdate();
            }

            // Cancel any pending reminders atomically (SI-11)
            let cancelledReminders = 0;
            if (medIds.length > 0) {
              cancelledReminders = await trx('reminders')
                .whereIn('medication_id', medIds)
                .where({ status: 'pending' })
                .update({
                  status: 'cancelled',
                  cancelled_at: now,
                });
            }

            // Revert prescription to pending_verification
            await trx('prescriptions')
              .where({ id: prescription.id })
              .update({
                status: 'pending_verification',
                verified_at: null,
                verified_by: null,
                updated_at: now,
              });

            actionTaken = `Reverted prescription to 'pending_verification'. Cancelled ${cancelledReminders} pending reminder(s).`;
            reconciled = true;
            repairsExecuted++;
          });
        } else {
          actionTaken = `No mutation performed (${anomalyClass} requires manual review).`;
          reconciled = false;
        }
      }

      anomalies.push({
        prescription_id: prescription.id,
        patient_id: prescription.patient_id,
        anomaly_class: anomalyClass,
        prescription_status: prescription.status,
        total_medications: totalMeds,
        medication_summary: summary,
        medications: sanitizedMeds,
        pending_reminders_count: pendingRemindersCount,
        description,
        action_proposed: actionProposed,
        action_taken: actionTaken,
        reconciled,
      });
    }
  }

  return {
    action: 'reconciliation_scan',
    mode: isExecute ? 'execute' : 'dry_run',
    timestamp: now.toISOString(),
    total_prescriptions_scanned: prescriptions.length,
    anomalies_found: anomalies.length,
    class_1_count: class1Count,
    class_2_count: class2Count,
    class_3_count: class3Count,
    class_4_count: class4Count,
    repairs_executed: repairsExecuted,
    anomalies,
  };
}

if (require.main === module) {
  const isExecute = process.argv.includes('--execute');
  const db = getDb();

  reconcileVerificationState(db, { execute: isExecute })
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      return closeDb();
    })
    .catch((err) => {
      console.error(err);
      closeDb().finally(() => process.exit(1));
    });
}
