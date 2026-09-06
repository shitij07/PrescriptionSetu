/**
 * Domain entity types for PrescriptionSetu data layer and verification gate.
 * Authoritative source: `docs/SCHEMA.md` v0.1.0 and `docs/API_CONTRACTS.md`.
 */

export type VerificationStatus = 'pending' | 'confirmed' | 'corrected' | 'rejected';
export type LifecycleState = 'active' | 'completed' | 'stopped' | 'superseded';
export type PrescriptionStatus = 'pending_verification' | 'verified';
export type CaregiverRole = 'uploader' | 'verifier' | 'adherence_recipient';
export type AdherenceClassification = 'taken' | 'missed' | 'unclear' | 'needs_attention';
export type AuditEventType =
  | 'parsed'
  | 'confirmed'
  | 'corrected'
  | 'rejected'
  | 'stopped'
  | 'superseded'
  | 'completed'
  | 'revised';

export interface PatientRecord {
  id: string;
  full_name: string;
  phone_number: string | null;
  preferred_language: string;
  meal_times: unknown | null;
  deleted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CaregiverRecord {
  id: string;
  full_name: string;
  phone_number: string | null;
  deleted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface PatientCaregiverRecord {
  patient_id: string;
  caregiver_id: string;
  role: CaregiverRole;
  created_at: Date | string;
}

export interface PrescriptionRecord {
  id: string;
  patient_id: string;
  uploaded_by: string | null;
  image_storage_key: string | null;
  raw_ocr_text: string | null;
  ocr_confidence: number | null;
  ocr_metadata: unknown | null;
  status: PrescriptionStatus;
  verified_at: Date | string | null;
  verified_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface MedicationRecord {
  id: string;
  prescription_id: string;
  drug_name: string | null;
  drug_name_validation: 'matched' | 'unmatched' | null;
  frequency_code: 'ONCE_DAILY' | 'TWICE_DAILY' | 'THRICE_DAILY' | 'FOUR_TIMES_DAILY' | null;
  times_per_day: number | null;
  timing_anchors: string[] | null;
  dose_amount: unknown | null;
  dose_unit: 'tablet' | 'ml' | null;
  dose_strength_value: number | null;
  dose_strength_unit: 'mg' | 'mcg' | 'g' | null;
  duration_value: number | null;
  duration_unit: 'day' | 'week' | null;
  duration_indefinite: boolean | null;
  as_needed: boolean | null;
  total_doses: number | null;
  recurring: boolean | null;
  immediate: boolean | null;
  schedule_derivable: boolean | null;
  verifier_action_required: boolean | null;
  max_doses_per_day: number | null;
  min_interval_hours: number | null;
  parse_result: unknown | null;
  verification_status: VerificationStatus;
  verified_by: string | null;
  verified_at: Date | string | null;
  lifecycle_state: LifecycleState | null;
  superseded_by: string | null;
  lifecycle_reason: string | null;
  lifecycle_changed_at: Date | string | null;
  created_at: Date | string;
}

export interface MedicationAuditEventRecord {
  id: string;
  medication_id: string;
  event_type: AuditEventType;
  field_name: string | null;
  old_value: unknown | null;
  new_value: unknown | null;
  actor_caregiver_id: string | null;
  reason: string | null;
  created_at: Date | string;
}

export interface AdherenceLogRecord {
  id: string;
  medication_id: string | null;
  reminder_id: string | null;
  responder_caregiver_id: string | null;
  classification: AdherenceClassification;
  raw_reply_text: string | null;
  excluded_from_stats: boolean;
  escalated_at: Date | string | null;
  received_at: Date | string;
}

export type ReminderStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

export interface RenderedTextPayload {
  type: 'rendered_text';
  body: string;
  language: string;
}

export interface TemplatePayload {
  type: 'template';
  template_name: string;
  language: string;
  variables: string[];
}

export type ReminderPayload = RenderedTextPayload | TemplatePayload;

export interface ReminderRecord {
  id: string;
  medication_id: string;
  scheduled_time: Date | string;
  status: ReminderStatus;
  payload: ReminderPayload;
  sent_at: Date | string | null;
  attempt_count: number;
  last_error_code: string | null;
  cancelled_at: Date | string | null;
  created_at: Date | string;
}

