/**
 * SI-07 — the parser must never invent a dose amount.
 *
 * Fixture: `Metformin 500 mg BD` — the dictionary's own canonical worked example
 * (`SHORTHAND_DICTIONARY.md` §9; §11 case 1), whose complete expected output is published
 * there field by field. These tests assert that table, not an interpretation of it.
 *
 * On the fixture containing a drug name: constraint "use dictionary-supported examples only"
 * and constraint "no real prescription data in fixtures" pull in opposite directions here, so
 * the reasoning is recorded rather than quietly resolved. AGENTS.md §8 forbids logging drug
 * names in plaintext and using real patients' prescription images as test data. This string is
 * neither: it carries no patient identifier, comes from no real prescription, and is the
 * specification's published illustration — and `API_CONTRACTS.md` §12.5 requires this exact
 * case to be covered. The parser also does no logging at all (§3.6; SI-16), so nothing here
 * can reach a log. If the project later decides that even specification examples must be
 * anonymised, this fixture and the dictionary's §9 table change together.
 *
 * Why this case is the important one: the line states a *strength* (500 mg) and a *frequency*
 * (twice daily) but never says how much to take. The plausible, helpful, wrong behaviour is to
 * fill that silence with "1 tablet" — the modal dose, and a value that would look entirely
 * reasonable to a verifier skimming a screen. It would also be a fabricated dosing
 * instruction. So the assertions below are deliberately doubled: `dose_amount` must be null,
 * *and* must not be the specific invented value 1; `dose_unit` must be null, *and* must not be
 * `tablet`. A single null check would pass against a parser that invents on some other input.
 * The gap must instead surface as a `missing_fields` entry and raise
 * `verifier_action_required`, which is what routes the decision to a human (§4.8).
 */

import { parse } from '../../src/parser/parse';
import type { MatchRecord, ParseResult, RuleId } from '../../src/parser/types';

const INSTRUCTION = 'Metformin 500 mg BD';

function matchesFor(result: ParseResult, ruleId: RuleId): MatchRecord[] {
  return result.candidates.flatMap((candidate) => candidate.matches).filter((m) => m.rule_id === ruleId);
}

describe('SI-07', () => {
  it('reads the stated strength as 500 mg', () => {
    const candidate = parse(INSTRUCTION).candidates[0];

    expect(candidate.dose_strength_value).toBe(500);
    expect(candidate.dose_strength_unit).toBe('mg');
    expect(candidate.field_provenance.dose_strength_value?.rule_id).toBe('STR-MASS-001');
  });

  it('reads the stated frequency as twice daily', () => {
    const candidate = parse(INSTRUCTION).candidates[0];

    expect(candidate.frequency_code).toBe('TWICE_DAILY');
    expect(candidate.times_per_day).toBe(2);
  });

  it('does not convert a strength into a dose amount', () => {
    const result = parse(INSTRUCTION);
    const candidate = result.candidates[0];

    expect(candidate.dose_amount).toBeNull();
    // Not merely absent — specifically not the invented value a helpful parser would guess.
    expect(candidate.dose_amount).not.toEqual({ kind: 'integer', value: 1 });
    // And no tablet-amount rule may claim to have fired, since nothing in the line says it.
    expect(matchesFor(result, 'AMT-TAB-001')).toHaveLength(0);
    expect(candidate.field_provenance.dose_amount).toBeUndefined();
  });

  it('does not infer a dose unit from the dose form', () => {
    const candidate = parse(INSTRUCTION).candidates[0];

    expect(candidate.dose_unit).toBeNull();
    expect(candidate.dose_unit).not.toBe('tablet');
  });

  it('reports the missing dose amount rather than leaving it unremarked', () => {
    const candidate = parse(INSTRUCTION).candidates[0];

    expect(candidate.missing_fields).toContainEqual({
      field: 'dose_amount',
      reason: 'absent_from_prescription',
    });
  });

  it('raises verifier_action_required so a human must supply the amount', () => {
    const candidate = parse(INSTRUCTION).candidates[0];

    expect(candidate.verifier_action_required).toBe(true);
  });

  it('does not report the schedule as derivable', () => {
    const candidate = parse(INSTRUCTION).candidates[0];

    // Twice daily is known, the amount is not, so no administration is fully specified.
    // Consumers must require `=== true`, which dictionary 0.1.0 never produces (§4.7).
    expect(candidate.schedule_derivable).not.toBe(true);
  });
});
