/**
 * FREQ-OD-001 / AMBIG-OD-001 — once daily / right eye ambiguity decision path.
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is an authorized case
 * from `SHORTHAND_DICTIONARY.md` §7.1 and §7.2:
 *
 *   - `Tab Atorvastatin OD`                 dictionary §7.1 test expectations
 *   - `1 tab OD`                            dictionary §7.1, §11 case 14
 *   - `Moxifloxacin eye drops 1 drop OD`    dictionary §7.2, §11 case 6 ophthalmic ambiguity
 *   - `Tab Amlo ODT`                        dictionary §7.1 negative test (boundary, §4)
 *   - `0D`                                  dictionary §7.1 negative test (no char substitution, §4)
 *   - `Give 1 tab OD.`                      terminal period punctuation handling (D-029)
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

const UNWRITTEN_BY_FREQ_OD: readonly (keyof EffectiveClinicalFields)[] = [
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

describe('FREQ-OD-001 and AMBIG-OD-001 (OD decision path)', () => {
  it('writes frequency_code ONCE_DAILY and times_per_day 1 for `Tab Atorvastatin OD`', () => {
    const candidate = parse('Tab Atorvastatin OD').candidates[0];

    expect(candidate.frequency_code).toBe('ONCE_DAILY');
    expect(candidate.times_per_day).toBe(1);
  });

  it('writes frequency_code ONCE_DAILY for `1 tab OD`', () => {
    const candidate = parse('1 tab OD').candidates[0];

    expect(candidate.frequency_code).toBe('ONCE_DAILY');
    expect(candidate.times_per_day).toBe(1);
  });

  it('records match_type `exact` for canonical uppercase `OD`', () => {
    const records = matchesFor(parse('1 tab OD'), 'FREQ-OD-001');
    expect(records).toHaveLength(1);
    expect(records[0].match_type).toBe('exact');
    expect(records[0].matched_literal).toBe('OD');
  });

  it('records match_type `case-insensitive` for lowercase `od`', () => {
    const records = matchesFor(parse('1 tab od'), 'FREQ-OD-001');
    expect(records).toHaveLength(1);
    expect(records[0].match_type).toBe('case-insensitive');
    expect(records[0].matched_literal).toBe('od');
  });

  it('records match_type `punctuation-normalized` for dotted `O.D.` and `o.d.`', () => {
    const recordsUpper = matchesFor(parse('1 tab O.D.'), 'FREQ-OD-001');
    expect(recordsUpper).toHaveLength(1);
    expect(recordsUpper[0].match_type).toBe('punctuation-normalized');
    expect(recordsUpper[0].matched_literal).toBe('O.D.');

    const recordsLower = matchesFor(parse('1 tab o.d.'), 'FREQ-OD-001');
    expect(recordsLower).toHaveLength(1);
    expect(recordsLower[0].match_type).toBe('punctuation-normalized');
    expect(recordsLower[0].matched_literal).toBe('o.d.');
  });

  it('records exact 5-field provenance with rule_id FREQ-OD-001', () => {
    const records = matchesFor(parse('1 tab OD'), 'FREQ-OD-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.rule_id).toBe('FREQ-OD-001');
    expect(record.dictionary_version).toBe('0.1.0');
  });

  it('attributes frequency_code and times_per_day to FREQ-OD-001 in field_provenance', () => {
    const { field_provenance } = parse('Tab Atorvastatin OD').candidates[0];

    expect(field_provenance.frequency_code?.rule_id).toBe('FREQ-OD-001');
    expect(field_provenance.times_per_day?.rule_id).toBe('FREQ-OD-001');
  });

  it('does not match OD inside `Tab Amlo ODT` due to token boundary rules', () => {
    const result = parse('Tab Amlo ODT');

    expect(matchesFor(result, 'FREQ-OD-001')).toHaveLength(0);
    expect(matchesFor(result, 'AMBIG-OD-001')).toHaveLength(0);
  });

  it('does not match `0D` (zero D) by character substitution', () => {
    const result = parse('0D');

    expect(matchesFor(result, 'FREQ-OD-001')).toHaveLength(0);
    expect(matchesFor(result, 'AMBIG-OD-001')).toHaveLength(0);
  });

  it('routes to AMBIG-OD-001 on ophthalmic line `Moxifloxacin eye drops 1 drop OD` and never fires FREQ-OD-001', () => {
    const result = parse('Moxifloxacin eye drops 1 drop OD');

    expect(matchesFor(result, 'FREQ-OD-001')).toHaveLength(0);
    expect(matchesFor(result, 'AMBIG-OD-001')).toHaveLength(1);
  });

  it('AMBIG-OD-001 leaves frequency_code and times_per_day as null (never ONCE_DAILY) per SI-05', () => {
    const candidate = parse('Moxifloxacin eye drops 1 drop OD').candidates[0];

    expect(candidate.frequency_code).toBeNull();
    expect(candidate.times_per_day).toBeNull();
    expect(candidate.frequency_code).not.toBe('ONCE_DAILY');
  });

  it('AMBIG-OD-001 populates candidate_readings with both candidate readings in exact dictionary order', () => {
    const candidate = parse('Moxifloxacin eye drops 1 drop OD').candidates[0];

    expect(candidate.candidate_readings).toEqual([
      { reading: 'once daily', rule_id: 'AMBIG-OD-001' },
      { reading: 'right eye', rule_id: 'AMBIG-OD-001' },
    ]);
  });

  it('AMBIG-OD-001 sets verifier_action_required to true per SI-05', () => {
    const candidate = parse('Moxifloxacin eye drops 1 drop OD').candidates[0];

    expect(candidate.verifier_action_required).toBe(true);
  });

  it('AMBIG-OD-001 records match in matches array with rule_id AMBIG-OD-001 and no entry in field_provenance for frequency', () => {
    const candidate = parse('Moxifloxacin eye drops 1 drop OD').candidates[0];

    const records = candidate.matches.filter((m) => m.rule_id === 'AMBIG-OD-001');
    expect(records).toHaveLength(1);
    expect(records[0].rule_id).toBe('AMBIG-OD-001');
    expect(records[0].matched_literal).toBe('OD');

    expect(candidate.field_provenance.frequency_code).toBeUndefined();
    expect(candidate.field_provenance.times_per_day).toBeUndefined();
  });
});
