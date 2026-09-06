/**
 * DUR-DAYS-001 — day duration forms.
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is an authorized case
 * from `SHORTHAND_DICTIONARY.md` §7.8 and §11:
 *
 *   - `1 tab BD pc × 5 days`                dictionary §7.8, §11
 *   - `5/7`                                 slash notation (days out of week)
 *   - `x 5 days`, `for 5 days`, `x 5 d`     prefix/unit variations
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

const UNWRITTEN_BY_DUR_DAYS: readonly (keyof EffectiveClinicalFields)[] = [
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

describe('DUR-DAYS-001', () => {
  it('writes duration_value 5 and duration_unit day for `1 tab BD pc × 5 days`', () => {
    const candidate = parse('1 tab BD pc × 5 days').candidates[0];

    expect(candidate.duration_value).toBe(5);
    expect(candidate.duration_unit).toBe('day');
  });

  it('writes duration_value 5 and duration_unit day for slash form `5/7`', () => {
    const candidate = parse('5/7').candidates[0];

    expect(candidate.duration_value).toBe(5);
    expect(candidate.duration_unit).toBe('day');
  });

  it('supports prefix and unit variations `x 5 days`, `for 5 days`, and `x 5 d`', () => {
    const fromXDays = parse('x 5 days').candidates[0];
    expect(fromXDays.duration_value).toBe(5);
    expect(fromXDays.duration_unit).toBe('day');

    const fromForDays = parse('for 5 days').candidates[0];
    expect(fromForDays.duration_value).toBe(5);
    expect(fromForDays.duration_unit).toBe('day');

    const fromXD = parse('x 5 d').candidates[0];
    expect(fromXD.duration_value).toBe(5);
    expect(fromXD.duration_unit).toBe('day');
  });

  it('leaves frequency, dose, and unwritten fields null for bare duration', () => {
    const candidate = parse('× 5 days').candidates[0];

    expect(candidate.duration_value).toBe(5);
    expect(candidate.duration_unit).toBe('day');
    for (const field of UNWRITTEN_BY_DUR_DAYS) {
      expect(candidate[field]).toBeNull();
    }
  });

  it('records match_type `regex` and 5-field provenance with rule_id DUR-DAYS-001', () => {
    const records = matchesFor(parse('× 5 days'), 'DUR-DAYS-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.rule_id).toBe('DUR-DAYS-001');
    expect(record.match_type).toBe('regex');
    expect(record.dictionary_version).toBe('0.1.0');
  });

  it('attributes duration_value and duration_unit in field_provenance', () => {
    const { field_provenance } = parse('× 5 days').candidates[0];

    expect(field_provenance.duration_value?.rule_id).toBe('DUR-DAYS-001');
    expect(field_provenance.duration_unit?.rule_id).toBe('DUR-DAYS-001');
  });

  it('does not compute total_doses when composed with frequency (no cross-category derivation)', () => {
    const candidate = parse('1 tab BD × 5 days').candidates[0];

    expect(candidate.frequency_code).toBe('TWICE_DAILY');
    expect(candidate.times_per_day).toBe(2);
    expect(candidate.duration_value).toBe(5);
    expect(candidate.duration_unit).toBe('day');
    expect(candidate.total_doses).toBeNull();
  });

  it('does not match inside concentration string `125mg/5ml`', () => {
    expect(matchesFor(parse('125mg/5ml'), 'DUR-DAYS-001')).toHaveLength(0);
  });

  it('rejects invalid trailing characters via token boundaries', () => {
    expect(matchesFor(parse('x 5 daysx'), 'DUR-DAYS-001')).toHaveLength(0);
  });

  it('composes in `1 tab BD pc × 5 days` yielding four distinct provenance records', () => {
    const candidate = parse('1 tab BD pc × 5 days').candidates[0];

    expect(candidate.matches).toHaveLength(4);
    expect(candidate.field_provenance.dose_amount?.rule_id).toBe('AMT-TAB-001');
    expect(candidate.field_provenance.frequency_code?.rule_id).toBe('FREQ-BD-001');
    expect(candidate.field_provenance.timing_anchors?.[0].rule_id).toBe('TIME-PC-001');
    expect(candidate.field_provenance.duration_value?.rule_id).toBe('DUR-DAYS-001');
  });
});
