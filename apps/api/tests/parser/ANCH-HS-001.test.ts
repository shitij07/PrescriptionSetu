/**
 * ANCH-HS-001 — bedtime circadian anchor.
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is an authorized case
 * from `SHORTHAND_DICTIONARY.md` §7.2 and §11:
 *
 *   - `Tab Alprazolam HS`                   dictionary §7.2 test expectations
 *   - `1 tab HS`                            composition with amount
 *   - `HSx` / `H5`                          negative tests (boundary, §4, character substitution)
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
  SourceSpan,
} from '../../src/parser/types';

function codePointSlice(text: string, span: SourceSpan): string {
  return Array.from(text).slice(span.start, span.end).join('');
}

function matchesFor(result: ParseResult, ruleId: RuleId): MatchRecord[] {
  return result.candidates.flatMap((candidate) => candidate.matches).filter((m) => m.rule_id === ruleId);
}

const UNWRITTEN_BY_ANCH_HS: readonly (keyof EffectiveClinicalFields)[] = [
  'frequency_code',
  'times_per_day',
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

describe('ANCH-HS-001', () => {
  it('writes timing_anchors [\"BEDTIME\"] for `Tab Alprazolam HS`', () => {
    const candidate = parse('Tab Alprazolam HS').candidates[0];

    expect(candidate.timing_anchors).toEqual(['BEDTIME']);
  });

  it('leaves frequency_code and clock times null for bare `HS`', () => {
    const candidate = parse('Tab Alprazolam HS').candidates[0];

    expect(candidate.frequency_code).toBeNull();
    expect(candidate.times_per_day).toBeNull();
    for (const field of UNWRITTEN_BY_ANCH_HS) {
      expect(candidate[field]).toBeNull();
    }
  });

  it('records match_type `exact` for canonical uppercase `HS`', () => {
    const records = matchesFor(parse('Tab Alprazolam HS'), 'ANCH-HS-001');
    expect(records).toHaveLength(1);
    expect(records[0].match_type).toBe('exact');
    expect(records[0].matched_literal).toBe('HS');
  });

  it('records match_type `case-insensitive` for lowercase `hs`', () => {
    const records = matchesFor(parse('Tab Alprazolam hs'), 'ANCH-HS-001');
    expect(records).toHaveLength(1);
    expect(records[0].match_type).toBe('case-insensitive');
    expect(records[0].matched_literal).toBe('hs');
  });

  it('records match_type `punctuation-normalized` for dotted `H.S.` and `h.s.`', () => {
    const recordsUpper = matchesFor(parse('Tab Alprazolam H.S.'), 'ANCH-HS-001');
    expect(recordsUpper).toHaveLength(1);
    expect(recordsUpper[0].match_type).toBe('punctuation-normalized');
    expect(recordsUpper[0].matched_literal).toBe('H.S.');

    const recordsLower = matchesFor(parse('Tab Alprazolam h.s.'), 'ANCH-HS-001');
    expect(recordsLower).toHaveLength(1);
    expect(recordsLower[0].match_type).toBe('punctuation-normalized');
    expect(recordsLower[0].matched_literal).toBe('h.s.');
  });

  it('records exact 5-field provenance with rule_id ANCH-HS-001', () => {
    const records = matchesFor(parse('Tab Alprazolam HS'), 'ANCH-HS-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.rule_id).toBe('ANCH-HS-001');
    expect(record.dictionary_version).toBe('0.1.0');
  });

  it('attributes timing_anchors in field_provenance as an array containing the match record', () => {
    const { field_provenance } = parse('Tab Alprazolam HS').candidates[0];

    expect(field_provenance.timing_anchors).toHaveLength(1);
    expect(field_provenance.timing_anchors?.[0].rule_id).toBe('ANCH-HS-001');
  });

  it('rejects `HSx` and `H5` via token boundary and character substitution rules', () => {
    expect(matchesFor(parse('Tab Alprazolam HSx'), 'ANCH-HS-001')).toHaveLength(0);
    expect(matchesFor(parse('Tab Alprazolam H5'), 'ANCH-HS-001')).toHaveLength(0);
  });

  it('composes with AMT-TAB-001 in `1 tab HS`', () => {
    const candidate = parse('1 tab HS').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(candidate.dose_unit).toBe('tablet');
    expect(candidate.timing_anchors).toEqual(['BEDTIME']);
    expect(candidate.field_provenance.dose_amount?.rule_id).toBe('AMT-TAB-001');
    expect(candidate.field_provenance.timing_anchors?.[0].rule_id).toBe('ANCH-HS-001');
  });

  it('reports missing dose_amount on bare instruction-bearing line `Tab Alprazolam HS` per dictionary §9 row 1', () => {
    const candidate = parse('Tab Alprazolam HS').candidates[0];

    expect(candidate.dose_amount).toBeNull();
    expect(candidate.missing_fields).toContainEqual({
      field: 'dose_amount',
      reason: 'absent_from_prescription',
    });
    expect(candidate.verifier_action_required).toBe(true);
  });
});
