/**
 * DUR-BARE-001 — bare duration (no unit).
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is an authorized case
 * from `SHORTHAND_DICTIONARY.md` §7.8 and §11:
 *
 *   - `1 tab BD × 5`                        dictionary §7.8, §11
 *   - `× 10`                                dynamic count verification
 *   - `x 5`, `× 5`, `X 5`                   prefix variations
 *   - `× 5 days`, `x 5 d`                   negative lookahead: day units
 *   - `× 2 weeks`, `x 2 wks`                negative lookahead: week units
 *   - `× 1 tab`, `x 500mg`                  negative lookahead: dose/strength units
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

describe('DUR-BARE-001', () => {
  it('writes null for duration fields, verifier_action_required true, and 3 candidate_readings for `1 tab BD × 5`', () => {
    const candidate = parse('1 tab BD × 5').candidates[0];

    expect(candidate.duration_value).toBeNull();
    expect(candidate.duration_unit).toBeNull();
    expect(candidate.verifier_action_required).toBe(true);
    expect(candidate.candidate_readings).toEqual([
      { reading: '5 days', rule_id: 'DUR-BARE-001' },
      { reading: '5 weeks', rule_id: 'DUR-BARE-001' },
      { reading: '5 doses total', rule_id: 'DUR-BARE-001' },
    ]);
  });

  it('generates dynamic candidate readings matching the parsed count N for `× 10`', () => {
    const candidate = parse('× 10').candidates[0];

    expect(candidate.candidate_readings).toEqual([
      { reading: '10 days', rule_id: 'DUR-BARE-001' },
      { reading: '10 weeks', rule_id: 'DUR-BARE-001' },
      { reading: '10 doses total', rule_id: 'DUR-BARE-001' },
    ]);
  });

  it('supports prefix variations `x 5`, `× 5`, `X 5`', () => {
    const fromX = parse('x 5').candidates[0];
    expect(fromX.candidate_readings).toHaveLength(3);

    const fromMult = parse('× 5').candidates[0];
    expect(fromMult.candidate_readings).toHaveLength(3);

    const fromCapX = parse('X 5').candidates[0];
    expect(fromCapX.candidate_readings).toHaveLength(3);
  });

  it('leaves all frequency, dose, and duration fields null for bare duration', () => {
    const candidate = parse('× 5').candidates[0];

    for (const field of ALL_FIELDS) {
      expect(candidate[field]).toBeNull();
    }
  });

  it('records match_type `regex` and 5-field provenance with rule_id DUR-BARE-001 in matches array', () => {
    const records = matchesFor(parse('× 5'), 'DUR-BARE-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.rule_id).toBe('DUR-BARE-001');
    expect(record.match_type).toBe('regex');
    expect(record.dictionary_version).toBe('0.1.0');
  });

  it('does not create field_provenance entries for unwritten duration fields', () => {
    const { field_provenance } = parse('× 5').candidates[0];

    expect(field_provenance.duration_value).toBeUndefined();
    expect(field_provenance.duration_unit).toBeUndefined();
    expect(field_provenance.duration_indefinite).toBeUndefined();
  });

  it('rejects matching when followed by day unit `× 5 days` or `x 5 d`', () => {
    expect(matchesFor(parse('× 5 days'), 'DUR-BARE-001')).toHaveLength(0);
    expect(matchesFor(parse('x 5 d'), 'DUR-BARE-001')).toHaveLength(0);
  });

  it('rejects matching when followed by week unit `× 2 weeks` or `x 2 wks`', () => {
    expect(matchesFor(parse('× 2 weeks'), 'DUR-BARE-001')).toHaveLength(0);
    expect(matchesFor(parse('x 2 wks'), 'DUR-BARE-001')).toHaveLength(0);
  });

  it('rejects matching when followed by dose or strength units `× 1 tab`, `x 500mg`', () => {
    expect(matchesFor(parse('× 1 tab'), 'DUR-BARE-001')).toHaveLength(0);
    expect(matchesFor(parse('x 500mg'), 'DUR-BARE-001')).toHaveLength(0);
  });
});
