/**
 * COND-SOS-001 — SOS conditional use ("if needed").
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is an authorized case
 * from `SHORTHAND_DICTIONARY.md` §7.4 and §11:
 *
 *   - `Tab Paracetamol 500mg SOS`           dictionary §7.4, §11
 *   - `1 tab SOS`                           composition with amount, frequency suppressed
 *   - `SOSx`                                negative test (boundary, §4)
 *
 * These are shorthand tokens and plain dose forms, not real prescription content, and no
 * patient identifier appears anywhere in this file (AGENTS.md §8).
 */

import { parse } from '../../src/parser/parse';
import type {
  EffectiveClinicalFields,
  MatchRecord,
  ParseResult,
  RuleId,
} from '../../src/parser/types';

function matchesFor(result: ParseResult, ruleId: RuleId): MatchRecord[] {
  return result.candidates.flatMap((candidate) => candidate.matches).filter((m) => m.rule_id === ruleId);
}

const UNWRITTEN_BY_COND_SOS: readonly (keyof EffectiveClinicalFields)[] = [
  'frequency_code',
  'times_per_day',
  'timing_anchors',
  'dose_amount',
  'dose_unit',
  'duration_value',
  'duration_unit',
  'duration_indefinite',
  'total_doses',
  'recurring',
  'immediate',
];

describe('COND-SOS-001', () => {
  it('writes as_needed true, schedule_derivable false, verifier_action_required true for `Tab Paracetamol 500mg SOS`', () => {
    const candidate = parse('Tab Paracetamol 500mg SOS').candidates[0];

    expect(candidate.as_needed).toBe(true);
    expect(candidate.schedule_derivable).toBe(false);
    expect(candidate.verifier_action_required).toBe(true);
  });

  it('leaves frequency_code, times_per_day, and unwritten fields null for bare SOS', () => {
    const candidate = parse('Tab Paracetamol SOS').candidates[0];

    expect(candidate.frequency_code).toBeNull();
    expect(candidate.times_per_day).toBeNull();
    for (const field of UNWRITTEN_BY_COND_SOS) {
      expect(candidate[field]).toBeNull();
    }
  });

  it('records match_type `exact` for canonical uppercase `SOS`', () => {
    const records = matchesFor(parse('Tab Paracetamol SOS'), 'COND-SOS-001');
    expect(records).toHaveLength(1);
    expect(records[0].match_type).toBe('exact');
    expect(records[0].matched_literal).toBe('SOS');
  });

  it('records match_type `case-insensitive` for lowercase `sos`', () => {
    const records = matchesFor(parse('Tab Paracetamol sos'), 'COND-SOS-001');
    expect(records).toHaveLength(1);
    expect(records[0].match_type).toBe('case-insensitive');
    expect(records[0].matched_literal).toBe('sos');
  });

  it('records match_type `punctuation-normalized` for dotted `S.O.S.` and `s.o.s.`', () => {
    const recordsUpper = matchesFor(parse('Tab Paracetamol S.O.S.'), 'COND-SOS-001');
    expect(recordsUpper).toHaveLength(1);
    expect(recordsUpper[0].match_type).toBe('punctuation-normalized');
    expect(recordsUpper[0].matched_literal).toBe('S.O.S.');

    const recordsLower = matchesFor(parse('Tab Paracetamol s.o.s.'), 'COND-SOS-001');
    expect(recordsLower).toHaveLength(1);
    expect(recordsLower[0].match_type).toBe('punctuation-normalized');
    expect(recordsLower[0].matched_literal).toBe('s.o.s.');
  });

  it('records exact 5-field provenance with rule_id COND-SOS-001', () => {
    const records = matchesFor(parse('Tab Paracetamol SOS'), 'COND-SOS-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.rule_id).toBe('COND-SOS-001');
    expect(record.dictionary_version).toBe('0.1.0');
  });

  it('reports max_doses_per_day and min_interval_hours as requires_verifier_entry per SI-08 and dictionary §9', () => {
    const candidate = parse('Tab Paracetamol 500mg SOS').candidates[0];

    expect(candidate.missing_fields).toContainEqual({
      field: 'max_doses_per_day',
      reason: 'requires_verifier_entry',
    });
    expect(candidate.missing_fields).toContainEqual({
      field: 'min_interval_hours',
      reason: 'requires_verifier_entry',
    });
    expect(candidate.missing_fields).toContainEqual({
      field: 'dose_amount',
      reason: 'absent_from_prescription',
    });
  });

  it('rejects `SOSx` via token boundaries', () => {
    expect(matchesFor(parse('Tab Paracetamol SOSx'), 'COND-SOS-001')).toHaveLength(0);
  });

  it('composes with AMT-TAB-001 in `1 tab SOS` and suppresses frequency_code missing report', () => {
    const candidate = parse('1 tab SOS').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(candidate.dose_unit).toBe('tablet');
    expect(candidate.as_needed).toBe(true);
    expect(candidate.frequency_code).toBeNull();

    // frequency_code must NOT be reported missing on conditional use per dictionary §9 row 2
    expect(candidate.missing_fields.some((m) => m.field === 'frequency_code')).toBe(false);

    // Ceiling fields still required per dictionary §9 rows 3 & 4
    expect(candidate.missing_fields).toContainEqual({
      field: 'max_doses_per_day',
      reason: 'requires_verifier_entry',
    });
    expect(candidate.missing_fields).toContainEqual({
      field: 'min_interval_hours',
      reason: 'requires_verifier_entry',
    });
  });
});
