/**
 * Deterministic shorthand parser — entry point.
 *
 * Given raw OCR text, this returns what the dictionary can *attribute*, with provenance for
 * every field it writes. It decides nothing clinical. Its output is an input to human
 * verification, never a substitute for it (`AGENTS.md` §2; SI-01).
 *
 * The contract it is held to:
 *
 *   - One required argument, no options object (§3.1; D-028). The dictionary version is pinned
 *     at build time and is not a parameter (§3.5).
 *   - **No logging of any kind** — not raw OCR text, not drug names, not record IDs, not at
 *     debug level (§3.6; SI-16; `AGENTS.md` §8). There is no logger in this module.
 *   - Pure and deterministic: the same string yields an equal result on every call, and the
 *     input string is never mutated (§3; §12.4). Nothing is cached between calls.
 *   - It may throw **only** for an input-contract violation: `rawOcrText` not being a string
 *     (§9.3). Unrecognised, malformed or empty text is a *successful* parse reporting little
 *     or nothing (§9.2) — never an exception, because a thrown error loses the fragments the
 *     verifier needs to see.
 *   - No thrown error may carry OCR text, a drug name or any fragment of the input (§9.4). The
 *     message below is a fixed string for exactly that reason.
 *
 * **What this slice does not do.** Two rules of nineteen are implemented (see `rules.ts`).
 * Unparsed-fragment reporting (§6.3; dictionary §10; SI-06) is not implemented yet, so
 * `Metformin` in `Metformin 500 mg BD` is neither attributed nor reported. Nothing is
 * destroyed — the parser is pure and the caller still holds the original text — but nothing is
 * reported either, and that debt is recorded in `HANDOFF.md`.
 */

import { INSTRUCTION_BEARING_CATEGORIES, RULES, DICTIONARY_VERSION } from './rules';
import type { AnyRuleMatch, WritableFieldName } from './rules';
import { extractUnparsedFragments, sliceByCodePoints, toCodePoints } from './text';
import type { MatchRecord, MedicationCandidate, ParseResult, UnparsedFragment } from './types';

interface LineSegment {
  start: number;
  end: number;
  rawText: string;
  codePoints: string[];
}

/**
 * Splits Unicode code points into line segments, recording global code-point offsets (API_CONTRACTS.md §5.1).
 * Supports LF (\n), CRLF (\r\n), and legacy CR (\r).
 */
function segmentLines(codePoints: readonly string[]): LineSegment[] {
  const lines: LineSegment[] = [];
  let lineStart = 0;
  let i = 0;

  while (i < codePoints.length) {
    const cp = codePoints[i];
    if (cp === '\r') {
      const nextIsLf = i + 1 < codePoints.length && codePoints[i + 1] === '\n';
      const lineEnd = i;
      lines.push({
        start: lineStart,
        end: lineEnd,
        rawText: sliceByCodePoints(codePoints, lineStart, lineEnd),
        codePoints: codePoints.slice(lineStart, lineEnd),
      });
      i = nextIsLf ? i + 2 : i + 1;
      lineStart = i;
    } else if (cp === '\n') {
      const lineEnd = i;
      lines.push({
        start: lineStart,
        end: lineEnd,
        rawText: sliceByCodePoints(codePoints, lineStart, lineEnd),
        codePoints: codePoints.slice(lineStart, lineEnd),
      });
      i += 1;
      lineStart = i;
    } else {
      i += 1;
    }
  }

  if (lineStart <= codePoints.length) {
    lines.push({
      start: lineStart,
      end: codePoints.length,
      rawText: sliceByCodePoints(codePoints, lineStart, codePoints.length),
      codePoints: codePoints.slice(lineStart, codePoints.length),
    });
  }

  return lines;
}

/**
 * Parses raw OCR text into structured medication candidates (MASTERPLAN §18.3; API_CONTRACTS.md §4).
 *
 * @param rawOcrText Text as produced by OCR, read but never modified.
 * @returns Candidates plus anything the dictionary could not attribute.
 * @throws {TypeError} If `rawOcrText` is not a string — a call-site programming error (§9.3).
 */
export function parse(rawOcrText: string): ParseResult {
  if (typeof rawOcrText !== 'string') {
    throw new TypeError('rawOcrText must be a string');
  }

  const codePoints = toCodePoints(rawOcrText);
  const lineSegments = segmentLines(codePoints);

  const candidates: MedicationCandidate[] = [];
  const envelopeUnparsedFragments: UnparsedFragment[] = [];

  for (const line of lineSegments) {
    // Skip empty or pure-whitespace lines
    if (line.codePoints.length === 0 || line.codePoints.every((cp) => /\s/u.test(cp))) {
      continue;
    }

    const localMatches: AnyRuleMatch[] = [];
    for (const rule of RULES) {
      localMatches.push(...rule.find(line.rawText, line.codePoints));
    }

    if (localMatches.length > 0) {
      // Map local match source spans to global code-point offsets
      const globalMatches: AnyRuleMatch[] = localMatches.map((m) => ({
        ...m,
        source_span: {
          start: line.start + m.source_span.start,
          end: line.start + m.source_span.end,
        },
      }));

      const candidate = assembleCandidate(globalMatches);

      // Extract candidate-level unparsed fragments for this line with global spans
      const localFragments = extractUnparsedFragments(line.codePoints, localMatches);
      candidate.unparsed_fragments = localFragments.map((f) => ({
        text: f.text,
        source_span: {
          start: line.start + f.source_span.start,
          end: line.start + f.source_span.end,
        },
      }));

      reportMissingFields(candidate, globalMatches);
      candidates.push(candidate);
    } else {
      // No rule matched on this non-blank line -> envelope unparsed fragment
      const lineFragments = extractUnparsedFragments(line.codePoints, []);
      for (const f of lineFragments) {
        envelopeUnparsedFragments.push({
          text: f.text,
          source_span: {
            start: line.start + f.source_span.start,
            end: line.start + f.source_span.end,
          },
        });
      }
    }
  }

  return {
    candidates,
    ...(envelopeUnparsedFragments.length > 0
      ? { unparsed_fragments: envelopeUnparsedFragments }
      : {}),
  };
}

/**
 * Returns canonical expansion / human-readable string for contradiction candidate readings.
 */
function getCanonicalReading(match: AnyRuleMatch): string {
  switch (match.rule_id) {
    case 'FREQ-OD-001':
      return 'once daily';
    case 'FREQ-BD-001':
      return 'twice daily';
    case 'FREQ-TDS-001':
      return 'three times daily';
    case 'FREQ-QID-001':
      return 'four times daily';
    default:
      return match.matched_literal;
  }
}

/**
 * A candidate before any rule has written to it: every effective field `null`, every reporting
 * array empty, no provenance.
 *
 * `null` is not a placeholder for "unknown, probably the usual value" — it means *the
 * prescription did not say*, and it stays `null` unless a rule matched text that says otherwise
 * (§4.4 "no defaults, ever"). `timing_anchors` starts `null` rather than `[]` for the same
 * reason: an empty array would assert that timing was considered and found absent.
 *
 * `schedule_derivable` starts `null` and is never assigned again anywhere in this module. No
 * rule in dictionary 0.1.0 can raise it, and the type forbids `true` outright (§4.7, gap #3).
 */
function emptyCandidate(): MedicationCandidate {
  return {
    frequency_code: null,
    times_per_day: null,
    timing_anchors: null,
    dose_amount: null,
    dose_unit: null,
    dose_strength_value: null,
    dose_strength_unit: null,
    duration_value: null,
    duration_unit: null,
    duration_indefinite: null,
    as_needed: null,
    total_doses: null,
    recurring: null,
    immediate: null,
    schedule_derivable: null,
    verifier_action_required: null,
    candidate_readings: [],
    missing_fields: [],
    unparsed_fragments: [],
    matches: [],
    field_provenance: {},
  };
}

/**
 * Assembles a medication candidate from independently matched rules, performing conflict detection
 * and contradiction resolution per dictionary §8, API_CONTRACTS.md §6.2, and SI-13.
 */
function assembleCandidate(matches: readonly AnyRuleMatch[]): MedicationCandidate {
  const candidate = emptyCandidate();

  // 1. Build and record 5-field MatchRecords for every match.
  const records: MatchRecord[] = matches.map((match) => ({
    rule_id: match.rule_id,
    dictionary_version: DICTIONARY_VERSION,
    matched_literal: match.matched_literal,
    source_span: match.source_span,
    match_type: match.match_type,
  }));
  candidate.matches.push(...records);

  // Helper to add candidate reading without duplicates.
  const addReading = (reading: string, rule_id: (typeof matches)[number]['rule_id']) => {
    if (!candidate.candidate_readings.some((r) => r.rule_id === rule_id && r.reading === reading)) {
      candidate.candidate_readings.push({ reading, rule_id });
    }
  };

  // 2. Propagate explicit candidate readings and verifier flags from rules (e.g. AMBIG-OD-001, DUR-BARE-001).
  for (const match of matches) {
    if (match.candidate_readings && match.candidate_readings.length > 0) {
      for (const cr of match.candidate_readings) {
        addReading(cr.reading, cr.rule_id);
      }
    }
    if (match.verifier_action_required) {
      candidate.verifier_action_required = true;
    }
  }

  // 3. Timing anchors accumulate by union (dictionary §8 rule 4; API_CONTRACTS.md §5.3).
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const record = records[i]!;
    if ('timing_anchors' in match.writes && match.writes.timing_anchors) {
      if (candidate.timing_anchors === null) {
        candidate.timing_anchors = [...match.writes.timing_anchors];
      } else {
        for (const anchor of match.writes.timing_anchors) {
          if (!candidate.timing_anchors.includes(anchor)) {
            candidate.timing_anchors.push(anchor);
          }
        }
      }

      if (candidate.field_provenance.timing_anchors === undefined) {
        candidate.field_provenance.timing_anchors = [record];
      } else {
        const provArray = Array.isArray(candidate.field_provenance.timing_anchors)
          ? candidate.field_provenance.timing_anchors
          : [candidate.field_provenance.timing_anchors];
        if (!provArray.some((p) => p.rule_id === record.rule_id && p.source_span.start === record.source_span.start)) {
          provArray.push(record);
        }
        candidate.field_provenance.timing_anchors = provArray;
      }
    }
  }

  // 4. Cross-category contradiction: single-dose vs recurring frequency.
  const hasSingleDose = matches.some((m) => m.category === 'single-dose');
  const hasFrequency = matches.some((m) => m.category === 'frequency');
  const hasCrossFrequencyConflict = hasSingleDose && hasFrequency;

  if (hasCrossFrequencyConflict) {
    candidate.verifier_action_required = true;
    for (const m of matches) {
      if (m.category === 'single-dose' || m.category === 'frequency') {
        addReading(getCanonicalReading(m), m.rule_id);
      }
    }
  }

  // 5. Collect scalar field writes.
  const fieldWrites = new Map<
    WritableFieldName,
    { value: unknown; match: AnyRuleMatch; record: MatchRecord }[]
  >();

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const record = records[i]!;

    for (const [fieldName, val] of Object.entries(match.writes)) {
      if (fieldName === 'timing_anchors' || val === undefined) {
        continue;
      }
      const field = fieldName as WritableFieldName;
      let list = fieldWrites.get(field);
      if (!list) {
        list = [];
        fieldWrites.set(field, list);
      }
      list.push({ value: val, match, record });
    }
  }

  // 6. Apply scalar fields and resolve intra-field contradictions.
  const contestedCategories = new Set<string>();

  for (const [field, entries] of fieldWrites.entries()) {
    if (entries.length > 1) {
      const firstVal = JSON.stringify(entries[0]!.value);
      const allIdentical = entries.every((e) => JSON.stringify(e.value) === firstVal);
      if (!allIdentical) {
        // Mark category as contested
        for (const entry of entries) {
          contestedCategories.add(entry.match.category);
          addReading(getCanonicalReading(entry.match), entry.match.rule_id);
        }
      }
    }
  }

  for (const [field, entries] of fieldWrites.entries()) {
    const isContestedCategory = entries.some((e) => contestedCategories.has(e.match.category));

    if (
      hasCrossFrequencyConflict &&
      (field === 'frequency_code' ||
        field === 'times_per_day' ||
        field === 'total_doses' ||
        field === 'immediate' ||
        field === 'recurring')
    ) {
      // Contested by cross-category conflict; left null without provenance.
      continue;
    }

    if (isContestedCategory) {
      // Contested by intra-category conflict; left null without provenance.
      candidate.verifier_action_required = true;
      (candidate as unknown as Record<string, unknown>)[field] = null;
      delete (candidate.field_provenance as Record<string, unknown>)[field];
      continue;
    }

    // Uncontested field
    (candidate as unknown as Record<string, unknown>)[field] = entries[0]!.value;
    (candidate.field_provenance as Record<string, unknown>)[field] = entries[0]!.record;
  }

  return candidate;
}

/**
 * Reports fields a human must supply (dictionary §9; §6.4).
 */
function reportMissingFields(candidate: MedicationCandidate, matches: readonly AnyRuleMatch[]): void {
  const isInstructionBearing = matches.some((match) =>
    INSTRUCTION_BEARING_CATEGORIES.includes(match.category),
  );

  const hasDoseAmount = matches.some((match) => match.category === 'dose-amount');
  const hasFrequency = matches.some((match) => match.category === 'frequency');
  const hasConditionalUse = matches.some((match) => match.category === 'conditional-use');
  const hasSingleDose = matches.some((match) => match.category === 'single-dose');

  // Dictionary §9 row 1: instruction-bearing line with no dose amount stated.
  if (isInstructionBearing && !hasDoseAmount) {
    candidate.missing_fields.push({ field: 'dose_amount', reason: 'absent_from_prescription' });
    candidate.verifier_action_required = true;
  }

  // Dictionary §9 row 2: amount stated with no frequency / how-often.
  // Never reported missing when: A conditional-use or single-dose rule matched.
  if (hasDoseAmount && !hasFrequency && !hasConditionalUse && !hasSingleDose && candidate.frequency_code === null) {
    candidate.missing_fields.push({ field: 'frequency_code', reason: 'absent_from_prescription' });
    candidate.verifier_action_required = true;
  }

  // Dictionary §9 rows 3 & 4: conditional-use requires human verifier to supply ceilings (SI-08).
  if (hasConditionalUse) {
    candidate.missing_fields.push(
      { field: 'max_doses_per_day', reason: 'requires_verifier_entry' },
      { field: 'min_interval_hours', reason: 'requires_verifier_entry' },
    );
    candidate.verifier_action_required = true;
  }
}
