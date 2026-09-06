/**
 * AMT-VOL-001 — millilitre volumes (ml, mL).
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is an authorized case
 * from `SHORTHAND_DICTIONARY.md` §7.6 and §11:
 *
 *   - `5 ml TDS`                            dictionary §7.6 test expectations
 *   - `Amoxicillin 125mg/5ml 5 ml TDS`      concentration vs volume dose amount isolation
 *   - `5 mls` / `5 tablespoon` / `x5 ml`    negative tests (boundary, §4)
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

const UNWRITTEN_BY_AMT_VOL: readonly (keyof EffectiveClinicalFields)[] = [
  'frequency_code',
  'times_per_day',
  'timing_anchors',
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

describe('AMT-VOL-001', () => {
  it('writes dose_amount 5 and dose_unit ml for `5 ml TDS`', () => {
    const candidate = parse('5 ml TDS').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 5 });
    expect(candidate.dose_unit).toBe('ml');
    expect(candidate.frequency_code).toBe('THRICE_DAILY');
  });

  it('matches uppercase `5 mL` and lowercase `5 ml`', () => {
    const recordsLower = matchesFor(parse('5 ml TDS'), 'AMT-VOL-001');
    expect(recordsLower).toHaveLength(1);
    expect(recordsLower[0].matched_literal).toBe('5 ml');

    const recordsUpper = matchesFor(parse('5 mL TDS'), 'AMT-VOL-001');
    expect(recordsUpper).toHaveLength(1);
    expect(recordsUpper[0].matched_literal).toBe('5 mL');
  });

  it('matches attached `5ml` and spaced `5 ml`', () => {
    const recordsAttached = matchesFor(parse('5ml TDS'), 'AMT-VOL-001');
    expect(recordsAttached).toHaveLength(1);
    expect(recordsAttached[0].matched_literal).toBe('5ml');

    const recordsSpaced = matchesFor(parse('5 ml TDS'), 'AMT-VOL-001');
    expect(recordsSpaced).toHaveLength(1);
    expect(recordsSpaced[0].matched_literal).toBe('5 ml');
  });

  it('records match_type `regex` for all matched volume variants', () => {
    const records = matchesFor(parse('5 ml TDS'), 'AMT-VOL-001');
    expect(records).toHaveLength(1);
    expect(records[0].match_type).toBe('regex');
  });

  it('records exact 5-field provenance with rule_id AMT-VOL-001', () => {
    const records = matchesFor(parse('5 ml TDS'), 'AMT-VOL-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.rule_id).toBe('AMT-VOL-001');
    expect(record.dictionary_version).toBe('0.1.0');
  });

  it('attributes dose_amount and dose_unit to AMT-VOL-001 in field_provenance', () => {
    const { field_provenance } = parse('5 ml TDS').candidates[0];

    expect(field_provenance.dose_amount?.rule_id).toBe('AMT-VOL-001');
    expect(field_provenance.dose_unit?.rule_id).toBe('AMT-VOL-001');
  });

  it('rejects `5 mls`, `5 tablespoon`, and `x5 ml` via token boundaries', () => {
    expect(matchesFor(parse('5 mls TDS'), 'AMT-VOL-001')).toHaveLength(0);
    expect(matchesFor(parse('5 tablespoon TDS'), 'AMT-VOL-001')).toHaveLength(0);
    expect(matchesFor(parse('x5 ml TDS'), 'AMT-VOL-001')).toHaveLength(0);
  });

  it('rejects `5ml` inside concentration string `125mg/5ml` and extracts only the standalone `5 ml` dose amount in `Amoxicillin 125mg/5ml 5 ml TDS`', () => {
    const result = parse('Amoxicillin 125mg/5ml 5 ml TDS');
    const records = matchesFor(result, 'AMT-VOL-001');

    // Only the standalone '5 ml' should match, not the '5ml' after '/' in the concentration
    expect(records).toHaveLength(1);
    expect(records[0].matched_literal).toBe('5 ml');
    expect(codePointSlice('Amoxicillin 125mg/5ml 5 ml TDS', records[0].source_span)).toBe('5 ml');

    const candidate = result.candidates[0];
    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 5 });
    expect(candidate.dose_unit).toBe('ml');
    expect(candidate.frequency_code).toBe('THRICE_DAILY');

    expect(candidate.field_provenance.dose_amount?.rule_id).toBe('AMT-VOL-001');
    expect(candidate.field_provenance.frequency_code?.rule_id).toBe('FREQ-TDS-001');
  });

  it('reports missing frequency on bare volume lines like `5 ml` per dictionary §9 row 2', () => {
    const candidate = parse('5 ml').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 5 });
    expect(candidate.dose_unit).toBe('ml');
    expect(candidate.frequency_code).toBeNull();
    expect(candidate.missing_fields).toEqual([
      { field: 'frequency_code', reason: 'absent_from_prescription' },
    ]);
    expect(candidate.verifier_action_required).toBe(true);
  });
});
