/**
 * Verification Dashboard Display Expansions.
 * Authoritative sources: `PercriptionSetuMASTERPLAN.md` §18.5 DP2, `docs/API_CONTRACTS.md` §13.2.
 *
 * CRITICAL RULE:
 * Shorthand abbreviations MUST NOT be shown in isolation.
 * Every matched shorthand token is presented with its matched literal, rule ID, and plain-language expansion.
 */

import type { MatchRecord } from '../parser/types';
import type { MedicationRecord } from '../domain/types';

export interface DisplayExpansion {
  rule_id: string;
  matched_literal: string;
  canonical_expansion: string;
  source_span: {
    start: number;
    end: number;
  };
}

const RULE_CANONICAL_EXPANSIONS: Record<string, string> = {
  'FREQ-OD-001': 'once daily',
  'AMBIG-OD-001': 'ambiguous: once daily or right eye (requires verifier selection)',
  'FREQ-BD-001': 'twice daily',
  'FREQ-TDS-001': 'thrice daily',
  'FREQ-QID-001': 'four times daily',
  'ANCH-HS-001': 'at bedtime',
  'TIME-AC-001': 'before food (ante cibum)',
  'TIME-PC-001': 'after food (post cibum)',
  'AMT-TAB-001': 'tablet count',
  'AMT-FRAC-001': 'fractional tablet',
  'AMT-VOL-001': 'liquid volume (ml)',
  'STR-MASS-001': 'dose strength',
  'COND-SOS-001': 'as needed / emergency (SOS)',
  'COND-PRN-001': 'as needed (PRN)',
  'DOSE-STAT-001': 'single immediate dose (stat)',
  'DUR-DAYS-001': 'duration in days',
  'DUR-WEEKS-001': 'duration in weeks',
  'DUR-BARE-001': 'ambiguous bare duration count (requires verifier unit selection)',
  'DUR-CONTINUOUS-001': 'continuous / lifelong therapy (requires verifier review)',
};

/**
 * Resolves rule matches into plain-language display expansions for the dashboard.
 */
export function resolveDisplayExpansions(matches: readonly MatchRecord[]): DisplayExpansion[] {
  if (!matches) return [];

  return matches.map((match) => ({
    rule_id: match.rule_id,
    matched_literal: match.matched_literal,
    canonical_expansion: RULE_CANONICAL_EXPANSIONS[match.rule_id] || match.rule_id,
    source_span: match.source_span,
  }));
}

/**
 * Safely parses numeric or decimal string values (such as PostgreSQL decimal(10, 4))
 * into standard JavaScript numbers without trailing zeroes (e.g. "500.0000" -> 500).
 */
export function parseNumericValue(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Enriches a raw MedicationRecord with parsed candidate details and display expansions for dashboard rendering.
 */
export function formatMedicationForDashboard(medication: MedicationRecord): Record<string, unknown> {
  const parseResult: any =
    typeof medication.parse_result === 'string'
      ? JSON.parse(medication.parse_result)
      : medication.parse_result || {};

  const matches: MatchRecord[] = Array.isArray(parseResult.matches) ? parseResult.matches : [];
  const displayExpansions = resolveDisplayExpansions(matches);

  return {
    id: medication.id,
    prescription_id: medication.prescription_id,
    drug_name: medication.drug_name,
    drug_name_validation: medication.drug_name_validation,
    verification_status: medication.verification_status,
    lifecycle_state: medication.lifecycle_state,
    effective_fields: {
      frequency_code: medication.frequency_code,
      times_per_day: parseNumericValue(medication.times_per_day),
      timing_anchors: medication.timing_anchors,
      dose_amount: medication.dose_amount,
      dose_unit: medication.dose_unit,
      dose_strength_value: parseNumericValue(medication.dose_strength_value),
      dose_strength_unit: medication.dose_strength_unit,
      duration_value: parseNumericValue(medication.duration_value),
      duration_unit: medication.duration_unit,
      duration_indefinite: medication.duration_indefinite,
      as_needed: medication.as_needed,
      total_doses: parseNumericValue(medication.total_doses),
      recurring: medication.recurring,
      immediate: medication.immediate,
      schedule_derivable: medication.schedule_derivable,
      verifier_action_required: medication.verifier_action_required,
      max_doses_per_day: parseNumericValue(medication.max_doses_per_day),
      min_interval_hours: parseNumericValue(medication.min_interval_hours),
    },
    display_expansions: displayExpansions,
    candidate_readings: parseResult.candidate_readings || [],
    missing_fields: parseResult.missing_fields || [],
    unparsed_fragments: parseResult.unparsed_fragments || [],
    created_at: medication.created_at,
  };
}
