/**
 * Dashboard Frontend Domain & API Types.
 * Authoritative sources: `docs/SCHEMA.md`, `docs/API_CONTRACTS.md`, `PercriptionSetuMASTERPLAN.md` §18.5.
 */

export type VerificationStatus = 'pending' | 'confirmed' | 'corrected' | 'rejected';
export type LifecycleState = 'active' | 'stopped' | 'superseded';

export interface SourceSpan {
  start: number;
  end: number;
}

export interface DisplayExpansion {
  rule_id: string;
  matched_literal: string;
  canonical_expansion: string;
  source_span: SourceSpan;
}

export interface CandidateReading {
  reading: string;
  rule_id: string;
}

export interface UnparsedFragment {
  text: string;
  source_span: SourceSpan;
}

export interface EffectiveClinicalFields {
  frequency_code: 'ONCE_DAILY' | 'TWICE_DAILY' | 'THRICE_DAILY' | 'FOUR_TIMES_DAILY' | null;
  times_per_day: number | null;
  timing_anchors: ('BEDTIME' | 'BEFORE_MEAL' | 'AFTER_MEAL')[] | null;
  dose_amount: { kind: 'integer'; value: number } | { kind: 'fraction'; numerator: number; denominator: number } | number | null;
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
}

export interface FormattedMedication {
  id: string;
  prescription_id: string;
  drug_name: string | null;
  drug_name_validation: string | null;
  verification_status: VerificationStatus;
  lifecycle_state: LifecycleState | null;
  effective_fields: EffectiveClinicalFields;
  display_expansions: DisplayExpansion[];
  candidate_readings: CandidateReading[];
  missing_fields: string[];
  unparsed_fragments: UnparsedFragment[];
}

export interface PrescriptionRecord {
  id: string;
  patient_id: string;
  uploaded_by: string | null;
  raw_ocr_text: string;
  ocr_confidence: number | null;
  ocr_metadata: Record<string, unknown> | null;
  image_storage_key: string | null;
  status: 'pending_verification' | 'verified' | 'rejected' | 'superseded' | 'expired';
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrescriptionDetailResponse {
  prescription: PrescriptionRecord;
  medications: FormattedMedication[];
}

export interface PendingPrescriptionsResponse {
  prescriptions: PrescriptionRecord[];
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    field?: string;
  };
}
