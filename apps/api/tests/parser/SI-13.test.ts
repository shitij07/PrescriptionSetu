/**
 * SI-13 — Contradictory parsed instructions are never silently resolved.
 *
 * Authoritative sources:
 *   - `SAFETY_INVARIANTS.md` SI-13
 *   - `SHORTHAND_DICTIONARY.md` §8 (Composition rules & Conflict handling)
 *   - `SHORTHAND_DICTIONARY.md` §11 (Case #11: `1 tab BD TDS`)
 *   - `API_CONTRACTS.md` §6.2 (Contradiction — recorded unresolved)
 *
 * These are shorthand tokens and plain dose forms, not real prescription content, and no
 * patient identifier appears anywhere in this file (AGENTS.md §8).
 */

import { parse } from '../../src/parser/parse';

describe('SI-13: Contradiction Resolution', () => {
  it('handles `1 tab BD TDS` by leaving frequency_code and times_per_day null, setting verifier_action_required true, and populating candidate_readings (Case #11)', () => {
    const result = parse('1 tab BD TDS');
    expect(result.candidates).toHaveLength(1);

    const candidate = result.candidates[0];
    expect(candidate.frequency_code).toBeNull();
    expect(candidate.times_per_day).toBeNull();
    expect(candidate.verifier_action_required).toBe(true);
    expect(candidate.candidate_readings).toEqual([
      { reading: 'twice daily', rule_id: 'FREQ-BD-001' },
      { reading: 'three times daily', rule_id: 'FREQ-TDS-001' },
    ]);
  });

  it('records both conflicting matches in candidate.matches with 5-field provenance', () => {
    const candidate = parse('1 tab BD TDS').candidates[0];
    const ruleIds = candidate.matches.map((m) => m.rule_id);

    expect(ruleIds).toContain('FREQ-BD-001');
    expect(ruleIds).toContain('FREQ-TDS-001');
    expect(ruleIds).toContain('AMT-TAB-001');
  });

  it('removes/omits field_provenance for contested frequency_code and times_per_day', () => {
    const candidate = parse('1 tab BD TDS').candidates[0];

    expect(candidate.field_provenance.frequency_code).toBeUndefined();
    expect(candidate.field_provenance.times_per_day).toBeUndefined();
  });

  it('preserves uncontested dose_amount and dose_unit on contradictory frequency line', () => {
    const candidate = parse('1 tab BD TDS').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(candidate.dose_unit).toBe('tablet');
    expect(candidate.field_provenance.dose_amount).toBeDefined();
    expect(candidate.field_provenance.dose_unit).toBeDefined();
  });

  it('handles amount contradiction `1 tab 2 tab BD` by leaving dose_amount and dose_unit null with candidate_readings', () => {
    const candidate = parse('1 tab 2 tab BD').candidates[0];

    expect(candidate.dose_amount).toBeNull();
    expect(candidate.dose_unit).toBeNull();
    expect(candidate.frequency_code).toBe('TWICE_DAILY');
    expect(candidate.verifier_action_required).toBe(true);
    expect(candidate.candidate_readings).toEqual([
      { reading: '1 tab', rule_id: 'AMT-TAB-001' },
      { reading: '2 tab', rule_id: 'AMT-TAB-001' },
    ]);
    expect(candidate.field_provenance.dose_amount).toBeUndefined();
    expect(candidate.field_provenance.dose_unit).toBeUndefined();
  });

  it('handles duration contradiction `× 5 days × 10 days BD` by leaving duration null with candidate_readings', () => {
    const candidate = parse('× 5 days × 10 days BD').candidates[0];

    expect(candidate.duration_value).toBeNull();
    expect(candidate.duration_unit).toBeNull();
    expect(candidate.frequency_code).toBe('TWICE_DAILY');
    expect(candidate.verifier_action_required).toBe(true);
    expect(candidate.candidate_readings).toEqual([
      { reading: '× 5 days', rule_id: 'DUR-DAYS-001' },
      { reading: '× 10 days', rule_id: 'DUR-DAYS-001' },
    ]);
    expect(candidate.field_provenance.duration_value).toBeUndefined();
    expect(candidate.field_provenance.duration_unit).toBeUndefined();
  });

  it('handles strength contradiction `500mg 250mg BD` by leaving dose_strength null with candidate_readings', () => {
    const candidate = parse('500mg 250mg BD').candidates[0];

    expect(candidate.dose_strength_value).toBeNull();
    expect(candidate.dose_strength_unit).toBeNull();
    expect(candidate.frequency_code).toBe('TWICE_DAILY');
    expect(candidate.verifier_action_required).toBe(true);
    expect(candidate.candidate_readings).toEqual([
      { reading: '500mg', rule_id: 'STR-MASS-001' },
      { reading: '250mg', rule_id: 'STR-MASS-001' },
    ]);
    expect(candidate.field_provenance.dose_strength_value).toBeUndefined();
    expect(candidate.field_provenance.dose_strength_unit).toBeUndefined();
  });

  it('accumulates timing anchors `ac pc` without treating them as contradictory (dictionary §8 rule 4)', () => {
    const candidate = parse('1 tab BD ac pc').candidates[0];

    expect(candidate.timing_anchors).toEqual(['BEFORE_MEAL', 'AFTER_MEAL']);
    expect(candidate.frequency_code).toBe('TWICE_DAILY');
    expect(candidate.candidate_readings).toHaveLength(0);
    expect(candidate.verifier_action_required).toBeNull();
  });

  it('handles cross-category contradiction between stat and BD (single-dose vs frequency)', () => {
    const candidate = parse('1 tab stat BD').candidates[0];

    expect(candidate.frequency_code).toBeNull();
    expect(candidate.times_per_day).toBeNull();
    expect(candidate.total_doses).toBeNull();
    expect(candidate.immediate).toBeNull();
    expect(candidate.recurring).toBeNull();
    expect(candidate.verifier_action_required).toBe(true);
    expect(candidate.candidate_readings).toEqual([
      { reading: 'twice daily', rule_id: 'FREQ-BD-001' },
      { reading: 'stat', rule_id: 'DOSE-STAT-001' },
    ]);
  });

  it('does not report contested frequency as absent_from_prescription in missing_fields', () => {
    const candidate = parse('1 tab BD TDS').candidates[0];

    // Dose amount is present; frequency is contested (not absent from prescription)
    expect(candidate.missing_fields).toHaveLength(0);
  });
});
