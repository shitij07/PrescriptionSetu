/**
 * FREQ-QID-001 — four times daily (covers both QID and QDS).
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is an authorized case
 * from `SHORTHAND_DICTIONARY.md` §7.1 and §11:
 *
 *   - `1 tab QID`                           dictionary §7.1 test expectations
 *   - `1 tab QDS`                           dictionary §7.1, §11 case 4
 *   - `Give 1 tab QID.`                     terminal period punctuation handling (D-029)
 *   - `1 tab QIDx` / `1 tab QDSx`           dictionary §7.1 negative tests (boundary, §4)
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

const UNWRITTEN_BY_FREQ_QID: readonly (keyof EffectiveClinicalFields)[] = [
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

describe('FREQ-QID-001', () => {
  it('writes frequency_code FOUR_TIMES_DAILY and times_per_day 4 for `1 tab QID`', () => {
    const candidate = parse('1 tab QID').candidates[0];

    expect(candidate.frequency_code).toBe('FOUR_TIMES_DAILY');
    expect(candidate.times_per_day).toBe(4);
  });

  it('writes frequency_code FOUR_TIMES_DAILY and times_per_day 4 for `1 tab QDS`', () => {
    const candidate = parse('1 tab QDS').candidates[0];

    expect(candidate.frequency_code).toBe('FOUR_TIMES_DAILY');
    expect(candidate.times_per_day).toBe(4);
  });

  it('records match_type `exact` for canonical uppercase `QID`', () => {
    const records = matchesFor(parse('1 tab QID'), 'FREQ-QID-001');
    expect(records).toHaveLength(1);
    expect(records[0].match_type).toBe('exact');
    expect(records[0].matched_literal).toBe('QID');
  });

  it('records match_type `exact` for canonical uppercase `QDS`', () => {
    const records = matchesFor(parse('1 tab QDS'), 'FREQ-QID-001');
    expect(records).toHaveLength(1);
    expect(records[0].match_type).toBe('exact');
    expect(records[0].matched_literal).toBe('QDS');
  });

  it('records match_type `case-insensitive` for lowercase `qid` and `qds`', () => {
    const recordsQid = matchesFor(parse('1 tab qid'), 'FREQ-QID-001');
    expect(recordsQid).toHaveLength(1);
    expect(recordsQid[0].match_type).toBe('case-insensitive');
    expect(recordsQid[0].matched_literal).toBe('qid');

    const recordsQds = matchesFor(parse('1 tab qds'), 'FREQ-QID-001');
    expect(recordsQds).toHaveLength(1);
    expect(recordsQds[0].match_type).toBe('case-insensitive');
    expect(recordsQds[0].matched_literal).toBe('qds');
  });

  it('records match_type `punctuation-normalized` for dotted `Q.I.D.`, `q.i.d.`, `Q.D.S.`, `q.d.s.`', () => {
    const qidDotted = matchesFor(parse('1 tab Q.I.D.'), 'FREQ-QID-001');
    expect(qidDotted).toHaveLength(1);
    expect(qidDotted[0].match_type).toBe('punctuation-normalized');
    expect(qidDotted[0].matched_literal).toBe('Q.I.D.');

    const qdsDotted = matchesFor(parse('1 tab q.d.s.'), 'FREQ-QID-001');
    expect(qdsDotted).toHaveLength(1);
    expect(qdsDotted[0].match_type).toBe('punctuation-normalized');
    expect(qdsDotted[0].matched_literal).toBe('q.d.s.');
  });

  it('records exact 5-field provenance with rule_id FREQ-QID-001', () => {
    const records = matchesFor(parse('1 tab QID'), 'FREQ-QID-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.rule_id).toBe('FREQ-QID-001');
    expect(record.dictionary_version).toBe('0.1.0');
  });

  it('preserves exact matched_literal in provenance when QDS is matched', () => {
    const records = matchesFor(parse('1 tab QDS'), 'FREQ-QID-001');
    expect(records).toHaveLength(1);
    expect(records[0].matched_literal).toBe('QDS');
    expect(records[0].rule_id).toBe('FREQ-QID-001');
  });

  it('attributes frequency_code and times_per_day to FREQ-QID-001 in field_provenance', () => {
    const { field_provenance } = parse('1 tab QID').candidates[0];

    expect(field_provenance.frequency_code?.rule_id).toBe('FREQ-QID-001');
    expect(field_provenance.times_per_day?.rule_id).toBe('FREQ-QID-001');
  });

  it('does not match `QIDx` or `QDSx` due to token boundary rules', () => {
    expect(matchesFor(parse('1 tab QIDx'), 'FREQ-QID-001')).toHaveLength(0);
    expect(matchesFor(parse('1 tab QDSx'), 'FREQ-QID-001')).toHaveLength(0);
  });

  it('matches QID with terminal sentence period in `Give 1 tab QID.` without absorbing period', () => {
    const input = 'Give 1 tab QID.';
    const records = matchesFor(parse(input), 'FREQ-QID-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(record.matched_literal).toBe('QID');
    expect(codePointSlice(input, record.source_span)).toBe('QID');
  });
});
