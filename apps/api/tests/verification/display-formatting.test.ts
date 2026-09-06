/**
 * Tests for Verification Dashboard Display Expansions & Numeric Sanitization.
 * Authoritative source: `apps/api/src/verification/display.ts`.
 */

import { parseNumericValue, formatMedicationForDashboard } from '../../src/verification/display';
import type { MedicationRecord } from '../../src/domain/types';

describe('Verification Display Formatting & Number Sanitization', () => {
  describe('parseNumericValue', () => {
    it('returns null for null and undefined', () => {
      expect(parseNumericValue(null)).toBeNull();
      expect(parseNumericValue(undefined)).toBeNull();
    });

    it('returns number verbatim when already a number', () => {
      expect(parseNumericValue(500)).toBe(500);
      expect(parseNumericValue(0)).toBe(0);
      expect(parseNumericValue(0.5)).toBe(0.5);
    });

    it('parses decimal strings and removes trailing zeroes', () => {
      expect(parseNumericValue('500.0000')).toBe(500);
      expect(parseNumericValue('0.5000')).toBe(0.5);
      expect(parseNumericValue('12.3400')).toBe(12.34);
      expect(parseNumericValue('1.0000')).toBe(1);
    });

    it('handles invalid or empty strings safely by returning null', () => {
      expect(parseNumericValue('')).toBeNull();
      expect(parseNumericValue('   ')).toBeNull();
      expect(parseNumericValue('not_a_number')).toBeNull();
    });
  });

  describe('formatMedicationForDashboard', () => {
    it('sanitizes decimal string fields into clean numbers', () => {
      const mockMed: MedicationRecord = {
        id: '11111111-1111-1111-1111-111111111111',
        prescription_id: '22222222-2222-2222-2222-222222222222',
        drug_name: 'Amoxicillin',
        drug_name_validation: 'matched',
        frequency_code: 'THRICE_DAILY',
        times_per_day: '3' as any,
        timing_anchors: null,
        dose_amount: { kind: 'integer', value: 1 },
        dose_unit: 'tablet',
        dose_strength_value: '500.0000' as any,
        dose_strength_unit: 'mg',
        duration_value: '7.0000' as any,
        duration_unit: 'day',
        duration_indefinite: null,
        as_needed: false,
        total_doses: '21' as any,
        recurring: true,
        immediate: false,
        schedule_derivable: true,
        verifier_action_required: false,
        max_doses_per_day: '4' as any,
        min_interval_hours: '4.00' as any,
        parse_result: {
          matches: [
            {
              rule_id: 'STR-MASS-001',
              match_type: 'regex',
              source_span: { start: 12, end: 17 },
              matched_literal: '500mg',
              dictionary_version: '0.1.0',
            },
          ],
        },
        verification_status: 'confirmed',
        verified_by: null,
        verified_at: null,
        lifecycle_state: 'active',
        superseded_by: null,
        lifecycle_reason: null,
        lifecycle_changed_at: null,
        created_at: new Date(),
      };

      const result = formatMedicationForDashboard(mockMed);
      const ef = result.effective_fields as any;

      expect(ef.dose_strength_value).toBe(500);
      expect(ef.times_per_day).toBe(3);
      expect(ef.duration_value).toBe(7);
      expect(ef.total_doses).toBe(21);
      expect(ef.max_doses_per_day).toBe(4);
      expect(ef.min_interval_hours).toBe(4);
      expect(ef.dose_strength_unit).toBe('mg');
      expect(ef.as_needed).toBe(false);

      expect(result.display_expansions).toEqual([
        {
          rule_id: 'STR-MASS-001',
          matched_literal: '500mg',
          canonical_expansion: 'dose strength',
          source_span: { start: 12, end: 17 },
        },
      ]);
    });
  });
});
