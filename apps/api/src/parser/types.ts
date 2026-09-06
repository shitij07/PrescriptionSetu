/**
 * Contract types for the deterministic shorthand parser.
 *
 * Transcribed by hand from `docs/API_CONTRACTS.md` §4 (output contract), §5 (provenance),
 * §6.4 (missing fields) and §7 (exact amounts), which hold authority over the parser's
 * interface, payload and types (D-028). Nothing here is invented: every field name, value
 * domain and nullability below is stated in that document, which in turn reproduces the
 * dictionary's field reference (`docs/SHORTHAND_DICTIONARY.md` §2) and matches the
 * `medications` column names in `docs/SCHEMA.md` §2.5.
 *
 * Two contract properties are expressed in the type system rather than left to convention:
 *
 * 1. Every effective clinical field is `T | null` and **not** optional. A field no rule wrote
 *    is present and `null`, because `null` carries information — *the prescription did not
 *    say* (§4.4). An optional field would let "absent" and "not stated" collapse into each
 *    other, and a consumer that cannot tell them apart is a consumer that can invent a
 *    default.
 *
 * 2. `schedule_derivable` is typed `false | null`, never `true`. No rule in dictionary
 *    version 0.1.0 can raise it, and consumers must require `=== true` before generating any
 *    schedule (§4.7, discovered gap #3). The type makes the fail-safe reading unwritable
 *    rather than merely undocumented.
 *
 * Fields that are **structurally absent** from parser output are absent here too — not
 * present and null. `max_doses_per_day` and `min_interval_hours` (SI-08), `drug_name`
 * (discovered gap #1), any clock time, `tier`, `canonical_expansion`, and any confidence
 * score or probability all fall under §4.6. A future rule cannot populate them without a
 * visible change to this file and to the contract.
 */

/**
 * The 19 rule IDs the dictionary defines (`API_CONTRACTS.md` §12.2; dictionary §7).
 * Rule IDs are unique (dictionary §11 invariant 1).
 */
export type RuleId =
  | 'FREQ-OD-001'
  | 'AMBIG-OD-001'
  | 'FREQ-BD-001'
  | 'FREQ-TDS-001'
  | 'FREQ-QID-001'
  | 'ANCH-HS-001'
  | 'TIME-AC-001'
  | 'TIME-PC-001'
  | 'COND-SOS-001'
  | 'COND-PRN-001'
  | 'DOSE-STAT-001'
  | 'AMT-TAB-001'
  | 'AMT-FRAC-001'
  | 'AMT-VOL-001'
  | 'STR-MASS-001'
  | 'DUR-DAYS-001'
  | 'DUR-WEEKS-001'
  | 'DUR-BARE-001'
  | 'DUR-CONTINUOUS-001';

export type FrequencyCode = 'ONCE_DAILY' | 'TWICE_DAILY' | 'THRICE_DAILY' | 'FOUR_TIMES_DAILY';

export type TimingAnchor = 'BEDTIME' | 'BEFORE_MEAL' | 'AFTER_MEAL';

export type DoseUnit = 'tablet' | 'ml';

export type DoseStrengthUnit = 'mg' | 'mcg' | 'g';

export type DurationUnit = 'day' | 'week';

/**
 * A quantity per administration, held exactly. Floating-point representation is prohibited:
 * `½` is `{ kind: 'fraction', numerator: 1, denominator: 2 }` and never `0.5` (§7; D-024).
 */
export type DoseAmount =
  | { kind: 'integer'; value: number }
  | { kind: 'fraction'; numerator: number; denominator: number };

/**
 * The normalization *this particular match* required — a fact about the matched text, not
 * about the rule (§5; D-027). One rule yields different values on different input.
 */
export type MatchType = 'exact' | 'case-insensitive' | 'punctuation-normalized' | 'regex';

/**
 * A half-open interval `[start, end)` measured in **Unicode code points** over the exact
 * input string (§5.1; D-023). JavaScript's native string indexing, `length`, `slice`,
 * `substring` and `charAt` operate on UTF-16 code units and are therefore NOT this unit.
 */
export interface SourceSpan {
  start: number;
  end: number;
}

/**
 * Provenance for one rule firing: **exactly five fields** (§5; dictionary §5; SI-04).
 * Not four, not six — no `tier` and no `canonical_expansion` (§5.4; D-022).
 */
export interface MatchRecord {
  rule_id: RuleId;
  /** Pinned by the parser build, not a parameter and not read from the environment (§3.5). */
  dictionary_version: string;
  /** The source text the span covers, as it appears in the input; never the canonical form. */
  matched_literal: string;
  source_span: SourceSpan;
  match_type: MatchType;
}

/**
 * The 16 effective clinical fields (§4.3). Every one may be `null`; none has a default.
 */
export interface EffectiveClinicalFields {
  frequency_code: FrequencyCode | null;
  /** Integer 1–4 (§4.3). */
  times_per_day: 1 | 2 | 3 | 4 | null;
  /** Anchors accumulate rather than replace (dictionary §8 rule 4). */
  timing_anchors: TimingAnchor[] | null;
  dose_amount: DoseAmount | null;
  dose_unit: DoseUnit | null;
  dose_strength_value: number | null;
  dose_strength_unit: DoseStrengthUnit | null;
  duration_value: number | null;
  /** Reported as matched; weeks are not normalised to days (dictionary §7.8). */
  duration_unit: DurationUnit | null;
  duration_indefinite: boolean | null;
  as_needed: boolean | null;
  total_doses: number | null;
  recurring: boolean | null;
  immediate: boolean | null;
  /** Fail-safe: only ever lowered, never `true` in dictionary 0.1.0 (§4.7). */
  schedule_derivable: false | null;
  /** Sticky: once `true`, nothing clears it (§4.8). */
  verifier_action_required: boolean | null;
}

export type EffectiveFieldName = keyof EffectiveClinicalFields;

/**
 * The SI-08 ceiling fields are absent from output, but may be *named* by a `missing_fields`
 * entry with reason `requires_verifier_entry` — a report that a human must supply the value,
 * not a slot the parser could fill (§4.6).
 */
export type MissingFieldName = EffectiveFieldName | 'max_doses_per_day' | 'min_interval_hours';

/** Exactly the two dictionary-defined reason codes (§6.4; dictionary §9). */
export type MissingFieldReason = 'absent_from_prescription' | 'requires_verifier_entry';

export interface MissingField {
  field: MissingFieldName;
  reason: MissingFieldReason;
}

/** One of several supported readings of an ambiguous token; the parser chooses none (§6.1). */
export interface CandidateReading {
  reading: string;
  rule_id: RuleId;
}

/** Text the dictionary does not cover, preserved rather than repaired or dropped (§6.3). */
export interface UnparsedFragment {
  text: string;
  source_span: SourceSpan;
}

/**
 * Provenance per *written* field, not per medication (dictionary §8 rule 3). A field that is
 * `null` has no entry: absence of an entry carries the same information as `null` (§5.3).
 * Each record is self-contained and repeats all five fields rather than referring into
 * `matches`.
 */
export interface FieldProvenance {
  frequency_code?: MatchRecord;
  times_per_day?: MatchRecord;
  /** Provenance is per array element — one record per contributed anchor (§5.3). */
  timing_anchors?: MatchRecord[];
  dose_amount?: MatchRecord;
  dose_unit?: MatchRecord;
  dose_strength_value?: MatchRecord;
  dose_strength_unit?: MatchRecord;
  duration_value?: MatchRecord;
  duration_unit?: MatchRecord;
  duration_indefinite?: MatchRecord;
  as_needed?: MatchRecord;
  total_doses?: MatchRecord;
  recurring?: MatchRecord;
  immediate?: MatchRecord;
  schedule_derivable?: MatchRecord;
  verifier_action_required?: MatchRecord;
}

/**
 * One medication line. Self-contained: it carries its own effective values, reporting arrays
 * and complete provenance, with no pointer into any other candidate and no reliance on the
 * envelope. That is the property which makes it storable verbatim in
 * `medications.parse_result` (§4.2, §10.1).
 */
export interface MedicationCandidate extends EffectiveClinicalFields {
  candidate_readings: CandidateReading[];
  missing_fields: MissingField[];
  /** Unattributed text *inside* this recognised medication line (§4.2). */
  unparsed_fragments: UnparsedFragment[];
  /** Every rule that fired, **including matches that wrote no field** (§5.2). */
  matches: MatchRecord[];
  field_provenance: FieldProvenance;
}

/**
 * The envelope. An empty `candidates` list is a successful result meaning "no medication line
 * was recognised" — not a failure (§9.2).
 */
export interface ParseResult {
  candidates: MedicationCandidate[];
  /**
   * Text attributable to no medication candidate at all. Reported rather than dropped
   * (SI-06), but with **no defined storage location today** — discovered gap #2 (§4.1.1,
   * §14.2). It must not be discarded to make persistence succeed.
   */
  unparsed_fragments?: UnparsedFragment[];
}
