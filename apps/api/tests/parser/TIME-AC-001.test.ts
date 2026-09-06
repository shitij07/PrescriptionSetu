/**
 * TIME-AC-001 — before food meal timing anchor.
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is an authorized case
 * from `SHORTHAND_DICTIONARY.md` §7.3 and §11:
 *
 *   - `1 tab BD ac`                         dictionary §7.3, §11 composition
 *   - `1 tab HS ac`                         accumulation with circadian anchor (§8 rule 4)
 *   - `Predmet`                             negative test (boundary, §4, substring defense)
 *
 * These are shorthand tokens and plain dose forms, not real prescription content, and no
 * patient identifier appears anywhere in this file (AGENTS.md §8).
 */

import { parse } from '../../src/parser/parse';
import type {
  MatchRecord,
  ParseResult,
  RuleId,
} from '../../src/parser/types';

function matchesFor(result: ParseResult, ruleId: RuleId): MatchRecord[] {
  return result.candidates.flatMap((candidate) => candidate.matches).filter((m) => m.rule_id === ruleId);
}

describe('TIME-AC-001', () => {
  it('writes timing_anchors [\"BEFORE_MEAL\"] for `1 tab BD ac`', () => {
    const candidate = parse('1 tab BD ac').candidates[0];

    expect(candidate.timing_anchors).toEqual(['BEFORE_MEAL']);
  });

  it('records match_type `exact` for canonical `ac` and `AC`', () => {
    const recordsLower = matchesFor(parse('1 tab BD ac'), 'TIME-AC-001');
    expect(recordsLower).toHaveLength(1);
    expect(recordsLower[0].match_type).toBe('exact');
    expect(recordsLower[0].matched_literal).toBe('ac');

    const recordsUpper = matchesFor(parse('1 tab BD AC'), 'TIME-AC-001');
    expect(recordsUpper).toHaveLength(1);
    expect(recordsUpper[0].match_type).toBe('exact');
    expect(recordsUpper[0].matched_literal).toBe('AC');
  });

  it('records match_type `punctuation-normalized` for dotted `a.c.` and `A.C.`', () => {
    const recordsLower = matchesFor(parse('1 tab BD a.c.'), 'TIME-AC-001');
    expect(recordsLower).toHaveLength(1);
    expect(recordsLower[0].match_type).toBe('punctuation-normalized');
    expect(recordsLower[0].matched_literal).toBe('a.c.');

    const recordsUpper = matchesFor(parse('1 tab BD A.C.'), 'TIME-AC-001');
    expect(recordsUpper).toHaveLength(1);
    expect(recordsUpper[0].match_type).toBe('punctuation-normalized');
    expect(recordsUpper[0].matched_literal).toBe('A.C.');
  });

  it('records exact 5-field provenance with rule_id TIME-AC-001', () => {
    const records = matchesFor(parse('1 tab BD ac'), 'TIME-AC-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.rule_id).toBe('TIME-AC-001');
    expect(record.dictionary_version).toBe('0.1.0');
  });

  it('attributes timing_anchors in field_provenance as an array', () => {
    const { field_provenance } = parse('1 tab BD ac').candidates[0];

    expect(field_provenance.timing_anchors).toHaveLength(1);
    expect(field_provenance.timing_anchors?.[0].rule_id).toBe('TIME-AC-001');
  });

  it('rejects `Predmet` and `acx` via token boundaries', () => {
    expect(matchesFor(parse('Predmet'), 'TIME-AC-001')).toHaveLength(0);
    expect(matchesFor(parse('1 tab BD acx'), 'TIME-AC-001')).toHaveLength(0);
  });

  it('composes with FREQ-BD-001 and AMT-TAB-001 in `1 tab BD ac`', () => {
    const candidate = parse('1 tab BD ac').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(candidate.dose_unit).toBe('tablet');
    expect(candidate.frequency_code).toBe('TWICE_DAILY');
    expect(candidate.times_per_day).toBe(2);
    expect(candidate.timing_anchors).toEqual(['BEFORE_MEAL']);

    expect(candidate.field_provenance.dose_amount?.rule_id).toBe('AMT-TAB-001');
    expect(candidate.field_provenance.frequency_code?.rule_id).toBe('FREQ-BD-001');
    expect(candidate.field_provenance.timing_anchors?.[0].rule_id).toBe('TIME-AC-001');
  });

  it('accumulates with ANCH-HS-001 in `1 tab HS ac` yielding [\"BEDTIME\", \"BEFORE_MEAL\"] with both provenance records', () => {
    const candidate = parse('1 tab HS ac').candidates[0];

    expect(candidate.timing_anchors).toEqual(['BEDTIME', 'BEFORE_MEAL']);
    expect(candidate.field_provenance.timing_anchors).toHaveLength(2);
    expect(candidate.field_provenance.timing_anchors?.[0].rule_id).toBe('ANCH-HS-001');
    expect(candidate.field_provenance.timing_anchors?.[1].rule_id).toBe('TIME-AC-001');
  });

  it('reports missing dose_amount on bare instruction-bearing line `Metformin ac` per dictionary §9 row 1', () => {
    const candidate = parse('Metformin ac').candidates[0];

    expect(candidate.dose_amount).toBeNull();
    expect(candidate.missing_fields).toContainEqual({
      field: 'dose_amount',
      reason: 'absent_from_prescription',
    });
    expect(candidate.verifier_action_required).toBe(true);
  });
});
