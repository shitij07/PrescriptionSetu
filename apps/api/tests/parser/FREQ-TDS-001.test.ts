/**
 * FREQ-TDS-001 — thrice daily.
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is an authorized case
 * from `SHORTHAND_DICTIONARY.md` §7.1 and §11:
 *
 *   - `1 tab TDS`                           dictionary §7.1 test expectations
 *   - `Amoxicillin 500mg 1 tab TDS`         dictionary §7.1, §11 case 2 composition
 *   - `Give 1 tab TDS.`                     terminal period punctuation handling (D-029)
 *   - `TDSx`                                dictionary §7.1 negative test (boundary, §4)
 *   - `T05`                                 dictionary §7.1 negative test (no char substitution, §4)
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

const UNWRITTEN_BY_FREQ_TDS: readonly (keyof EffectiveClinicalFields)[] = [
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

describe('FREQ-TDS-001', () => {
  it('writes frequency_code THRICE_DAILY and times_per_day 3 for `1 tab TDS`', () => {
    const candidate = parse('1 tab TDS').candidates[0];

    expect(candidate.frequency_code).toBe('THRICE_DAILY');
    expect(candidate.times_per_day).toBe(3);
  });

  it('records match_type `exact` for canonical uppercase `TDS`', () => {
    const records = matchesFor(parse('1 tab TDS'), 'FREQ-TDS-001');
    expect(records).toHaveLength(1);
    expect(records[0].match_type).toBe('exact');
    expect(records[0].matched_literal).toBe('TDS');
  });

  it('records match_type `case-insensitive` for lowercase `tds`', () => {
    const records = matchesFor(parse('1 tab tds'), 'FREQ-TDS-001');
    expect(records).toHaveLength(1);
    expect(records[0].match_type).toBe('case-insensitive');
    expect(records[0].matched_literal).toBe('tds');
  });

  it('records match_type `punctuation-normalized` for dotted `T.D.S.` and `t.d.s.`', () => {
    const recordsUpper = matchesFor(parse('1 tab T.D.S.'), 'FREQ-TDS-001');
    expect(recordsUpper).toHaveLength(1);
    expect(recordsUpper[0].match_type).toBe('punctuation-normalized');
    expect(recordsUpper[0].matched_literal).toBe('T.D.S.');

    const recordsLower = matchesFor(parse('1 tab t.d.s.'), 'FREQ-TDS-001');
    expect(recordsLower).toHaveLength(1);
    expect(recordsLower[0].match_type).toBe('punctuation-normalized');
    expect(recordsLower[0].matched_literal).toBe('t.d.s.');
  });

  it('records exact 5-field provenance with rule_id FREQ-TDS-001', () => {
    const records = matchesFor(parse('1 tab TDS'), 'FREQ-TDS-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.rule_id).toBe('FREQ-TDS-001');
    expect(record.dictionary_version).toBe('0.1.0');
  });

  it('attributes frequency_code and times_per_day to FREQ-TDS-001 in field_provenance', () => {
    const { field_provenance } = parse('1 tab TDS').candidates[0];

    expect(field_provenance.frequency_code?.rule_id).toBe('FREQ-TDS-001');
    expect(field_provenance.times_per_day?.rule_id).toBe('FREQ-TDS-001');
  });

  it('does not match `TDSx` due to token boundary rules', () => {
    const result = parse('1 tab TDSx');

    expect(matchesFor(result, 'FREQ-TDS-001')).toHaveLength(0);
  });

  it('does not match `T05` by character substitution', () => {
    const result = parse('1 tab T05');

    expect(matchesFor(result, 'FREQ-TDS-001')).toHaveLength(0);
  });

  it('matches TDS with terminal sentence period in `Give 1 tab TDS.` without absorbing period', () => {
    const input = 'Give 1 tab TDS.';
    const records = matchesFor(parse(input), 'FREQ-TDS-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(record.matched_literal).toBe('TDS');
    expect(codePointSlice(input, record.source_span)).toBe('TDS');
  });

  it('composes with STR-MASS-001 and AMT-TAB-001 in `Amoxicillin 500mg 1 tab TDS`', () => {
    const candidate = parse('Amoxicillin 500mg 1 tab TDS').candidates[0];

    expect(candidate.dose_strength_value).toBe(500);
    expect(candidate.dose_strength_unit).toBe('mg');
    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(candidate.dose_unit).toBe('tablet');
    expect(candidate.frequency_code).toBe('THRICE_DAILY');
    expect(candidate.times_per_day).toBe(3);

    expect(candidate.field_provenance.dose_strength_value?.rule_id).toBe('STR-MASS-001');
    expect(candidate.field_provenance.dose_amount?.rule_id).toBe('AMT-TAB-001');
    expect(candidate.field_provenance.frequency_code?.rule_id).toBe('FREQ-TDS-001');
  });
});
