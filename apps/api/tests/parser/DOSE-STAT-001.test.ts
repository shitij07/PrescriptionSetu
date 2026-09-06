/**
 * DOSE-STAT-001 — single immediate dose (stat).
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is an authorized case
 * from `SHORTHAND_DICTIONARY.md` §7.5 and §11:
 *
 *   - `Inj Diclofenac stat`                 dictionary §7.5, §11
 *   - `1 tab stat`                          composition with amount, frequency suppressed
 *   - `Paracetamol 500mg stat`              composition with strength
 *   - `Tab Atorvastatin` / `Rosuvastatin`   statin boundary defense (SI-06, §4)
 *   - `statx` / `xstat`                     negative boundary tests (§4)
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

const UNWRITTEN_BY_DOSE_STAT: readonly (keyof EffectiveClinicalFields)[] = [
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
];

describe('DOSE-STAT-001', () => {
  it('writes total_doses 1, recurring false, immediate true, schedule_derivable false for `Inj Diclofenac stat`', () => {
    const candidate = parse('Inj Diclofenac stat').candidates[0];

    expect(candidate.total_doses).toBe(1);
    expect(candidate.recurring).toBe(false);
    expect(candidate.immediate).toBe(true);
    expect(candidate.schedule_derivable).toBe(false);
    expect(candidate.frequency_code).toBeNull();
  });

  it('leaves frequency_code, times_per_day, and dose fields null for bare stat', () => {
    const candidate = parse('Diclofenac stat').candidates[0];

    expect(candidate.frequency_code).toBeNull();
    expect(candidate.times_per_day).toBeNull();
    for (const field of UNWRITTEN_BY_DOSE_STAT) {
      expect(candidate[field]).toBeNull();
    }
  });

  it('records match_type `exact` for canonical `stat` and `STAT`', () => {
    const recordsLower = matchesFor(parse('Diclofenac stat'), 'DOSE-STAT-001');
    expect(recordsLower).toHaveLength(1);
    expect(recordsLower[0].match_type).toBe('exact');
    expect(recordsLower[0].matched_literal).toBe('stat');

    const recordsUpper = matchesFor(parse('Diclofenac STAT'), 'DOSE-STAT-001');
    expect(recordsUpper).toHaveLength(1);
    expect(recordsUpper[0].match_type).toBe('exact');
    expect(recordsUpper[0].matched_literal).toBe('STAT');
  });

  it('records match_type `case-insensitive` for mixed-case `Stat`', () => {
    const records = matchesFor(parse('Diclofenac Stat'), 'DOSE-STAT-001');
    expect(records).toHaveLength(1);
    expect(records[0].match_type).toBe('case-insensitive');
    expect(records[0].matched_literal).toBe('Stat');
  });

  it('records exact 5-field provenance with rule_id DOSE-STAT-001', () => {
    const records = matchesFor(parse('Diclofenac stat'), 'DOSE-STAT-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.rule_id).toBe('DOSE-STAT-001');
    expect(record.dictionary_version).toBe('0.1.0');
  });

  it('attributes total_doses, recurring, immediate, and schedule_derivable to DOSE-STAT-001 in field_provenance', () => {
    const { field_provenance } = parse('Diclofenac stat').candidates[0];

    expect(field_provenance.total_doses?.rule_id).toBe('DOSE-STAT-001');
    expect(field_provenance.recurring?.rule_id).toBe('DOSE-STAT-001');
    expect(field_provenance.immediate?.rule_id).toBe('DOSE-STAT-001');
    expect(field_provenance.schedule_derivable?.rule_id).toBe('DOSE-STAT-001');
  });

  it('rejects `Tab Atorvastatin` and `Rosuvastatin` (statin boundary defense, SI-06)', () => {
    expect(matchesFor(parse('Tab Atorvastatin'), 'DOSE-STAT-001')).toHaveLength(0);
    expect(matchesFor(parse('Rosuvastatin 10mg'), 'DOSE-STAT-001')).toHaveLength(0);
  });

  it('rejects `statx` and `xstat` via token boundaries', () => {
    expect(matchesFor(parse('Diclofenac statx'), 'DOSE-STAT-001')).toHaveLength(0);
    expect(matchesFor(parse('Diclofenac xstat'), 'DOSE-STAT-001')).toHaveLength(0);
  });

  it('composes with AMT-TAB-001 in `1 tab stat` and suppresses frequency_code missing report', () => {
    const candidate = parse('1 tab stat').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(candidate.dose_unit).toBe('tablet');
    expect(candidate.total_doses).toBe(1);
    expect(candidate.recurring).toBe(false);
    expect(candidate.immediate).toBe(true);
    expect(candidate.schedule_derivable).toBe(false);
    expect(candidate.frequency_code).toBeNull();

    // frequency_code must NOT be reported missing on single dose per dictionary §9 row 2
    expect(candidate.missing_fields.some((m) => m.field === 'frequency_code')).toBe(false);
    expect(candidate.missing_fields).toHaveLength(0);
  });
});
