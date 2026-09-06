/**
 * SI-06 — Unparsed-fragment reporting and unsupported-token protocol.
 *
 * Authoritative sources:
 *   - `SAFETY_INVARIANTS.md` SI-06
 *   - `SHORTHAND_DICTIONARY.md` §10 (Unsupported-token protocol)
 *   - `SHORTHAND_DICTIONARY.md` §11 (Adversarial OCR cases #22–#26)
 *   - `API_CONTRACTS.md` §4.1.1 (Envelope-level fragments), §4.2 (Candidate-level fragments), §6.3
 *
 * These are shorthand tokens, adversarial OCR cases, and plain dose forms, not real
 * prescription content, and no patient identifier appears anywhere in this file (AGENTS.md §8).
 */

import { parse } from '../../src/parser/parse';

describe('SI-06: Unparsed-Fragment Reporting', () => {
  it('preserves `8D` as an envelope-level unparsed fragment and never repairs to BD (case #22)', () => {
    const result = parse('8D');

    expect(result.candidates).toHaveLength(0);
    expect(result.unparsed_fragments).toEqual([
      { text: '8D', source_span: { start: 0, end: 2 } },
    ]);
  });

  it('preserves `T05` as an envelope-level unparsed fragment and never repairs to TDS (case #23)', () => {
    const result = parse('T05');

    expect(result.candidates).toHaveLength(0);
    expect(result.unparsed_fragments).toEqual([
      { text: 'T05', source_span: { start: 0, end: 3 } },
    ]);
  });

  it('preserves `l tab` as an envelope-level unparsed fragment and never repairs to 1 tab (case #24)', () => {
    const result = parse('l tab');

    expect(result.candidates).toHaveLength(0);
    expect(result.unparsed_fragments).toEqual([
      { text: 'l tab', source_span: { start: 0, end: 5 } },
    ]);
  });

  it('preserves `0D` as an envelope-level unparsed fragment and never repairs to OD (case #25)', () => {
    const result = parse('0D');

    expect(result.candidates).toHaveLength(0);
    expect(result.unparsed_fragments).toEqual([
      { text: '0D', source_span: { start: 0, end: 2 } },
    ]);
  });

  it('preserves `OM` as an envelope-level unparsed fragment with no interpretation invented (case #26)', () => {
    const result = parse('OM');

    expect(result.candidates).toHaveLength(0);
    expect(result.unparsed_fragments).toEqual([
      { text: 'OM', source_span: { start: 0, end: 2 } },
    ]);
  });

  it('preserves non-shorthand text within a medication line as candidate-level unparsed_fragments for `Tab Paracetamol 500mg TDS`', () => {
    const result = parse('Tab Paracetamol 500mg TDS');

    expect(result.candidates).toHaveLength(1);
    expect(result.unparsed_fragments).toBeUndefined();

    const candidate = result.candidates[0];
    expect(candidate.dose_strength_value).toBe(500);
    expect(candidate.frequency_code).toBe('THRICE_DAILY');
    expect(candidate.unparsed_fragments).toEqual([
      { text: 'Tab Paracetamol', source_span: { start: 0, end: 15 } },
    ]);
  });

  it('produces empty candidate unparsed_fragments for fully parsed line `1 tab BD pc × 5 days`', () => {
    const result = parse('1 tab BD pc × 5 days');

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].unparsed_fragments).toHaveLength(0);
    expect(result.unparsed_fragments).toBeUndefined();
  });

  it('returns empty candidates and undefined unparsed_fragments for empty or whitespace-only input', () => {
    const emptyResult = parse('');
    expect(emptyResult.candidates).toHaveLength(0);
    expect(emptyResult.unparsed_fragments).toBeUndefined();

    const wsResult = parse('   \t\n  ');
    expect(wsResult.candidates).toHaveLength(0);
    expect(wsResult.unparsed_fragments).toBeUndefined();
  });

  it('measures unparsed fragment source_span half-open in Unicode code points', () => {
    // '💊' is 1 Unicode code point (2 UTF-16 code units)
    const result = parse('💊 Paracetamol 500mg');

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.dose_strength_value).toBe(500);
    expect(candidate.unparsed_fragments).toEqual([
      { text: '💊 Paracetamol', source_span: { start: 0, end: 13 } },
    ]);
  });

  it('preserves non-Latin script in unparsed fragments without truncation or repair', () => {
    const result = parse('औषध 500mg BD');

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.dose_strength_value).toBe(500);
    expect(candidate.frequency_code).toBe('TWICE_DAILY');
    expect(candidate.unparsed_fragments).toEqual([
      { text: 'औषध', source_span: { start: 0, end: 3 } },
    ]);
  });
});
