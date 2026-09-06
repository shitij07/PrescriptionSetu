/**
 * AMT-FRAC-001 — tablet fractions (1/2, ½, 1/4, ¼).
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is an authorized case
 * from `SHORTHAND_DICTIONARY.md` §7.6, §11 case 14, and `API_CONTRACTS.md` §7:
 *
 *   - `1/2 tab OD`                          dictionary §7.6, §11 case 14
 *   - `½ tablet HS`                         dictionary §7.6
 *   - `1/4 tab`                             dictionary §7.6, API_CONTRACTS.md §7
 *   - `¼ tablets`                           dictionary §7.6, API_CONTRACTS.md §7
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

const UNWRITTEN_BY_AMT_FRAC: readonly (keyof EffectiveClinicalFields)[] = [
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

describe('AMT-FRAC-001', () => {
  it('writes exact fraction 1/2 and dose_unit tablet for `1/2 tab`', () => {
    const candidate = parse('1/2 tab').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'fraction', numerator: 1, denominator: 2 });
    expect(candidate.dose_unit).toBe('tablet');
  });

  it('writes exact fraction 1/2 and dose_unit tablet for Unicode `½ tablet`', () => {
    const candidate = parse('½ tablet').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'fraction', numerator: 1, denominator: 2 });
    expect(candidate.dose_unit).toBe('tablet');
  });

  it('writes exact fraction 1/4 and dose_unit tablet for `1/4 tab`', () => {
    const candidate = parse('1/4 tab').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'fraction', numerator: 1, denominator: 4 });
    expect(candidate.dose_unit).toBe('tablet');
  });

  it('writes exact fraction 1/4 and dose_unit tablet for Unicode `¼ tablets`', () => {
    const candidate = parse('¼ tablets').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'fraction', numerator: 1, denominator: 4 });
    expect(candidate.dose_unit).toBe('tablet');
  });

  it('asserts that dose_amount is never a floating-point number in memory or serialized JSON', () => {
    const resultHalf = parse('1/2 tab OD');
    const resultQuarter = parse('¼ tab');

    expect(resultHalf.candidates[0].dose_amount).toEqual({
      kind: 'fraction',
      numerator: 1,
      denominator: 2,
    });
    expect(resultQuarter.candidates[0].dose_amount).toEqual({
      kind: 'fraction',
      numerator: 1,
      denominator: 4,
    });

    const jsonHalf = JSON.stringify(resultHalf);
    const jsonQuarter = JSON.stringify(resultQuarter);

    expect(jsonHalf).not.toMatch(/0\.5/);
    expect(jsonQuarter).not.toMatch(/0\.25/);
  });

  it('records match_type `regex` for matched fraction variants', () => {
    const recordsHalfSlash = matchesFor(parse('1/2 tab'), 'AMT-FRAC-001');
    expect(recordsHalfSlash).toHaveLength(1);
    expect(recordsHalfSlash[0].match_type).toBe('regex');
    expect(recordsHalfSlash[0].matched_literal).toBe('1/2 tab');

    const recordsHalfUnicode = matchesFor(parse('½ tablet'), 'AMT-FRAC-001');
    expect(recordsHalfUnicode).toHaveLength(1);
    expect(recordsHalfUnicode[0].match_type).toBe('regex');
    expect(recordsHalfUnicode[0].matched_literal).toBe('½ tablet');

    const recordsQuarterSlash = matchesFor(parse('1/4 tabs'), 'AMT-FRAC-001');
    expect(recordsQuarterSlash).toHaveLength(1);
    expect(recordsQuarterSlash[0].match_type).toBe('regex');
    expect(recordsQuarterSlash[0].matched_literal).toBe('1/4 tabs');

    const recordsQuarterUnicode = matchesFor(parse('¼ tablets'), 'AMT-FRAC-001');
    expect(recordsQuarterUnicode).toHaveLength(1);
    expect(recordsQuarterUnicode[0].match_type).toBe('regex');
    expect(recordsQuarterUnicode[0].matched_literal).toBe('¼ tablets');
  });

  it('records exact 5-field provenance with rule_id AMT-FRAC-001', () => {
    const records = matchesFor(parse('1/2 tab'), 'AMT-FRAC-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.rule_id).toBe('AMT-FRAC-001');
    expect(record.dictionary_version).toBe('0.1.0');
  });

  it('measures source_span correctly in Unicode code points for Unicode `½ tab` vs `1/2 tab`', () => {
    const inputUnicode = 'Take ½ tab daily';
    const recordsUnicode = matchesFor(parse(inputUnicode), 'AMT-FRAC-001');
    expect(recordsUnicode).toHaveLength(1);
    expect(recordsUnicode[0].source_span).toEqual({ start: 5, end: 10 });
    expect(codePointSlice(inputUnicode, recordsUnicode[0].source_span)).toBe('½ tab');

    const inputSlash = 'Take 1/2 tab daily';
    const recordsSlash = matchesFor(parse(inputSlash), 'AMT-FRAC-001');
    expect(recordsSlash).toHaveLength(1);
    expect(recordsSlash[0].source_span).toEqual({ start: 5, end: 12 });
    expect(codePointSlice(inputSlash, recordsSlash[0].source_span)).toBe('1/2 tab');
  });

  it('attributes dose_amount and dose_unit to AMT-FRAC-001 in field_provenance', () => {
    const { field_provenance } = parse('1/2 tab').candidates[0];

    expect(field_provenance.dose_amount?.rule_id).toBe('AMT-FRAC-001');
    expect(field_provenance.dose_unit?.rule_id).toBe('AMT-FRAC-001');
  });

  it('prevents AMT-TAB-001 from matching `2 tab` inside `1/2 tab` or `4 tab` inside `1/4 tab`', () => {
    const resultHalf = parse('1/2 tab');
    expect(matchesFor(resultHalf, 'AMT-TAB-001')).toHaveLength(0);

    const resultQuarter = parse('1/4 tab');
    expect(matchesFor(resultQuarter, 'AMT-TAB-001')).toHaveLength(0);
  });

  it('rejects fractions missing required whitespace: `1/2tab` and `½tab`', () => {
    expect(matchesFor(parse('1/2tab'), 'AMT-FRAC-001')).toHaveLength(0);
    expect(matchesFor(parse('½tab'), 'AMT-FRAC-001')).toHaveLength(0);
  });

  it('rejects non-unit tokens and trailing characters: `1/2 tablespoon` and `½ tabx`', () => {
    expect(matchesFor(parse('1/2 tablespoon'), 'AMT-FRAC-001')).toHaveLength(0);
    expect(matchesFor(parse('½ tabx'), 'AMT-FRAC-001')).toHaveLength(0);
  });

  it('rejects unsupported fractions: `3/4 tab` and `1/3 tab`', () => {
    expect(matchesFor(parse('3/4 tab'), 'AMT-FRAC-001')).toHaveLength(0);
    expect(matchesFor(parse('1/3 tab'), 'AMT-FRAC-001')).toHaveLength(0);
  });

  it('composes with FREQ-OD-001 in `1/2 tab OD`', () => {
    const candidate = parse('1/2 tab OD').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'fraction', numerator: 1, denominator: 2 });
    expect(candidate.dose_unit).toBe('tablet');
    expect(candidate.frequency_code).toBe('ONCE_DAILY');
    expect(candidate.times_per_day).toBe(1);

    expect(candidate.field_provenance.dose_amount?.rule_id).toBe('AMT-FRAC-001');
    expect(candidate.field_provenance.frequency_code?.rule_id).toBe('FREQ-OD-001');
    expect(candidate.missing_fields).toHaveLength(0);
  });

  it('reports missing frequency on bare fraction lines like `½ tablet` per dictionary §9 row 2', () => {
    const candidate = parse('½ tablet').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'fraction', numerator: 1, denominator: 2 });
    expect(candidate.dose_unit).toBe('tablet');
    expect(candidate.frequency_code).toBeNull();
    expect(candidate.missing_fields).toEqual([
      { field: 'frequency_code', reason: 'absent_from_prescription' },
    ]);
    expect(candidate.verifier_action_required).toBe(true);
  });
});
