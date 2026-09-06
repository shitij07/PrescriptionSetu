/**
 * AMT-TAB-001 — whole tablet counts.
 *
 * Named by rule ID per `API_CONTRACTS.md` §12.3. Every input below is an authorized case
 * from `SHORTHAND_DICTIONARY.md`:
 *
 *   - `1 tablet`                   dictionary §7.6 test expectations
 *   - `2 tab BD`                    dictionary §7.6 test expectations
 *   - `2 tabs` / `3 tablets`        dictionary §7.6 unit literals
 *   - `1 Tab` / `2 TABS` / `1 TABLET` dictionary §4 case insensitivity
 *   - `1 tablespoon`                dictionary §7.6 — non-match (token boundary, §4)
 *   - `1/2 tab`                     dictionary §7.6 / §11 case 14 — fraction, non-match for whole count
 *   - `l tab`                       dictionary §11 case 24 — lowercase L, no number substitution
 *   - `1 tab BD`                    dictionary §7.1, §11 case 2 composition
 *   - `1 tab`                       dictionary §9 row 2 missing frequency reporting
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

const UNWRITTEN_BY_TABLET_AMOUNT: readonly (keyof EffectiveClinicalFields)[] = [
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

describe('AMT-TAB-001', () => {
  it('writes dose_amount 1 and dose_unit tablet for `1 tablet`', () => {
    const candidate = parse('1 tablet').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(candidate.dose_unit).toBe('tablet');
  });

  it('writes dose_amount 2 and dose_unit tablet for `2 tab BD`', () => {
    const candidate = parse('2 tab BD').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 2 });
    expect(candidate.dose_unit).toBe('tablet');
  });

  it('matches plural form `tabs`', () => {
    const candidate = parse('2 tabs').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 2 });
    expect(candidate.dose_unit).toBe('tablet');
  });

  it('matches plural form `tablets`', () => {
    const candidate = parse('3 tablets').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 3 });
    expect(candidate.dose_unit).toBe('tablet');
  });

  it('matches ASCII case-folded forms (1 Tab, 2 TABS, 1 TABLET)', () => {
    const tabMatch = parse('1 Tab').candidates[0];
    expect(tabMatch.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(tabMatch.dose_unit).toBe('tablet');

    const tabsMatch = parse('2 TABS').candidates[0];
    expect(tabsMatch.dose_amount).toEqual({ kind: 'integer', value: 2 });
    expect(tabsMatch.dose_unit).toBe('tablet');

    const tabletsMatch = parse('1 TABLET').candidates[0];
    expect(tabletsMatch.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(tabletsMatch.dose_unit).toBe('tablet');
  });

  it('records the match with exactly the five provenance fields and match_type `regex`', () => {
    const records = matchesFor(parse('1 tablet'), 'AMT-TAB-001');
    expect(records).toHaveLength(1);
    const record = records[0];

    expect(Object.keys(record).sort()).toEqual([
      'dictionary_version',
      'match_type',
      'matched_literal',
      'rule_id',
      'source_span',
    ]);
    expect(record.matched_literal).toBe('1 tablet');
    expect(record.dictionary_version).toBe('0.1.0');
    expect(record.match_type).toBe('regex');
  });

  it('source_span reads back exactly matched_literal, measured in code points', () => {
    const input = 'Give 2 tab BD';
    const records = matchesFor(parse(input), 'AMT-TAB-001');
    expect(records).toHaveLength(1);
    const { source_span, matched_literal } = records[0];

    expect(matched_literal).toBe('2 tab');
    expect(codePointSlice(input, source_span)).toBe(matched_literal);
    expect(source_span.end).toBeGreaterThan(source_span.start);
  });

  it('attributes both written fields to AMT-TAB-001 in field_provenance', () => {
    const { field_provenance } = parse('1 tablet').candidates[0];

    expect(field_provenance.dose_amount?.rule_id).toBe('AMT-TAB-001');
    expect(field_provenance.dose_unit?.rule_id).toBe('AMT-TAB-001');
  });

  it('claims no field beyond dose_amount and dose_unit in field_provenance', () => {
    const { field_provenance } = parse('1 tablet').candidates[0];

    const claimed = (Object.keys(field_provenance) as (keyof typeof field_provenance)[]).filter(
      (field) => {
        const entry = field_provenance[field];
        return Array.isArray(entry)
          ? entry.some((record) => record.rule_id === 'AMT-TAB-001')
          : entry?.rule_id === 'AMT-TAB-001';
      },
    );

    expect(claimed.sort()).toEqual(['dose_amount', 'dose_unit']);
  });

  it('leaves fields no rule wrote as null rather than defaulting them', () => {
    const candidate = parse('1 tablet').candidates[0];

    for (const field of UNWRITTEN_BY_TABLET_AMOUNT) {
      expect(candidate[field]).toBeNull();
    }
    expect(candidate.schedule_derivable).not.toBe(true);
  });

  it('does not match `1 tablespoon` due to token boundary rules', () => {
    const result = parse('1 tablespoon');

    expect(matchesFor(result, 'AMT-TAB-001')).toHaveLength(0);
  });

  it('does not match `1/2 tab` as whole tablet count (boundary rejection of prefix `/`)', () => {
    const result = parse('1/2 tab');

    expect(matchesFor(result, 'AMT-TAB-001')).toHaveLength(0);
  });

  it('does not match `l tab` (lowercase L) as a number', () => {
    const result = parse('l tab');

    expect(matchesFor(result, 'AMT-TAB-001')).toHaveLength(0);
  });

  it('composes with FREQ-BD-001 in `1 tab BD` and clears missing dose_amount reporting', () => {
    const candidate = parse('1 tab BD').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(candidate.dose_unit).toBe('tablet');
    expect(candidate.frequency_code).toBe('TWICE_DAILY');
    expect(candidate.times_per_day).toBe(2);

    expect(candidate.missing_fields).toEqual([]);
    expect(candidate.verifier_action_required).toBeNull();
  });

  it('reports missing frequency_code for bare amount line `1 tab` per dictionary §9', () => {
    const candidate = parse('1 tab').candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(candidate.dose_unit).toBe('tablet');
    expect(candidate.frequency_code).toBeNull();
    expect(candidate.missing_fields).toEqual([
      { field: 'frequency_code', reason: 'absent_from_prescription' },
    ]);
    expect(candidate.verifier_action_required).toBe(true);
  });
});
