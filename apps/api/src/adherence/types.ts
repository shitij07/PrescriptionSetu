/**
 * Adherence Module Types.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 7, `PercriptionSetuMASTERPLAN.md` §18.9, `docs/SCHEMA.md` §2.7.
 */

import type { AdherenceClassification, AdherenceLogRecord } from '../domain/types';

export interface RecordAdherenceInput {
  reminder_id?: string | undefined;
  medication_id?: string | undefined;
  responder_caregiver_id?: string | undefined;
  raw_reply_text: string;
  classification?: AdherenceClassification | undefined;
}

export interface RecordAdherenceResult {
  success: boolean;
  adherence_log: AdherenceLogRecord;
  escalation_dispatched: boolean;
  error?: string | undefined;
}

export interface PatientAdherenceSummary {
  patient_id: string;
  total_responses: number;
  total_countable_events: number;
  taken_count: number;
  missed_count: number;
  unclear_count: number;
  needs_attention_count: number;
  adherence_rate_percentage: number;
}
