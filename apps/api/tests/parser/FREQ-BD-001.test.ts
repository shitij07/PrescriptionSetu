/**
 * FREQ-BD-001 — twice daily.
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is a case the dictionary
 * already commits to, so these tests assert the contract rather than my reading of it:
 *
 *   - `1 tab BD`          dictionary §7.1 test expectations, §11 case 2
 *   - `Give 1 tab BD.`    §11 case 21 — "BD matches; terminal period is not part of the token"
 *   - `BDS`               §7.1 and §11 case 16 — no match (token boundary, §4)
 *   - `8D`                §7.1 and §11 case 22 — no match; no character-substitution recovery
 *
 * The last two matter more than the positives. A parser that recovers `8D` to `BD` by guessing
 * at OCR damage would be silently inventing a dosing frequency, which is the exact failure
 * this project's verification gate exists to prevent. The dictionary forbids that recovery
 * outright, so it is tested as a hard requirement.
 *
 * These are shorthand tokens and a plain dose form, not real prescription content, and no
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

/**
 * Reads the text a span covers using **Unicode code points**, which is the unit `source_span`
 * is defined in (§5.1; D-023). `String.prototype.slice` would be UTF-16 code units and would
 * agree with this only for input that happens to be entirely BMP — so using it here would
 * make the suite pass while the contract was being violated.
 */
function codePointSlice(text: string, span: SourceSpan): string {
  return Array.from(text).slice(span.start, span.end).join('');
}

/** Every record for one rule, across all candidates, so no candidate count is presumed. */
function matchesFor(result: ParseResult, ruleId: RuleId): MatchRecord[] {
  return result.candidates.flatMap((candidate) => candidate.matches).filter((m) => m.rule_id === ruleId);
}

/**
 * Fields that no rule fires for in `1 tab BD`, and which must therefore be null rather than
 * defaulted (§4.4). `schedule_derivable` and `verifier_action_required` are excluded on
 * purpose. The first is asserted separately as fail-safe (§4.7).
 *
 * The second is excluded because it is not a field the *line* leaves unwritten — it is the
 * parser's report about its own coverage, and its value therefore depends on which rules exist.
 * In this slice it is `true` because `AMT-TAB-001` is not implemented, so the `1 tab` in this
 * line goes unclaimed and dictionary §9 reports the amount missing. Once that rule lands the
 * amount will be read and this flag may fall silent for this input — which is exactly why it
 * does not belong in a sweep of fields the prescription did not state. Note that `dose_amount`
 * and `dose_unit` are absent from the list below for the same reason: the text does state them,
 * and their being null is a gap in the parser rather than a fact about the prescription.
 */
const UNWRITTEN_BY_THIS_LINE: readonly (keyof EffectiveClinicalFields)[] = [
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

describe('FREQ-BD-001', () => {
  it('writes frequency_code TWICE_DAILY and times_per_day 2 for `1 tab BD`', () => {
    const candidate = parse('1 tab BD').candidates[0];

    expect(candidate.frequency_code).toBe('TWICE_DAILY');
    expect(candidate.times_per_day).toBe(2);
  });

  it('records the match with exactly the five provenance fields', () => {
    const records = matchesFor(parse('1 tab BD'), 'FREQ-BD-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    // Exactly five — not four, not six. No `tier`, no `canonical_expansion` (§5.4; D-022).
    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.matched_literal).toBe('BD');
    expect(record.dictionary_version).toBe('0.1.0');
    // Uppercase `BD` is the dictionary's own form, so no normalization was needed (D-027).
    expect(record.match_type).toBe('exact');
  });

  it('source_span reads back exactly matched_literal, measured in code points', () => {
    const input = '1 tab BD';
    const records = matchesFor(parse(input), 'FREQ-BD-001');
    expect(records).toHaveLength(1);
    const { source_span, matched_literal } = records[0];

    expect(codePointSlice(input, source_span)).toBe(matched_literal);
    expect(source_span.end).toBeGreaterThan(source_span.start);
  });

  it('attributes both written fields to FREQ-BD-001 in field_provenance', () => {
    const { field_provenance } = parse('1 tab BD').candidates[0];

    expect(field_provenance.frequency_code?.rule_id).toBe('FREQ-BD-001');
    expect(field_provenance.times_per_day?.rule_id).toBe('FREQ-BD-001');
  });

  it('claims no field beyond the two it writes', () => {
    const { field_provenance } = parse('1 tab BD').candidates[0];

    // `1 tab` legitimately writes dose_amount and dose_unit — but via AMT-TAB-001, not this
    // rule. Provenance is per field, so a rule overreaching is visible here (§5.3).
    const claimed = (Object.keys(field_provenance) as (keyof typeof field_provenance)[]).filter(
      (field) => {
        const entry = field_provenance[field];
        return Array.isArray(entry)
          ? entry.some((record) => record.rule_id === 'FREQ-BD-001')
          : entry?.rule_id === 'FREQ-BD-001';
      },
    );

    expect(claimed.sort()).toEqual(['frequency_code', 'times_per_day']);
  });

  it('leaves fields no rule wrote as null rather than defaulting them', () => {
    const candidate = parse('1 tab BD').candidates[0];

    for (const field of UNWRITTEN_BY_THIS_LINE) {
      expect(candidate[field]).toBeNull();
    }
    // Fail-safe: no rule in dictionary 0.1.0 may raise this (§4.7).
    expect(candidate.schedule_derivable).not.toBe(true);
  });

  it('does not match BD inside `BDS`', () => {
    const result = parse('BDS');

    expect(matchesFor(result, 'FREQ-BD-001')).toHaveLength(0);
    expect(result.candidates.map((candidate) => candidate.frequency_code)).not.toContain('TWICE_DAILY');
  });

  it('does not recover `8D` to BD by character substitution', () => {
    const result = parse('8D');

    expect(matchesFor(result, 'FREQ-BD-001')).toHaveLength(0);
    expect(result.candidates.map((candidate) => candidate.frequency_code)).not.toContain('TWICE_DAILY');
  });

  it('still matches BD when a terminal sentence period follows, without absorbing it', () => {
    const input = 'Give 1 tab BD.';
    const records = matchesFor(parse(input), 'FREQ-BD-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(record.matched_literal).toBe('BD');
    expect(codePointSlice(input, record.source_span)).toBe('BD');
  });
});
