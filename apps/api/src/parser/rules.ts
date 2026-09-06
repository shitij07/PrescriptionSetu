/**
 * The implemented slice of `docs/SHORTHAND_DICTIONARY.md` — rule data plus the matching
 * mechanics each rule needs.
 *
 * **Two of nineteen rules are implemented:** `FREQ-BD-001` (§7.1) and `STR-MASS-001` (§7.7).
 * `STR-MASS-001` is here because SI-07 is stated in terms of a strength that must not become
 * an amount, so the invariant cannot be tested without it. Every other rule — including
 * `AMT-TAB-001`, which would legitimately claim the `1 tab` in `1 tab BD` — is deliberately
 * absent and arrives in a later slice.
 *
 * **How SI-07 is enforced here.** Each rule declares a category, and a category's permitted
 * writes are fixed by `CATEGORY_WRITABLE_FIELDS`. A rule's `writes` object is typed as a
 * `Pick` of exactly those fields, so `STR-MASS-001` writing `dose_amount` or `dose_unit` is a
 * **compile error**, not a runtime check that a future edit could bypass (SI-07 "Enforcement
 * (prospective)"; `API_CONTRACTS.md` §12.4 "Category isolation"; dictionary §8 rule 2). There
 * is no code anywhere that reads a strength and produces an amount.
 *
 * Nothing here logs (§3.6; SI-16), and no rule holds mutable state between calls.
 */

import { foldAsciiCase, hasTokenBoundaries, sliceByCodePoints, utf16ToCodePointIndex } from './text';
import type {
  CandidateReading,
  DoseStrengthUnit,
  EffectiveClinicalFields,
  MatchType,
  RuleId,
  SourceSpan,
} from './types';

/**
 * The dictionary revision this build implements, pinned at build time. It is **not** a
 * parameter and is never read from the environment (`API_CONTRACTS.md` §3.5), and it is
 * recorded on every match (§5).
 */
export const DICTIONARY_VERSION = '0.1.0';

/**
 * Which effective fields each implemented category may write — the data form of SI-07's
 * category isolation. Only the two categories this slice implements appear; adding a rule
 * means adding its category here first, which is the point.
 */
export const CATEGORY_WRITABLE_FIELDS = {
  /** Dictionary §7.1. `Must remain null`: all dose, duration, anchor and conditional fields. */
  frequency: ['frequency_code', 'times_per_day'],
  /** Dictionary §7.2. `Must remain null`: every frequency, dose, and duration field. */
  'circadian-anchor': ['timing_anchors'],
  /** Dictionary §7.3. `Must remain null`: every frequency, dose, and duration field. */
  'meal-timing': ['timing_anchors'],
  /** Dictionary §7.4. `Must remain null`: max_doses_per_day, min_interval_hours, frequency, dose, duration (SI-08). */
  'conditional-use': ['as_needed', 'schedule_derivable'],
  /** Dictionary §7.5. `Must remain null`: frequency_code, times_per_day, all dose and duration fields (SI-09). */
  'single-dose': ['total_doses', 'recurring', 'immediate', 'schedule_derivable'],
  /** Dictionary §7.6. `Must remain null`: `dose_strength_value`, `dose_strength_unit`, all frequency fields. */
  'dose-amount': ['dose_amount', 'dose_unit'],
  /** Dictionary §7.7. `Must remain null`: **`dose_amount`, `dose_unit`**, frequency, duration. */
  strength: ['dose_strength_value', 'dose_strength_unit'],
  /** Dictionary §7.8. `Must remain null`: all frequency and dose fields. */
  duration: ['duration_value', 'duration_unit', 'duration_indefinite'],
} as const satisfies Readonly<Record<string, readonly (keyof EffectiveClinicalFields)[]>>;

export type RuleCategory = keyof typeof CATEGORY_WRITABLE_FIELDS;

/** Every field any implemented rule may write, across all categories. */
export type WritableFieldName = (typeof CATEGORY_WRITABLE_FIELDS)[RuleCategory][number];

/** The fields one category may write, as a type. Writing anything else will not compile. */
type FieldWrites<C extends RuleCategory> = Partial<
  Pick<EffectiveClinicalFields, (typeof CATEGORY_WRITABLE_FIELDS)[C][number]>
>;

/** One rule firing on one span of the input. */
export interface RuleMatch<C extends RuleCategory> {
  rule_id: RuleId;
  category: C;
  /** The source text as it appears in the input — `bd` records `bd`, never `BD` (§5). */
  matched_literal: string;
  /** Half-open `[start, end)` in Unicode code points (§5.1; D-023). */
  source_span: SourceSpan;
  match_type: MatchType;
  writes: FieldWrites<C>;
  candidate_readings?: readonly CandidateReading[];
  verifier_action_required?: boolean;
}

/** A match from any implemented category, as a discriminated union over `category`. */
export type AnyRuleMatch = { [C in RuleCategory]: RuleMatch<C> }[RuleCategory];

export interface Rule {
  readonly id: RuleId;
  readonly category: RuleCategory;
  /**
   * All matches for this rule, left to right, non-overlapping. Pure: same input, same output.
   * Takes both the raw text and its code-point array so neither has to be recomputed per rule.
   */
  find(rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[];
}

// ---------------------------------------------------------------------------------------------
// Literal matching (dictionary §4 normalizations 1 and 2)
// ---------------------------------------------------------------------------------------------

interface LiteralMatch {
  literal: string;
  length: number;
  match_type: MatchType;
}

/**
 * A rule's declared `match_forms`, with the canonical spelling kept **separately** from the
 * order the forms are tried in. Those two things pull in opposite directions, and conflating
 * them is a real bug rather than a hypothetical one: matching must try the longest form first so
 * `B.D.` wins over its `BD` prefix, but only the canonical form may be classified `exact`. When
 * the canonical form was read as "the first form after sorting", `BD` sorted behind `B.D.` and
 * was misreported as `case-insensitive` — caught by probe, not by inspection.
 */
interface LiteralForms {
  /** The spellings that can yield `exact` (e.g. ['BD'], ['QID', 'QDS']). */
  canonicals: readonly string[];
  /** Every declared form, longest first. */
  ordered: readonly string[];
}

/** Declares a rule's forms: canonical(s) first in the argument list, longest first in the result. */
function declareForms(
  canonical: string | readonly string[],
  ...variants: readonly string[]
): LiteralForms {
  const canonicals = Array.isArray(canonical) ? canonical : [canonical];
  const ordered = [...canonicals, ...variants].sort(
    (left, right) => Array.from(right).length - Array.from(left).length,
  );
  return { canonicals, ordered };
}

/**
 * Tries a rule's declared `match_forms` at one position and classifies what normalization the
 * match needed, per dictionary §4's *Match types* table and its `FREQ-BD-001` worked example:
 * `BD` → `exact`, `bd` → `case-insensitive`, `B.D.` and `b.d.` → `punctuation-normalized`
 * (D-027).
 *
 * A dotted form yields `punctuation-normalized` because reaching it required normalization 2,
 * which is exactly what the table says — and note that no period is ever *stripped* here: a
 * dotted form is matched whole against the declared literal, so the mechanism cannot
 * accidentally absorb a sentence-terminating period.
 *
 * Boundary validation runs per candidate length, because a valid `B.D.` and a valid `BD` end at
 * different places (dictionary §4; D-029).
 */
function matchLiteralAt(
  forms: LiteralForms,
  codePoints: readonly string[],
  start: number,
): LiteralMatch | undefined {
  for (const form of forms.ordered) {
    const length = Array.from(form).length;
    const end = start + length;
    if (end > codePoints.length) {
      continue;
    }

    const candidate = sliceByCodePoints(codePoints, start, end);
    const isMatch = candidate === form || foldAsciiCase(candidate) === foldAsciiCase(form);
    if (!isMatch || !hasTokenBoundaries(codePoints, start, end)) {
      continue;
    }

    const match_type: MatchType = form.includes('.')
      ? 'punctuation-normalized'
      : forms.canonicals.includes(candidate)
        ? 'exact'
        : 'case-insensitive';

    return { literal: candidate, length, match_type };
  }

  return undefined;
}

// ---------------------------------------------------------------------------------------------
// OD decision path: FREQ-OD-001 (once daily) / AMBIG-OD-001 (ophthalmic context) (dictionary §7.1, §7.2)
// ---------------------------------------------------------------------------------------------

/**
 * Closed list of ophthalmic context literals from dictionary §7.1.
 * Evaluated as literal presence with token boundary checking on the current line (D-012).
 */
const OPHTHALMIC_CONTEXT_LITERALS: readonly string[] = [
  'eye drop',
  'eye drops',
  'eyedrop',
  'eyedrops',
  'e/d',
  'eye ointment',
  'ophthalmic',
  'gtt',
  'gtts',
  'drop',
  'drops',
  'instil',
  'instill',
  'OS',
  'OU',
];

/** Verbatim from dictionary §7.1; `OD` is passed first because it is the canonical form. */
const OD_MATCH_FORMS = declareForms('OD', 'od', 'O.D.', 'o.d.');

/**
 * Checks whether the current line contains at least one ophthalmic context literal with token boundaries.
 * Drug names and wider clinical contexts are never consulted (dictionary §7.1; D-012).
 */
function hasOphthalmicContext(codePoints: readonly string[]): boolean {
  for (const literal of OPHTHALMIC_CONTEXT_LITERALS) {
    const foldedLiteral = foldAsciiCase(literal);
    const literalLength = Array.from(literal).length;

    let index = 0;
    while (index <= codePoints.length - literalLength) {
      const candidate = sliceByCodePoints(codePoints, index, index + literalLength);
      if (
        foldAsciiCase(candidate) === foldedLiteral &&
        hasTokenBoundaries(codePoints, index, index + literalLength)
      ) {
        return true;
      }
      index += 1;
    }
  }

  return false;
}

const OD_RULE: Rule = {
  id: 'FREQ-OD-001',
  category: 'frequency',

  find(_rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'frequency'>[] = [];
    const isOphthalmic = hasOphthalmicContext(codePoints);

    let index = 0;
    while (index < codePoints.length) {
      const found = matchLiteralAt(OD_MATCH_FORMS, codePoints, index);
      if (found === undefined) {
        index += 1;
        continue;
      }

      if (isOphthalmic) {
        // AMBIG-OD-001: ophthalmic context makes OD ambiguous between once-daily and right-eye (SI-05).
        matches.push({
          rule_id: 'AMBIG-OD-001',
          category: 'frequency',
          matched_literal: found.literal,
          source_span: { start: index, end: index + found.length },
          match_type: found.match_type,
          writes: {},
          candidate_readings: [
            { reading: 'once daily', rule_id: 'AMBIG-OD-001' },
            { reading: 'right eye', rule_id: 'AMBIG-OD-001' },
          ],
          verifier_action_required: true,
        });
      } else {
        // FREQ-OD-001: non-ophthalmic context deterministically indicates once daily.
        matches.push({
          rule_id: 'FREQ-OD-001',
          category: 'frequency',
          matched_literal: found.literal,
          source_span: { start: index, end: index + found.length },
          match_type: found.match_type,
          writes: { frequency_code: 'ONCE_DAILY', times_per_day: 1 },
        });
      }

      index += found.length;
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// FREQ-BD-001 — twice daily (dictionary §7.1)
// ---------------------------------------------------------------------------------------------

/** Verbatim from dictionary §7.1; `BD` is passed first because it is the canonical form. */
const BD_MATCH_FORMS = declareForms('BD', 'bd', 'B.D.', 'b.d.');

const FREQ_BD_001: Rule = {
  id: 'FREQ-BD-001',
  category: 'frequency',

  find(_rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'frequency'>[] = [];

    let index = 0;
    while (index < codePoints.length) {
      const found = matchLiteralAt(BD_MATCH_FORMS, codePoints, index);
      if (found === undefined) {
        index += 1;
        continue;
      }

      matches.push({
        rule_id: 'FREQ-BD-001',
        category: 'frequency',
        matched_literal: found.literal,
        source_span: { start: index, end: index + found.length },
        match_type: found.match_type,
        // Fixed by the rule, never derived from the matched text (dictionary §7.1 `Writes`).
        writes: { frequency_code: 'TWICE_DAILY', times_per_day: 2 },
      });

      // Past the match, so one occurrence can never be reported twice.
      index += found.length;
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// FREQ-TDS-001 — thrice daily (dictionary §7.1)
// ---------------------------------------------------------------------------------------------

/** Verbatim from dictionary §7.1; `TDS` is passed first because it is the canonical form. */
const TDS_MATCH_FORMS = declareForms('TDS', 'tds', 'T.D.S.', 't.d.s.');

const FREQ_TDS_001: Rule = {
  id: 'FREQ-TDS-001',
  category: 'frequency',

  find(_rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'frequency'>[] = [];

    let index = 0;
    while (index < codePoints.length) {
      const found = matchLiteralAt(TDS_MATCH_FORMS, codePoints, index);
      if (found === undefined) {
        index += 1;
        continue;
      }

      matches.push({
        rule_id: 'FREQ-TDS-001',
        category: 'frequency',
        matched_literal: found.literal,
        source_span: { start: index, end: index + found.length },
        match_type: found.match_type,
        writes: { frequency_code: 'THRICE_DAILY', times_per_day: 3 },
      });

      index += found.length;
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// FREQ-QID-001 — four times daily (dictionary §7.1)
// ---------------------------------------------------------------------------------------------

/**
 * Verbatim from dictionary §7.1. Covers both `QID` and `QDS` notations with identical clinical
 * meaning in v1. Both uppercase forms are canonical and yield `match_type: 'exact'`.
 */
const QID_MATCH_FORMS = declareForms(
  ['QID', 'QDS'],
  'qid',
  'qds',
  'Q.I.D.',
  'q.i.d.',
  'Q.D.S.',
  'q.d.s.',
);

const FREQ_QID_001: Rule = {
  id: 'FREQ-QID-001',
  category: 'frequency',

  find(_rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'frequency'>[] = [];

    let index = 0;
    while (index < codePoints.length) {
      const found = matchLiteralAt(QID_MATCH_FORMS, codePoints, index);
      if (found === undefined) {
        index += 1;
        continue;
      }

      matches.push({
        rule_id: 'FREQ-QID-001',
        category: 'frequency',
        matched_literal: found.literal,
        source_span: { start: index, end: index + found.length },
        match_type: found.match_type,
        writes: { frequency_code: 'FOUR_TIMES_DAILY', times_per_day: 4 },
      });

      index += found.length;
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// ANCH-HS-001 — bedtime circadian anchor (dictionary §7.2)
// ---------------------------------------------------------------------------------------------

/** Verbatim from dictionary §7.2; `HS` is passed first because it is the canonical form. */
const HS_MATCH_FORMS = declareForms('HS', 'hs', 'H.S.', 'h.s.');

const ANCH_HS_001: Rule = {
  id: 'ANCH-HS-001',
  category: 'circadian-anchor',

  find(_rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'circadian-anchor'>[] = [];

    let index = 0;
    while (index < codePoints.length) {
      const found = matchLiteralAt(HS_MATCH_FORMS, codePoints, index);
      if (found === undefined) {
        index += 1;
        continue;
      }

      matches.push({
        rule_id: 'ANCH-HS-001',
        category: 'circadian-anchor',
        matched_literal: found.literal,
        source_span: { start: index, end: index + found.length },
        match_type: found.match_type,
        writes: { timing_anchors: ['BEDTIME'] },
      });

      index += found.length;
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// TIME-AC-001 — before food meal timing anchor (dictionary §7.3)
// ---------------------------------------------------------------------------------------------

/** Verbatim from dictionary §7.3; covers `ac`, `AC`, `a.c.`, `A.C.`. */
const AC_MATCH_FORMS = declareForms(['ac', 'AC'], 'a.c.', 'A.C.');

const TIME_AC_001: Rule = {
  id: 'TIME-AC-001',
  category: 'meal-timing',

  find(_rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'meal-timing'>[] = [];

    let index = 0;
    while (index < codePoints.length) {
      const found = matchLiteralAt(AC_MATCH_FORMS, codePoints, index);
      if (found === undefined) {
        index += 1;
        continue;
      }

      matches.push({
        rule_id: 'TIME-AC-001',
        category: 'meal-timing',
        matched_literal: found.literal,
        source_span: { start: index, end: index + found.length },
        match_type: found.match_type,
        writes: { timing_anchors: ['BEFORE_MEAL'] },
      });

      index += found.length;
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// TIME-PC-001 — after food meal timing anchor (dictionary §7.3)
// ---------------------------------------------------------------------------------------------

/** Verbatim from dictionary §7.3; covers `pc`, `PC`, `p.c.`, `P.C.`. */
const PC_MATCH_FORMS = declareForms(['pc', 'PC'], 'p.c.', 'P.C.');

const TIME_PC_001: Rule = {
  id: 'TIME-PC-001',
  category: 'meal-timing',

  find(_rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'meal-timing'>[] = [];

    let index = 0;
    while (index < codePoints.length) {
      const found = matchLiteralAt(PC_MATCH_FORMS, codePoints, index);
      if (found === undefined) {
        index += 1;
        continue;
      }

      matches.push({
        rule_id: 'TIME-PC-001',
        category: 'meal-timing',
        matched_literal: found.literal,
        source_span: { start: index, end: index + found.length },
        match_type: found.match_type,
        writes: { timing_anchors: ['AFTER_MEAL'] },
      });

      index += found.length;
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// COND-SOS-001 — SOS conditional use (dictionary §7.4)
// ---------------------------------------------------------------------------------------------

/** Verbatim from dictionary §7.4; `SOS` is passed first because it is the canonical form. */
const SOS_MATCH_FORMS = declareForms('SOS', 'sos', 'S.O.S.', 's.o.s.');

const COND_SOS_001: Rule = {
  id: 'COND-SOS-001',
  category: 'conditional-use',

  find(_rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'conditional-use'>[] = [];

    let index = 0;
    while (index < codePoints.length) {
      const found = matchLiteralAt(SOS_MATCH_FORMS, codePoints, index);
      if (found === undefined) {
        index += 1;
        continue;
      }

      matches.push({
        rule_id: 'COND-SOS-001',
        category: 'conditional-use',
        matched_literal: found.literal,
        source_span: { start: index, end: index + found.length },
        match_type: found.match_type,
        writes: {
          as_needed: true,
          schedule_derivable: false,
        },
        verifier_action_required: true,
      });

      index += found.length;
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// COND-PRN-001 — PRN conditional use (dictionary §7.4)
// ---------------------------------------------------------------------------------------------

/** Verbatim from dictionary §7.4; `PRN` is passed first because it is the canonical form. */
const PRN_MATCH_FORMS = declareForms('PRN', 'prn', 'P.R.N.', 'p.r.n.');

const COND_PRN_001: Rule = {
  id: 'COND-PRN-001',
  category: 'conditional-use',

  find(_rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'conditional-use'>[] = [];

    let index = 0;
    while (index < codePoints.length) {
      const found = matchLiteralAt(PRN_MATCH_FORMS, codePoints, index);
      if (found === undefined) {
        index += 1;
        continue;
      }

      matches.push({
        rule_id: 'COND-PRN-001',
        category: 'conditional-use',
        matched_literal: found.literal,
        source_span: { start: index, end: index + found.length },
        match_type: found.match_type,
        writes: {
          as_needed: true,
          schedule_derivable: false,
        },
        verifier_action_required: true,
      });

      index += found.length;
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// DOSE-STAT-001 — single immediate dose (dictionary §7.5)
// ---------------------------------------------------------------------------------------------

/** Verbatim from dictionary §7.5; `stat` and `STAT` are declared canonical. */
const STAT_MATCH_FORMS = declareForms(['stat', 'STAT'], 'Stat');

const DOSE_STAT_001: Rule = {
  id: 'DOSE-STAT-001',
  category: 'single-dose',

  find(_rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'single-dose'>[] = [];

    let index = 0;
    while (index < codePoints.length) {
      const found = matchLiteralAt(STAT_MATCH_FORMS, codePoints, index);
      if (found === undefined) {
        index += 1;
        continue;
      }

      matches.push({
        rule_id: 'DOSE-STAT-001',
        category: 'single-dose',
        matched_literal: found.literal,
        source_span: { start: index, end: index + found.length },
        match_type: found.match_type,
        writes: {
          total_doses: 1,
          recurring: false,
          immediate: true,
          schedule_derivable: false,
        },
      });

      index += found.length;
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// AMT-TAB-001 — whole tablet counts (dictionary §7.6)
// ---------------------------------------------------------------------------------------------

/**
 * "integer immediately followed by a tablet unit literal: `tab`, `tabs`, `tablet`, `tablets`"
 * (dictionary §7.6).
 *
 * Kept as a source string so a fresh RegExp is built per call for purity (§3).
 * Requires whitespace `[ \t]+` between count and unit literal per dictionary examples and
 * boundary rules. `\d+` matches integer counts only (fractions are handled by AMT-FRAC-001).
 * Alternation is longest-first (`tablets?|tabs?`) so `tablet` is never prematurely read as `tab`.
 */
const TABLET_AMOUNT_PATTERN = '(\\d+)[ \\t]+(tablets?|tabs?)';

const AMT_TAB_001: Rule = {
  id: 'AMT-TAB-001',
  category: 'dose-amount',

  find(rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'dose-amount'>[] = [];
    const pattern = new RegExp(TABLET_AMOUNT_PATTERN, 'giu');

    for (const found of rawOcrText.matchAll(pattern)) {
      const [literal, numberText, unitText] = found;
      if (found.index === undefined || numberText === undefined || unitText === undefined) {
        continue;
      }

      // Regex indices are UTF-16 code units; `source_span` is code points (§5.1; D-023).
      const start = utf16ToCodePointIndex(rawOcrText, found.index);
      const end = start + Array.from(literal).length;

      // Whole-unit matching: rejects trailing chars (e.g. `tablespoon`) or invalid prefixes.
      if (!hasTokenBoundaries(codePoints, start, end)) {
        continue;
      }

      matches.push({
        rule_id: 'AMT-TAB-001',
        category: 'dose-amount',
        matched_literal: sliceByCodePoints(codePoints, start, end),
        source_span: { start, end },
        match_type: 'regex', // Pattern rules always record `regex`, whatever the case (§4; D-027).
        writes: {
          dose_amount: { kind: 'integer', value: Number(numberText) },
          dose_unit: 'tablet',
        },
      });
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// AMT-FRAC-001 — tablet fractions (dictionary §7.6)
// ---------------------------------------------------------------------------------------------

/**
 * "a fraction literal `1/2`, `½`, `1/4`, `¼` followed by a tablet unit literal" (dictionary §7.6).
 *
 * Supported fractional literals are `1/2`, `½`, `1/4`, and `¼` (API_CONTRACTS.md §7).
 * Floating-point numbers are prohibited in dose_amount (D-024).
 * Alternation is longest-first so `tablet` is never prematurely read as `tab`.
 */
const TABLET_FRACTION_PATTERN = '(1/2|1/4|½|¼)[ \\t]+(tablets?|tabs?)';

const FRACTION_AMOUNTS: Readonly<Record<string, { numerator: number; denominator: number }>> = {
  '1/2': { numerator: 1, denominator: 2 },
  '½': { numerator: 1, denominator: 2 },
  '1/4': { numerator: 1, denominator: 4 },
  '¼': { numerator: 1, denominator: 4 },
};

const AMT_FRAC_001: Rule = {
  id: 'AMT-FRAC-001',
  category: 'dose-amount',

  find(rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'dose-amount'>[] = [];
    const pattern = new RegExp(TABLET_FRACTION_PATTERN, 'giu');

    for (const found of rawOcrText.matchAll(pattern)) {
      const [literal, fractionText, unitText] = found;
      if (found.index === undefined || fractionText === undefined || unitText === undefined) {
        continue;
      }

      // Regex indices are UTF-16 code units; `source_span` is code points (§5.1; D-023).
      const start = utf16ToCodePointIndex(rawOcrText, found.index);
      const end = start + Array.from(literal).length;

      // Whole-unit matching: rejects trailing chars (e.g. `tablespoon`) or invalid prefixes.
      if (!hasTokenBoundaries(codePoints, start, end)) {
        continue;
      }

      const fraction = FRACTION_AMOUNTS[fractionText];
      if (fraction === undefined) {
        continue;
      }

      matches.push({
        rule_id: 'AMT-FRAC-001',
        category: 'dose-amount',
        matched_literal: sliceByCodePoints(codePoints, start, end),
        source_span: { start, end },
        match_type: 'regex', // Pattern rules always record `regex`, whatever the case (§4; D-027).
        writes: {
          dose_amount: {
            kind: 'fraction',
            numerator: fraction.numerator,
            denominator: fraction.denominator,
          },
          dose_unit: 'tablet',
        },
      });
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// AMT-VOL-001 — millilitre volumes (dictionary §7.6)
// ---------------------------------------------------------------------------------------------

/**
 * "number (integer or decimal) followed by `ml` or `mL`" (dictionary §7.6).
 *
 * Supported units are `ml` and `mL` (API_CONTRACTS.md §7; DoseUnit enum).
 * Exact integer volumes are represented as `{ kind: 'integer', value: n }` (D-024).
 * Spaced (`5 ml`) and attached (`5ml`) forms are both supported.
 */
const VOLUME_AMOUNT_PATTERN = '(\\d+)[ \\t]*(ml|mL)';

const AMT_VOL_001: Rule = {
  id: 'AMT-VOL-001',
  category: 'dose-amount',

  find(rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'dose-amount'>[] = [];
    const pattern = new RegExp(VOLUME_AMOUNT_PATTERN, 'gu');

    for (const found of rawOcrText.matchAll(pattern)) {
      const [literal, numberText, _unitText] = found;
      if (found.index === undefined || numberText === undefined) {
        continue;
      }

      // Regex indices are UTF-16 code units; `source_span` is code points (§5.1; D-023).
      const start = utf16ToCodePointIndex(rawOcrText, found.index);
      const end = start + Array.from(literal).length;

      // Whole-unit matching: rejects trailing chars (e.g. `5 mls` or `5 tablespoon`) or invalid prefixes.
      // Crucially, '/' in '125mg/5ml' is not in BOUNDARY_CHARACTERS, so '5ml' in concentration is rejected.
      if (!hasTokenBoundaries(codePoints, start, end)) {
        continue;
      }

      matches.push({
        rule_id: 'AMT-VOL-001',
        category: 'dose-amount',
        matched_literal: sliceByCodePoints(codePoints, start, end),
        source_span: { start, end },
        match_type: 'regex',
        writes: {
          dose_amount: { kind: 'integer', value: Number(numberText) },
          dose_unit: 'ml',
        },
      });
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// STR-MASS-001 — mass strengths (dictionary §7.7)
// ---------------------------------------------------------------------------------------------

/**
 * "number (integer or decimal) followed by `mg`, `mcg`, or `g`" (dictionary §7.7).
 *
 * Kept as a source string so a **fresh** `RegExp` is built per call: a shared global regex
 * carries `lastIndex` between calls, which would make the parser's output depend on its own
 * history. Purity is a contract term (§3).
 *
 * Details that matter: the alternation is longest-first so `mcg` is never read as `mg` or `g`;
 * the separator is `[ \t]*` rather than `\s*` so a strength cannot span a line break, and
 * optional so `500mg` matches as well as `500 mg` (§7.7 test expectations); `\d` under `u` is
 * ASCII-only, so no rule claims Devanagari digits — correct, since none is declared for them.
 */
const MASS_STRENGTH_PATTERN = '(\\d+(?:\\.\\d+)?)[ \\t]*(mcg|mg|g)';

/** The same three units as the alternation above; kept adjacent so they cannot drift apart. */
const MASS_UNITS: Readonly<Record<string, DoseStrengthUnit>> = { mcg: 'mcg', mg: 'mg', g: 'g' };

const STR_MASS_001: Rule = {
  id: 'STR-MASS-001',
  category: 'strength',

  find(rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'strength'>[] = [];
    const pattern = new RegExp(MASS_STRENGTH_PATTERN, 'giu');

    for (const found of rawOcrText.matchAll(pattern)) {
      const [literal, numberText, unitText] = found;
      if (found.index === undefined || numberText === undefined || unitText === undefined) {
        continue;
      }

      // Regex indices are UTF-16 code units; `source_span` is code points (§5.1; D-023).
      const start = utf16ToCodePointIndex(rawOcrText, found.index);
      const end = start + Array.from(literal).length;

      // Whole-unit matching: this is what stops the `g` in `50 mcg` standing alone and what
      // rejects `x50 mcg` outright rather than matching part of it (dictionary §4, §7.7).
      if (!hasTokenBoundaries(codePoints, start, end)) {
        continue;
      }

      matches.push({
        rule_id: 'STR-MASS-001',
        category: 'strength',
        matched_literal: sliceByCodePoints(codePoints, start, end),
        source_span: { start, end },
        match_type: 'regex', // Pattern rules always record `regex`, whatever the case (§4; D-027).
        writes: {
          // A strength may be decimal (§7.7). D-024's prohibition on float representation
          // governs `dose_amount`, which this rule may not write and never computes.
          dose_strength_value: Number(numberText),
          dose_strength_unit: MASS_UNITS[foldAsciiCase(unitText)],
        },
      });
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// DUR-DAYS-001 — day forms (dictionary §7.8)
// ---------------------------------------------------------------------------------------------

/**
 * "x N days, × N days, for N days, x N d, N/7" (dictionary §7.8).
 *
 * Kept as a source string so a fresh RegExp is built per call for purity (§3).
 * Captures either:
 *   - optional prefix `(x|X|×|for)` + integer + unit `(days?|d)`
 *   - slash form `(\d+)/7`
 */
const DAY_DURATION_PATTERN =
  '(?:(?:[xX×]|for)[ \\t]+)?(\\d+)[ \\t]*(days?)|(?:[xX×]|for)[ \\t]*(\\d+)[ \\t]*(d)|(\\d+)\\/7';

const DUR_DAYS_001: Rule = {
  id: 'DUR-DAYS-001',
  category: 'duration',

  find(rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'duration'>[] = [];
    const regex = new RegExp(DAY_DURATION_PATTERN, 'gi');

    let match: RegExpExecArray | null;
    while ((match = regex.exec(rawOcrText)) !== null) {
      const matchedLiteral = match[0];
      const utf16Index = match.index;
      const startCodePoint = utf16ToCodePointIndex(rawOcrText, utf16Index);
      const endCodePoint = utf16ToCodePointIndex(rawOcrText, utf16Index + matchedLiteral.length);

      if (!hasTokenBoundaries(codePoints, startCodePoint, endCodePoint)) {
        continue;
      }

      const slashValue = match[5];
      const abbrevValue = match[3];
      const standardValue = match[1];
      const count = Number(slashValue ?? abbrevValue ?? standardValue);

      matches.push({
        rule_id: 'DUR-DAYS-001',
        category: 'duration',
        matched_literal: matchedLiteral,
        source_span: { start: startCodePoint, end: endCodePoint },
        match_type: 'regex',
        writes: {
          duration_value: count,
          duration_unit: 'day',
        },
      });
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// DUR-WEEKS-001 — week forms (dictionary §7.8)
// ---------------------------------------------------------------------------------------------

/**
 * "x N weeks, × N weeks, for N weeks, x N wks, N/52" (dictionary §7.8).
 *
 * Kept as a source string so a fresh RegExp is built per call for purity (§3).
 * Captures either:
 *   - optional prefix `(x|X|×|for)` + integer + unit `(weeks?)`
 *   - required prefix `(x|X|×|for)` + integer + unit `(wks?|wk)`
 *   - slash form `(\d+)/52`
 */
const WEEK_DURATION_PATTERN =
  '(?:(?:[xX×]|for)[ \\t]+)?(\\d+)[ \\t]*(weeks?)|(?:[xX×]|for)[ \\t]*(\\d+)[ \\t]*(wks?|wk)|(\\d+)\\/52';

const DUR_WEEKS_001: Rule = {
  id: 'DUR-WEEKS-001',
  category: 'duration',

  find(rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'duration'>[] = [];
    const regex = new RegExp(WEEK_DURATION_PATTERN, 'gi');

    let match: RegExpExecArray | null;
    while ((match = regex.exec(rawOcrText)) !== null) {
      const matchedLiteral = match[0];
      const utf16Index = match.index;
      const startCodePoint = utf16ToCodePointIndex(rawOcrText, utf16Index);
      const endCodePoint = utf16ToCodePointIndex(rawOcrText, utf16Index + matchedLiteral.length);

      if (!hasTokenBoundaries(codePoints, startCodePoint, endCodePoint)) {
        continue;
      }

      const slashValue = match[5];
      const abbrevValue = match[3];
      const standardValue = match[1];
      const count = Number(slashValue ?? abbrevValue ?? standardValue);

      matches.push({
        rule_id: 'DUR-WEEKS-001',
        category: 'duration',
        matched_literal: matchedLiteral,
        source_span: { start: startCodePoint, end: endCodePoint },
        match_type: 'regex',
        writes: {
          duration_value: count,
          duration_unit: 'week',
        },
      });
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// DUR-BARE-001 — bare duration, no unit (dictionary §7.8)
// ---------------------------------------------------------------------------------------------

/**
 * "x N or × N with no unit literal following" (dictionary §7.8).
 *
 * Kept as a source string so a fresh RegExp is built per call for purity (§3).
 * Uses negative lookahead to ensure the count is not followed by any recognized unit literal
 * or slash duration notation (/7, /52).
 */
const BARE_DURATION_PATTERN =
  '(?:[xX×])[ \\t]*(\\d+)(?![ \\t]*(?:days?|d|weeks?|wks?|wk|tablets?|tabs?|ml|mL|mg|mcg|g|\\/7|\\/52)(?![a-zA-Z0-9]))';

const DUR_BARE_001: Rule = {
  id: 'DUR-BARE-001',
  category: 'duration',

  find(rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'duration'>[] = [];
    const regex = new RegExp(BARE_DURATION_PATTERN, 'gi');

    let match: RegExpExecArray | null;
    while ((match = regex.exec(rawOcrText)) !== null) {
      const matchedLiteral = match[0];
      const utf16Index = match.index;
      const startCodePoint = utf16ToCodePointIndex(rawOcrText, utf16Index);
      const endCodePoint = utf16ToCodePointIndex(rawOcrText, utf16Index + matchedLiteral.length);

      if (!hasTokenBoundaries(codePoints, startCodePoint, endCodePoint)) {
        continue;
      }

      const count = match[1];

      matches.push({
        rule_id: 'DUR-BARE-001',
        category: 'duration',
        matched_literal: matchedLiteral,
        source_span: { start: startCodePoint, end: endCodePoint },
        match_type: 'regex',
        writes: {},
        candidate_readings: [
          { reading: `${count} days`, rule_id: 'DUR-BARE-001' },
          { reading: `${count} weeks`, rule_id: 'DUR-BARE-001' },
          { reading: `${count} doses total`, rule_id: 'DUR-BARE-001' },
        ],
        verifier_action_required: true,
      });
    }

    return matches;
  },
};

// ---------------------------------------------------------------------------------------------
// DUR-CONTINUOUS-001 — continuous / lifelong wording (dictionary §7.8)
// ---------------------------------------------------------------------------------------------

/** Verbatim from dictionary §7.8; `continue` etc. are declared forms. */
const CONTINUOUS_MATCH_FORMS = declareForms(
  ['continue', 'to continue', 'continuous', 'lifelong', 'life long'],
  'Continue',
  'To Continue',
  'Continuous',
  'Lifelong',
  'Life Long',
);

const DUR_CONTINUOUS_001: Rule = {
  id: 'DUR-CONTINUOUS-001',
  category: 'duration',

  find(_rawOcrText: string, codePoints: readonly string[]): AnyRuleMatch[] {
    const matches: RuleMatch<'duration'>[] = [];

    let index = 0;
    while (index < codePoints.length) {
      const found = matchLiteralAt(CONTINUOUS_MATCH_FORMS, codePoints, index);
      if (found === undefined) {
        index += 1;
        continue;
      }

      matches.push({
        rule_id: 'DUR-CONTINUOUS-001',
        category: 'duration',
        matched_literal: found.literal,
        source_span: { start: index, end: index + found.length },
        match_type: found.match_type,
        writes: {},
        candidate_readings: [
          { reading: 'indefinite ongoing use', rule_id: 'DUR-CONTINUOUS-001' },
          { reading: 'continue until next review', rule_id: 'DUR-CONTINUOUS-001' },
        ],
        verifier_action_required: true,
      });

      index += found.length;
    }

    return matches;
  },
};

/** Scanned in dictionary §7 order, so output ordering is deterministic. */
export const RULES: readonly Rule[] = [
  OD_RULE,
  FREQ_BD_001,
  FREQ_TDS_001,
  FREQ_QID_001,
  ANCH_HS_001,
  TIME_AC_001,
  TIME_PC_001,
  COND_SOS_001,
  COND_PRN_001,
  DOSE_STAT_001,
  AMT_TAB_001,
  AMT_FRAC_001,
  AMT_VOL_001,
  STR_MASS_001,
  DUR_DAYS_001,
  DUR_WEEKS_001,
  DUR_BARE_001,
  DUR_CONTINUOUS_001,
];

/**
 * Categories whose match makes a line **instruction-bearing** — one the patient is meant to act
 * on — which is the precondition for reporting `dose_amount` missing (dictionary §9).
 *
 * Dictionary §9 names four: `frequency`, `meal-timing`, `circadian-anchor` and
 * `conditional-use`. All four are now implemented.
 */
export const INSTRUCTION_BEARING_CATEGORIES: readonly RuleCategory[] = [
  'frequency',
  'circadian-anchor',
  'meal-timing',
  'conditional-use',
];
