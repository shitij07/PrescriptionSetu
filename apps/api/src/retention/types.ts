/**
 * DPDP Retention and Deletion Types.
 * Authoritative sources: `SAFETY_INVARIANTS.md` SI-10, SI-11, SI-14, SI-16, `PercriptionSetuMASTERPLAN.md` §26, `docs/SCHEMA.md` §10.
 */

export interface PatientDeletionResult {
  success: boolean;
  patient_id: string;
  cancelled_reminders_count: number;
  stopped_medications_count: number;
  deleted_at: string;
}

export interface CaregiverDeletionResult {
  success: boolean;
  caregiver_id: string;
  deleted_at: string;
}

export interface ImageCleanupOptions {
  retentionDays: number;
}

export interface ImageCleanupResult {
  success: boolean;
  purged_images_count: number;
}
