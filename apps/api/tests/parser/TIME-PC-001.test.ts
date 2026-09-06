/**
 * TIME-PC-001 — after food meal timing anchor.
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is an authorized case
 * from `SHORTHAND_DICTIONARY.md` §7.3 and §11:
 *
 *   - `1 tab TDS pc`                        dictionary §7.3, §11 composition
 *   - `1 tab HS pc`                         accumulation with circadian anchor (§8 rule 4)
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

describe('TIME-PC-001', () => {
  it('writes timing_anchors [\"AFTER_MEAL\"] for `1 tab TDS pc`', () => {
    const candidate = parse('1 tab TDS pc').candidates[0];

    expect(candidate.timing_anchors).toEqual(['AFTER_MEAL']);
  });

  it('records match_type `exact` for canonical `pc` and `PC`', () => {
    const recordsLower = matchesFor(parse('1 tab TDS pc'), 'TIME-PC-001');
    expect(recordsLower).toHaveLength(1);
    expect(recordsLower[0].match_type).toBe('exact');
    expect(recordsLower[0].matched_literal).toBe('pc');

    const recordsUpper = matchesFor(parse('1 tab TDS PC'), 'TIME-PC-001');
    expect(recordsUpper).toHaveLength(1);
    expect(recordsUpper[0].match_type).toBe('exact');
    expect(recordsUpper[0].matched_literal).toBe('PC');
  });

  it('records match_type `punctuation-normalized` for dotted `p.c.` and `P.C.`', () => {
    const recordsLower = matchesFor(parse('1 tab TDS p.c.'), 'TIME-PC-001');
    expect(recordsLower).toHaveLength(1);
    expect(recordsLower[0].match_type).toBe('punctuation-normalized');
    expect(recordsLower[0].matched_literal).toBe('p.c.');

    const recordsUpper = matchesFor(parse('1 tab TDS P.C.'), 'TIME-PC-001');
    expect(recordsUpper).toHaveLength(1);
    expect(recordsUpper[0].match_type).toBe('punctuation-normalized');
    expect(recordsUpper[0].matched_literal).toBe('P.C.');
  });

  it('records exact 5-field provenance with rule_id TIME-PC-001', () => {
    const records = matchesFor(parse('1 tab TDS pc'), 'TIME-PC-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.rule_id).toBe('TIME-PC-001');
    expect(record.dictionary_version).toBe('0.1.0');
  });

  it('attributes timing_anchors in field_provenance as an array', () => {
    const { field_provenance } = parse('1 tab TDS pc').candidates[0];

    expect(field_provenance.timing_anchors).toHaveLength(1);
    expect(field_provenance.timing_anchors?.[0].rule_id).toBe('TIME-PC-001');
  });

  it('rejects `Predmet` and `pcx` via token boundaries', () => {
    expect(matchesFor(parse('Predmet'), 'TIME-PC-001')).toHaveLength(0);
    expect(matchesFor(parse('1 tab TDS pcx'), 'TIME-PC-001')).toHaveLength(0);
  });

  it('composes with FREQ-TDS-001 and AMT-TAB-001 in `1 tab TDS pc`', () => {
    const candidate = parse('1 tab TDS pc').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(candidate.dose_unit).toBe('tablet');
    expect(candidate.frequency_code).toBe('THRICE_DAILY');
    expect(candidate.times_per_day).toBe(3);
    expect(candidate.timing_anchors).toEqual(['AFTER_MEAL']);

    expect(candidate.field_provenance.dose_amount?.rule_id).toBe('AMT-TAB-001');
    expect(candidate.field_provenance.frequency_code?.rule_id).toBe('FREQ-TDS-001');
    expect(candidate.field_provenance.timing_anchors?.[0].rule_id).toBe('TIME-PC-001');
  });

  it('accumulates with ANCH-HS-001 in `1 tab HS pc` yielding [\"BEDTIME\", \"AFTER_MEAL\"] with both provenance records', () => {
    const candidate = parse('1 tab HS pc').candidates[0];

    expect(candidate.timing_anchors).toEqual(['BEDTIME', 'AFTER_MEAL']);
    expect(candidate.field_provenance.timing_anchors).toHaveLength(2);
    expect(candidate.field_provenance.timing_anchors?.[0].rule_id).toBe('ANCH-HS-001');
    expect(candidate.field_provenance.timing_anchors?.[1].rule_id).toBe('TIME-PC-001');
  });

  it('reports missing dose_amount on bare instruction-bearing line `Metformin pc` per dictionary §9 row 1', () => {
    const candidate = parse('Metformin pc').candidates[0];

    expect(candidate.dose_amount).toBeNull();
    expect(candidate.missing_fields).toContainEqual({
      field: 'dose_amount',
      reason: 'absent_from_prescription',
    });
    expect(candidate.verifier_action_required).toBe(true);
  });
});
