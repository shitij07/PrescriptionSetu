/**
 * DUR-CONTINUOUS-001 — continuous / lifelong wording.
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is an authorized case
 * from `SHORTHAND_DICTIONARY.md` §7.8 and §11:
 *
 *   - `Tab Thyronorm OD continue`           dictionary §7.8, §11
 *   - `to continue`, `continuous`,
 *     `lifelong`, `life long`               declared match forms
 *   - `discontinue`, `continuation`         token boundary negative defense
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

const ALL_FIELDS: readonly (keyof EffectiveClinicalFields)[] = [
  'frequency_code',
  'times_per_day',
  'timing_anchors',
  'dose_amount',
  'dose_unit',
  'dose_strength_value',
  'dose_strength_unit',
  'duration_value',
  'duration_unit',
  'duration_indefinite',
  'as_needed',
  'total_doses',
  'recurring',
  'immediate',
];

describe('DUR-CONTINUOUS-001', () => {
  it('leaves duration_indefinite null, writes verifier_action_required true, and 2 candidate_readings for `Tab Thyronorm OD continue`', () => {
    const candidate = parse('Tab Thyronorm OD continue').candidates[0];

    expect(candidate.frequency_code).toBe('ONCE_DAILY');
    expect(candidate.duration_indefinite).toBeNull();
    expect(candidate.verifier_action_required).toBe(true);
    expect(candidate.candidate_readings).toEqual([
      { reading: 'indefinite ongoing use', rule_id: 'DUR-CONTINUOUS-001' },
      { reading: 'continue until next review', rule_id: 'DUR-CONTINUOUS-001' },
    ]);
  });

  it('supports match forms `continue`, `to continue`, `continuous`, `lifelong`, `life long`', () => {
    for (const form of ['continue', 'to continue', 'continuous', 'lifelong', 'life long']) {
      const records = matchesFor(parse(`Tab Thyronorm ${form}`), 'DUR-CONTINUOUS-001');
      expect(records).toHaveLength(1);
      expect(records[0].matched_literal).toBe(form);
    }
  });

  it('records match_type `exact` for lowercase canonical match and `case-insensitive` for uppercase/mixed-case', () => {
    const recordsExact = matchesFor(parse('Thyronorm continue'), 'DUR-CONTINUOUS-001');
    expect(recordsExact[0].match_type).toBe('exact');

    const recordsCase = matchesFor(parse('Thyronorm Continue'), 'DUR-CONTINUOUS-001');
    expect(recordsCase[0].match_type).toBe('case-insensitive');

    const recordsUpper = matchesFor(parse('Thyronorm CONTINUOUS'), 'DUR-CONTINUOUS-001');
    expect(recordsUpper[0].match_type).toBe('case-insensitive');
  });

  it('leaves all frequency, dose, and duration fields null for bare continue', () => {
    const candidate = parse('continue').candidates[0];

    for (const field of ALL_FIELDS) {
      expect(candidate[field]).toBeNull();
    }
  });

  it('records exact 5-field provenance with rule_id DUR-CONTINUOUS-001 in matches array', () => {
    const records = matchesFor(parse('continue'), 'DUR-CONTINUOUS-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.rule_id).toBe('DUR-CONTINUOUS-001');
    expect(record.dictionary_version).toBe('0.1.0');
  });

  it('does not create field_provenance entries for unwritten duration_indefinite', () => {
    const { field_provenance } = parse('continue').candidates[0];

    expect(field_provenance.duration_value).toBeUndefined();
    expect(field_provenance.duration_unit).toBeUndefined();
    expect(field_provenance.duration_indefinite).toBeUndefined();
  });

  it('rejects embedded substrings `discontinue` and `continuation` via token boundaries', () => {
    expect(matchesFor(parse('discontinue'), 'DUR-CONTINUOUS-001')).toHaveLength(0);
    expect(matchesFor(parse('continuation'), 'DUR-CONTINUOUS-001')).toHaveLength(0);
  });

  it('composes with `1 tab BD continuous` preserving other fields while setting verifier_action_required true', () => {
    const candidate = parse('1 tab BD continuous').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(candidate.dose_unit).toBe('tablet');
    expect(candidate.frequency_code).toBe('TWICE_DAILY');
    expect(candidate.duration_indefinite).toBeNull();
    expect(candidate.verifier_action_required).toBe(true);
    expect(candidate.candidate_readings).toEqual([
      { reading: 'indefinite ongoing use', rule_id: 'DUR-CONTINUOUS-001' },
      { reading: 'continue until next review', rule_id: 'DUR-CONTINUOUS-001' },
    ]);
  });

  it('never asserts an indefinite schedule is derivable before verification', () => {
    const candidate = parse('Tab Thyronorm OD continue').candidates[0];

    expect(candidate.duration_indefinite).toBeNull();
    expect(candidate.schedule_derivable).toBeNull();
  });
});
