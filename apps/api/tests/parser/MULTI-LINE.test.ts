/**
 * MULTI-LINE — Multi-line prescription parsing.
 *
 * Authoritative sources:
 *   - `MASTERPLAN.md` §18.2 & §18.3
 *   - `API_CONTRACTS.md` §4.1 (Envelope & candidate collection), §4.1.1, §4.2, §5.1 (Global source spans)
 *   - `SAFETY_INVARIANTS.md` SI-04, SI-06, SI-07, SI-13
 *
 * These are shorthand tokens and plain dose forms, not real prescription content, and no
 * patient identifier appears anywhere in this file (AGENTS.md §8).
 */

import { parse } from '../../src/parser/parse';
import { sliceByCodePoints, toCodePoints } from '../../src/parser/text';

describe('Multi-Line Prescription Parsing', () => {
  it('parses two distinct medication lines into two independent candidates', () => {
    const text = 'Tab Metformin 500mg BD\nTab Atorvastatin 10mg OD';
    const result = parse(text);

    expect(result.candidates).toHaveLength(2);

    const [c1, c2] = result.candidates;
    expect(c1.dose_strength_value).toBe(500);
    expect(c1.dose_strength_unit).toBe('mg');
    expect(c1.frequency_code).toBe('TWICE_DAILY');

    expect(c2.dose_strength_value).toBe(10);
    expect(c2.dose_strength_unit).toBe('mg');
    expect(c2.frequency_code).toBe('ONCE_DAILY');

    expect(result.unparsed_fragments).toBeUndefined();
  });

  it('preserves global Unicode code-point source spans across multiple lines', () => {
    const text = 'Tab Metformin 500mg BD\nTab Atorvastatin 10mg OD';
    const codePoints = toCodePoints(text);
    const result = parse(text);

    const c1 = result.candidates[0];
    const c2 = result.candidates[1];

    for (const match of [...c1.matches, ...c2.matches]) {
      const readBack = sliceByCodePoints(codePoints, match.source_span.start, match.source_span.end);
      expect(readBack).toBe(match.matched_literal);
    }
  });

  it('supports CRLF (\\r\\n) and legacy CR (\\r) line terminators identically to LF (\\n)', () => {
    const crlfText = 'Tab Metformin 500mg BD\r\nTab Atorvastatin 10mg OD';
    const crlfResult = parse(crlfText);
    expect(crlfResult.candidates).toHaveLength(2);
    expect(crlfResult.candidates[0].frequency_code).toBe('TWICE_DAILY');
    expect(crlfResult.candidates[1].frequency_code).toBe('ONCE_DAILY');

    const crText = 'Tab Metformin 500mg BD\rTab Atorvastatin 10mg OD';
    const crResult = parse(crText);
    expect(crResult.candidates).toHaveLength(2);
    expect(crResult.candidates[0].frequency_code).toBe('TWICE_DAILY');
    expect(crResult.candidates[1].frequency_code).toBe('ONCE_DAILY');
  });

  it('ignores blank and whitespace-only lines between medication instructions', () => {
    const text = 'Tab Metformin 500mg BD\n\n   \t  \nTab Atorvastatin 10mg OD\n\n';
    const result = parse(text);

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].dose_strength_value).toBe(500);
    expect(result.candidates[1].dose_strength_value).toBe(10);
    expect(result.unparsed_fragments).toBeUndefined();
  });

  it('places unrecognized lines (headers/footers) in envelope-level unparsed_fragments while returning recognized candidates', () => {
    const text = 'Dr. Sharma Clinic\n1 tab BD pc\nNext review in 1 month';
    const codePoints = toCodePoints(text);
    const result = parse(text);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].frequency_code).toBe('TWICE_DAILY');

    expect(result.unparsed_fragments).toEqual([
      { text: 'Dr. Sharma Clinic', source_span: { start: 0, end: 17 } },
      { text: 'Next review in 1 month', source_span: { start: 30, end: 52 } },
    ]);

    for (const fragment of result.unparsed_fragments ?? []) {
      const readBack = sliceByCodePoints(codePoints, fragment.source_span.start, fragment.source_span.end);
      expect(readBack).toBe(fragment.text);
    }
  });

  it('isolates intra-line contradiction on line 1 without affecting clean instructions on line 2', () => {
    const text = '1 tab BD TDS\n1 tab OD';
    const result = parse(text);

    expect(result.candidates).toHaveLength(2);

    const [c1, c2] = result.candidates;
    // Line 1 is contradictory
    expect(c1.frequency_code).toBeNull();
    expect(c1.verifier_action_required).toBe(true);
    expect(c1.candidate_readings).toHaveLength(2);

    // Line 2 is clean
    expect(c2.frequency_code).toBe('ONCE_DAILY');
    expect(c2.verifier_action_required).toBeNull();
    expect(c2.candidate_readings).toHaveLength(0);
  });

  it('attaches candidate-level unparsed_fragments to respective candidates without cross-line leakage', () => {
    const text = 'Tab Metformin 500mg BD\nTab Atorvastatin 10mg OD';
    const result = parse(text);

    const [c1, c2] = result.candidates;
    expect(c1.unparsed_fragments).toEqual([
      { text: 'Tab Metformin', source_span: { start: 0, end: 13 } },
    ]);
    expect(c2.unparsed_fragments).toEqual([
      { text: 'Tab Atorvastatin', source_span: { start: 23, end: 39 } },
    ]);
  });

  it('returns empty candidates and multi-item envelope unparsed_fragments when all lines are unrecognized', () => {
    const text = '8D\nT05\n0D';
    const result = parse(text);

    expect(result.candidates).toHaveLength(0);
    expect(result.unparsed_fragments).toEqual([
      { text: '8D', source_span: { start: 0, end: 2 } },
      { text: 'T05', source_span: { start: 3, end: 6 } },
      { text: '0D', source_span: { start: 7, end: 9 } },
    ]);
  });

  it('accurately computes source spans for subsequent lines following non-BMP Unicode (emojis/Devanagari)', () => {
    // 💊 is 1 Unicode code point (2 UTF-16 code units)
    const text = '💊 Metformin 500mg BD\nTab Atorvastatin 10mg OD';
    const codePoints = toCodePoints(text);
    const result = parse(text);

    const [c1, c2] = result.candidates;
    expect(c1.dose_strength_value).toBe(500);
    expect(c2.dose_strength_value).toBe(10);

    for (const match of [...c1.matches, ...c2.matches]) {
      const readBack = sliceByCodePoints(codePoints, match.source_span.start, match.source_span.end);
      expect(readBack).toBe(match.matched_literal);
    }
  });

  it('preserves correct missing_fields reporting per candidate across multiple lines', () => {
    const text = 'Metformin 500mg BD\n1 tab TDS';
    const result = parse(text);

    const [c1, c2] = result.candidates;
    // Line 1 has strength and frequency, missing amount
    expect(c1.missing_fields).toEqual([
      { field: 'dose_amount', reason: 'absent_from_prescription' },
    ]);
    // Line 2 has amount and frequency, no missing fields
    expect(c2.missing_fields).toHaveLength(0);
  });
});
