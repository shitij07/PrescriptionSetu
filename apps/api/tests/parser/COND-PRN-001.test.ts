/**
 * COND-PRN-001 — PRN conditional use ("as needed").
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is an authorized case
 * from `SHORTHAND_DICTIONARY.md` §7.4 and §11:
 *
 *   - `1 tab PRN`                           dictionary §7.4, §11
 *   - `Paracetamol 500mg PRN`               missing dose_amount per dictionary §9 row 1
 *   - `PRNx`                                negative test (boundary, §4)
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

const UNWRITTEN_BY_COND_PRN: readonly (keyof EffectiveClinicalFields)[] = [
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

describe('COND-PRN-001', () => {
  it('writes as_needed true, schedule_derivable false, verifier_action_required true for `1 tab PRN`', () => {
    const candidate = parse('1 tab PRN').candidates[0];

    expect(candidate.as_needed).toBe(true);
    expect(candidate.schedule_derivable).toBe(false);
    expect(candidate.verifier_action_required).toBe(true);
  });

  it('leaves frequency_code, times_per_day, and unwritten fields null for bare PRN', () => {
    const candidate = parse('Paracetamol PRN').candidates[0];

    expect(candidate.frequency_code).toBeNull();
    expect(candidate.times_per_day).toBeNull();
    for (const field of UNWRITTEN_BY_COND_PRN) {
      expect(candidate[field]).toBeNull();
    }
  });

  it('records match_type `exact` for canonical uppercase `PRN`', () => {
    const records = matchesFor(parse('Paracetamol PRN'), 'COND-PRN-001');
    expect(records).toHaveLength(1);
    expect(records[0].match_type).toBe('exact');
    expect(records[0].matched_literal).toBe('PRN');
  });

  it('records match_type `case-insensitive` for lowercase `prn`', () => {
    const records = matchesFor(parse('Paracetamol prn'), 'COND-PRN-001');
    expect(records).toHaveLength(1);
    expect(records[0].match_type).toBe('case-insensitive');
    expect(records[0].matched_literal).toBe('prn');
  });

  it('records match_type `punctuation-normalized` for dotted `P.R.N.` and `p.r.n.`', () => {
    const recordsUpper = matchesFor(parse('Paracetamol P.R.N.'), 'COND-PRN-001');
    expect(recordsUpper).toHaveLength(1);
    expect(recordsUpper[0].match_type).toBe('punctuation-normalized');
    expect(recordsUpper[0].matched_literal).toBe('P.R.N.');

    const recordsLower = matchesFor(parse('Paracetamol p.r.n.'), 'COND-PRN-001');
    expect(recordsLower).toHaveLength(1);
    expect(recordsLower[0].match_type).toBe('punctuation-normalized');
    expect(recordsLower[0].matched_literal).toBe('p.r.n.');
  });

  it('records exact 5-field provenance with rule_id COND-PRN-001', () => {
    const records = matchesFor(parse('Paracetamol PRN'), 'COND-PRN-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.rule_id).toBe('COND-PRN-001');
    expect(record.dictionary_version).toBe('0.1.0');
  });

  it('reports max_doses_per_day and min_interval_hours as requires_verifier_entry per SI-08 and dictionary §9', () => {
    const candidate = parse('1 tab PRN').candidates[0];

    expect(candidate.missing_fields).toContainEqual({
      field: 'max_doses_per_day',
      reason: 'requires_verifier_entry',
    });
    expect(candidate.missing_fields).toContainEqual({
      field: 'min_interval_hours',
      reason: 'requires_verifier_entry',
    });
  });

  it('rejects `PRNx` via token boundaries', () => {
    expect(matchesFor(parse('Paracetamol PRNx'), 'COND-PRN-001')).toHaveLength(0);
  });

  it('composes with STR-MASS-001 in `Paracetamol 500mg PRN` reporting dose_amount as absent_from_prescription', () => {
    const candidate = parse('Paracetamol 500mg PRN').candidates[0];

    expect(candidate.dose_strength_value).toBe(500);
    expect(candidate.dose_strength_unit).toBe('mg');
    expect(candidate.dose_amount).toBeNull();
    expect(candidate.as_needed).toBe(true);

    expect(candidate.missing_fields).toContainEqual({
      field: 'dose_amount',
      reason: 'absent_from_prescription',
    });
    expect(candidate.missing_fields).toContainEqual({
      field: 'max_doses_per_day',
      reason: 'requires_verifier_entry',
    });
    expect(candidate.missing_fields).toContainEqual({
      field: 'min_interval_hours',
      reason: 'requires_verifier_entry',
    });
    expect(candidate.verifier_action_required).toBe(true);
  });
});
