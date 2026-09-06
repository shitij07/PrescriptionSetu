/**
 * DPDP Retention and Patient Deletion Service.
 * Authoritative sources: `SAFETY_INVARIANTS.md` SI-10, SI-11, SI-14, SI-16, `PercriptionSetuMASTERPLAN.md` §26, `docs/SCHEMA.md` §2.1, §10.
 */

import type { Knex } from 'knex';
import type {
  PatientDeletionResult,
  CaregiverDeletionResult,
  ImageCleanupOptions,
  ImageCleanupResult,
} from './types';
import { defaultLogger } from '../logging/logger';

/**
 * Executes a DPDP right-to-erasure request for a patient.
 * Atomically scrubs PII, halts all outbound reminders, stops active medications,
 * records compliance audit events, and clears image pointers.
 */
export async function deletePatient(
  db: Knex,
  patientId: string,
  actorCaregiverId?: string,
): Promise<PatientDeletionResult> {
  const patient = await db('patients').where({ id: patientId }).whereNull('deleted_at').first();
  if (!patient) {
    throw new Error('PATIENT_NOT_FOUND');
  }

  const now = new Date();

  return await db.transaction(async (trx) => {
    // 1. Scrub Patient PII and mark deleted_at
    await trx('patients')
      .where({ id: patientId })
      .update({
        deleted_at: now,
        full_name: '[DELETED_PATIENT]',
        phone_number: null,
        meal_times: null,
        updated_at: now,
      });

    // 2. Remove patient-caregiver relationship links
    await trx('patient_caregivers').where({ patient_id: patientId }).delete();

    // 3. Clear raw image storage keys on all patient prescriptions
    const prescriptions = await trx('prescriptions').where({ patient_id: patientId }).select('id');
    const prescriptionIds = prescriptions.map((p) => p.id);

    if (prescriptionIds.length > 0) {
      await trx('prescriptions')
        .whereIn('id', prescriptionIds)
        .update({
          image_storage_key: null,
          updated_at: now,
        });
    }

    // 4. Find all medications for these prescriptions
    let stoppedMedicationsCount = 0;
    let cancelledRemindersCount = 0;

    if (prescriptionIds.length > 0) {
      const medications = await trx('medications')
        .whereIn('prescription_id', prescriptionIds)
        .select('id', 'lifecycle_state');

      const medIds = medications.map((m) => m.id);

      if (medIds.length > 0) {
        // Cancel all pending reminders (SI-10, SI-11)
        cancelledRemindersCount = await trx('reminders')
          .whereIn('medication_id', medIds)
          .where({ status: 'pending' })
          .update({
            status: 'cancelled',
            cancelled_at: now,
          });

        // Transition active/null lifecycle medications to 'stopped'
        for (const med of medications) {
          if (med.lifecycle_state !== 'stopped') {
            await trx('medications')
              .where({ id: med.id })
              .update({
                lifecycle_state: 'stopped',
                lifecycle_reason: 'PATIENT_ERASURE_REQUEST',
                lifecycle_changed_at: now,
              });

            // Append consequential audit event (SI-14)
            await trx('medication_audit_events').insert({
              medication_id: med.id,
              actor_caregiver_id: actorCaregiverId || null,
              event_type: 'stopped',
              field_name: 'lifecycle_state',
              old_value: JSON.stringify(med.lifecycle_state),
              new_value: JSON.stringify('stopped'),
              reason: 'PATIENT_ERASURE_REQUEST',
            });

            stoppedMedicationsCount++;
          }
        }
      }
    }

    defaultLogger.info('PATIENT_ERASURE', {
      patient_id: patientId,
      action: 'erasure',
      count: cancelledRemindersCount,
    });

    return {
      success: true,
      patient_id: patientId,
      cancelled_reminders_count: cancelledRemindersCount,
      stopped_medications_count: stoppedMedicationsCount,
      deleted_at: now.toISOString(),
    };
  });
}

/**
 * Executes a DPDP right-to-erasure request for a caregiver.
 */
export async function deleteCaregiver(
  db: Knex,
  caregiverId: string,
): Promise<CaregiverDeletionResult> {
  const caregiver = await db('caregivers').where({ id: caregiverId }).first();
  if (!caregiver) {
    throw new Error('CAREGIVER_NOT_FOUND');
  }

  const now = new Date();

  return await db.transaction(async (trx) => {
    // 1. Scrub Caregiver PII
    await trx('caregivers')
      .where({ id: caregiverId })
      .update({
        deleted_at: now,
        full_name: '[DELETED_CAREGIVER]',
        phone_number: null,
        updated_at: now,
      });

    // 2. Remove patient-caregiver relationship links
    await trx('patient_caregivers').where({ caregiver_id: caregiverId }).delete();

    defaultLogger.info('CAREGIVER_ERASURE', {
      caregiver_id: caregiverId,
      action: 'erasure',
    });

    return {
      success: true,
      caregiver_id: caregiverId,
      deleted_at: now.toISOString(),
    };
  });
}

/**
 * Purges raw prescription image keys for verified prescriptions older than retention period (MASTERPLAN §26).
 */
export async function cleanupExpiredPrescriptionImages(
  db: Knex,
  options: ImageCleanupOptions,
): Promise<ImageCleanupResult> {
  const retentionDays = options.retentionDays > 0 ? options.retentionDays : 30;
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const updatedCount = await db('prescriptions')
    .where({ status: 'verified' })
    .where('verified_at', '<', cutoffDate)
    .whereNotNull('image_storage_key')
    .update({
      image_storage_key: null,
      updated_at: new Date(),
    });

  defaultLogger.info('IMAGE_RETENTION_CLEANUP', {
    action: 'retention_cleanup',
    count: updatedCount,
  });

  return {
    success: true,
    purged_images_count: updatedCount,
  };
}
