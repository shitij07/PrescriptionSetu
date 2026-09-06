/**
 * DUR-WEEKS-001 — week duration forms.
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is an authorized case
 * from `SHORTHAND_DICTIONARY.md` §7.8 and §11:
 *
 *   - `× 2 weeks`                           dictionary §7.8, §11
 *   - `2/52`                                slash notation (weeks out of year)
 *   - `for 2 weeks`, `x 2 wks`, `x 2 wk`    prefix/unit variations
 *   - `125mg/5ml`                           negative concentration boundary test
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

const UNWRITTEN_BY_DUR_WEEKS: readonly (keyof EffectiveClinicalFields)[] = [
  'frequency_code',
  'times_per_day',
  'timing_anchors',
  'dose_amount',
  'dose_unit',
  'dose_strength_value',
  'dose_strength_unit',
  'duration_indefinite',
  'as_needed',
  'total_doses',
  'recurring',
  'immediate',
];

describe('DUR-WEEKS-001', () => {
  it('writes duration_value 2 and duration_unit week for `× 2 weeks`', () => {
    const candidate = parse('× 2 weeks').candidates[0];

    expect(candidate.duration_value).toBe(2);
    expect(candidate.duration_unit).toBe('week');
  });

  it('writes duration_value 2 and duration_unit week for slash form `2/52`', () => {
    const candidate = parse('2/52').candidates[0];

    expect(candidate.duration_value).toBe(2);
    expect(candidate.duration_unit).toBe('week');
  });

  it('supports prefix and unit variations `for 2 weeks`, `x 2 wks`, and `x 2 wk`', () => {
    const fromForWeeks = parse('for 2 weeks').candidates[0];
    expect(fromForWeeks.duration_value).toBe(2);
    expect(fromForWeeks.duration_unit).toBe('week');

    const fromXWks = parse('x 2 wks').candidates[0];
    expect(fromXWks.duration_value).toBe(2);
    expect(fromXWks.duration_unit).toBe('week');

    const fromXWk = parse('x 2 wk').candidates[0];
    expect(fromXWk.duration_value).toBe(2);
    expect(fromXWk.duration_unit).toBe('week');
  });

  it('preserves week unit and does not convert 2 weeks to 14 days', () => {
    const candidate = parse('× 2 weeks').candidates[0];

    expect(candidate.duration_value).toBe(2);
    expect(candidate.duration_unit).toBe('week');
    expect(candidate.duration_value).not.toBe(14);
  });

  it('leaves frequency, dose, and unwritten fields null for bare duration', () => {
    const candidate = parse('× 2 weeks').candidates[0];

    expect(candidate.duration_value).toBe(2);
    expect(candidate.duration_unit).toBe('week');
    for (const field of UNWRITTEN_BY_DUR_WEEKS) {
      expect(candidate[field]).toBeNull();
    }
  });

  it('records match_type `regex` and 5-field provenance with rule_id DUR-WEEKS-001', () => {
    const records = matchesFor(parse('× 2 weeks'), 'DUR-WEEKS-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.rule_id).toBe('DUR-WEEKS-001');
    expect(record.match_type).toBe('regex');
    expect(record.dictionary_version).toBe('0.1.0');
  });

  it('attributes duration_value and duration_unit in field_provenance', () => {
    const { field_provenance } = parse('× 2 weeks').candidates[0];

    expect(field_provenance.duration_value?.rule_id).toBe('DUR-WEEKS-001');
    expect(field_provenance.duration_unit?.rule_id).toBe('DUR-WEEKS-001');
  });

  it('does not compute total_doses when composed with frequency (no cross-category derivation)', () => {
    const candidate = parse('1 tab BD × 2 weeks').candidates[0];

    expect(candidate.frequency_code).toBe('TWICE_DAILY');
    expect(candidate.times_per_day).toBe(2);
    expect(candidate.duration_value).toBe(2);
    expect(candidate.duration_unit).toBe('week');
    expect(candidate.total_doses).toBeNull();
  });

  it('does not match inside concentration string `125mg/5ml`', () => {
    expect(matchesFor(parse('125mg/5ml'), 'DUR-WEEKS-001')).toHaveLength(0);
  });

  it('composes with Tab Metformin 500mg BD × 2 weeks', () => {
    const candidate = parse('Tab Metformin 500mg BD × 2 weeks').candidates[0];

    expect(candidate.dose_strength_value).toBe(500);
    expect(candidate.dose_strength_unit).toBe('mg');
    expect(candidate.frequency_code).toBe('TWICE_DAILY');
    expect(candidate.times_per_day).toBe(2);
    expect(candidate.duration_value).toBe(2);
    expect(candidate.duration_unit).toBe('week');

    expect(candidate.field_provenance.dose_strength_value?.rule_id).toBe('STR-MASS-001');
    expect(candidate.field_provenance.frequency_code?.rule_id).toBe('FREQ-BD-001');
    expect(candidate.field_provenance.duration_value?.rule_id).toBe('DUR-WEEKS-001');
  });
});
