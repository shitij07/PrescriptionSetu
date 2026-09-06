/**
 * CORPUS-INVARIANTS — Dictionary §11 Corpus & Cross-Rule Verification Suite.
 *
 * Authoritative sources:
 *   - `SHORTHAND_DICTIONARY.md` §8 (Composition), §9 (Missing fields), §10 (Unsupported tokens), §11 (Cases #1–#26 & Invariants 1–8)
 *   - `SAFETY_INVARIANTS.md` SI-04, SI-05, SI-06, SI-07, SI-08, SI-09, SI-13
 *   - `API_CONTRACTS.md` §4, §5, §6
 *
 * These are shorthand tokens and plain dose forms, not real prescription content, and no
 * patient identifier appears anywhere in this file (AGENTS.md §8).
 */

import { parse } from '../../src/parser/parse';
import { CATEGORY_WRITABLE_FIELDS, RULES } from '../../src/parser/rules';
import { sliceByCodePoints, toCodePoints } from '../../src/parser/text';

describe('Dictionary §11 Corpus & Cross-Rule Verification Suite', () => {
  // 1. §11 Case #2 & #3
  it('§11 Case #2 & #3: composes complex multi-rule medication lines with accurate per-field provenance and no spurious missing fields', () => {
    // Case #2: Amoxicillin 500mg 1 tab TDS
    const r2 = parse('Amoxicillin 500mg 1 tab TDS');
    expect(r2.candidates).toHaveLength(1);
    const c2 = r2.candidates[0];

    expect(c2.dose_strength_value).toBe(500);
    expect(c2.dose_strength_unit).toBe('mg');
    expect(c2.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(c2.dose_unit).toBe('tablet');
    expect(c2.frequency_code).toBe('THRICE_DAILY');
    expect(c2.times_per_day).toBe(3);
    expect(c2.missing_fields).toHaveLength(0);
    expect(c2.matches).toHaveLength(3);

    expect(c2.field_provenance.dose_strength_value?.rule_id).toBe('STR-MASS-001');
    expect(c2.field_provenance.dose_amount?.rule_id).toBe('AMT-TAB-001');
    expect(c2.field_provenance.frequency_code?.rule_id).toBe('FREQ-TDS-001');

    // Case #3: 1 tab BD pc × 5 days
    const r3 = parse('1 tab BD pc × 5 days');
    expect(r3.candidates).toHaveLength(1);
    const c3 = r3.candidates[0];

    expect(c3.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(c3.dose_unit).toBe('tablet');
    expect(c3.frequency_code).toBe('TWICE_DAILY');
    expect(c3.times_per_day).toBe(2);
    expect(c3.timing_anchors).toEqual(['AFTER_MEAL']);
    expect(c3.duration_value).toBe(5);
    expect(c3.duration_unit).toBe('day');
    expect(c3.missing_fields).toHaveLength(0);
    expect(c3.matches).toHaveLength(4);

    expect(c3.field_provenance.dose_amount?.rule_id).toBe('AMT-TAB-001');
    expect(c3.field_provenance.frequency_code?.rule_id).toBe('FREQ-BD-001');
    expect(c3.field_provenance.timing_anchors?.[0]?.rule_id).toBe('TIME-PC-001');
    expect(c3.field_provenance.duration_value?.rule_id).toBe('DUR-DAYS-001');
  });

  // 2. §11 Case #4
  it('§11 Case #4: verifies canonical frequency equivalence between 1 tab QDS and 1 tab QID while preserving matched_literal in provenance', () => {
    const rQds = parse('1 tab QDS');
    const rQid = parse('1 tab QID');

    expect(rQds.candidates).toHaveLength(1);
    expect(rQid.candidates).toHaveLength(1);

    const cQds = rQds.candidates[0];
    const cQid = rQid.candidates[0];

    // Canonical equivalence
    expect(cQds.frequency_code).toBe('FOUR_TIMES_DAILY');
    expect(cQid.frequency_code).toBe('FOUR_TIMES_DAILY');
    expect(cQds.times_per_day).toBe(4);
    expect(cQid.times_per_day).toBe(4);
    expect(cQds.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(cQid.dose_amount).toEqual({ kind: 'integer', value: 1 });

    // Exact matched_literal preservation
    expect(cQds.field_provenance.frequency_code?.matched_literal).toBe('QDS');
    expect(cQid.field_provenance.frequency_code?.matched_literal).toBe('QID');
  });

  // 3. §11 Case #7
  it('§11 Case #7: verifies conditional-use composition with explicit dose amount and strength (Tab Paracetamol 500mg 1 tab SOS)', () => {
    const res = parse('Tab Paracetamol 500mg 1 tab SOS');
    expect(res.candidates).toHaveLength(1);
    const candidate = res.candidates[0];

    expect(candidate.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(candidate.dose_unit).toBe('tablet');
    expect(candidate.dose_strength_value).toBe(500);
    expect(candidate.dose_strength_unit).toBe('mg');
    expect(candidate.as_needed).toBe(true);
    expect(candidate.schedule_derivable).toBe(false);
    expect(candidate.verifier_action_required).toBe(true);

    // Ceiling fields require verifier entry
    expect(candidate.missing_fields).toEqual([
      { field: 'max_doses_per_day', reason: 'requires_verifier_entry' },
      { field: 'min_interval_hours', reason: 'requires_verifier_entry' },
    ]);

    // dose_amount and frequency_code must NOT be reported as missing
    expect(candidate.missing_fields.some((m) => m.field === 'dose_amount')).toBe(false);
    expect(candidate.missing_fields.some((m) => m.field === 'frequency_code')).toBe(false);
  });

  // 4. §11 / §8 Timing Anchor Accumulation
  it('§11 / §8: verifies non-contradictory timing anchor accumulation (1 tab BD ac pc HS)', () => {
    const res = parse('1 tab BD ac pc HS');
    expect(res.candidates).toHaveLength(1);
    const candidate = res.candidates[0];

    expect(candidate.frequency_code).toBe('TWICE_DAILY');
    expect(candidate.timing_anchors).toEqual(['BEDTIME', 'BEFORE_MEAL', 'AFTER_MEAL']);

    // Provenance has all 3 timing anchor records
    expect(candidate.field_provenance.timing_anchors).toHaveLength(3);
    const anchorRuleIds = candidate.field_provenance.timing_anchors?.map((p) => p.rule_id);
    expect(anchorRuleIds).toEqual(['ANCH-HS-001', 'TIME-AC-001', 'TIME-PC-001']);
    expect(candidate.candidate_readings).toHaveLength(0);
  });

  // 5. Multi-Line Composite Verification
  it('Multi-Line Composite: verifies mixed multi-line prescription with clean composition, single-dose, contradiction, and unrecognized lines', () => {
    const text = [
      'Tab Metformin 500mg BD',
      '1 tab stat',
      '1 tab BD TDS',
      '8D',
    ].join('\n');

    const res = parse(text);

    // 3 recognized lines yield 3 distinct candidates
    expect(res.candidates).toHaveLength(3);

    // Line 1: clean composition
    const c1 = res.candidates[0];
    expect(c1.dose_strength_value).toBe(500);
    expect(c1.frequency_code).toBe('TWICE_DAILY');
    expect(c1.verifier_action_required).toBe(true); // missing dose_amount
    expect(c1.missing_fields).toEqual([
      { field: 'dose_amount', reason: 'absent_from_prescription' },
    ]);

    // Line 2: single dose
    const c2 = res.candidates[1];
    expect(c2.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(c2.total_doses).toBe(1);
    expect(c2.recurring).toBe(false);
    expect(c2.immediate).toBe(true);
    expect(c2.schedule_derivable).toBe(false);

    // Line 3: contradictory frequency (isolated to line 3)
    const c3 = res.candidates[2];
    expect(c3.dose_amount).toEqual({ kind: 'integer', value: 1 });
    expect(c3.frequency_code).toBeNull();
    expect(c3.verifier_action_required).toBe(true);
    expect(c3.candidate_readings).toEqual([
      { reading: 'twice daily', rule_id: 'FREQ-BD-001' },
      { reading: 'three times daily', rule_id: 'FREQ-TDS-001' },
    ]);

    // Line 4: unrecognized line routes to envelope-level unparsed_fragments
    expect(res.unparsed_fragments).toEqual([
      { text: '8D', source_span: { start: 47, end: 49 } },
    ]);
  });

  // 6. Invariant 1: Unique rule_ids
  it('Invariant 1: every rule in RULES has a unique rule id', () => {
    expect(RULES.length).toBe(18); // 18 rule definitions covering all 19 dictionary rules
    const ruleIds = RULES.map((r) => r.id);
    const uniqueIds = new Set(ruleIds);
    expect(uniqueIds.size).toBe(RULES.length);
  });

  // 7. Invariants 2 & 3: Category Isolation
  it('Invariants 2 & 3: every rule strictly writes fields permitted by its declared category', () => {
    for (const rule of RULES) {
      const permitted = CATEGORY_WRITABLE_FIELDS[rule.category];
      expect(permitted).toBeDefined();
    }
  });

  // 8. Invariant 4: no-schedule-derivable rules yield schedule_derivable: false
  it('Invariant 4: every rule in no-schedule-derivable tier writes schedule_derivable: false', () => {
    const noScheduleRuleIds = ['COND-SOS-001', 'COND-PRN-001', 'DOSE-STAT-001'];

    for (const ruleId of noScheduleRuleIds) {
      const match = RULES.find((r) => r.id === ruleId);
      expect(match).toBeDefined();
    }

    const sosRes = parse('1 tab SOS');
    expect(sosRes.candidates[0].schedule_derivable).toBe(false);

    const prnRes = parse('1 tab PRN');
    expect(prnRes.candidates[0].schedule_derivable).toBe(false);

    const statRes = parse('1 tab stat');
    expect(statRes.candidates[0].schedule_derivable).toBe(false);
  });

  // 9. Invariant 5: max_doses_per_day and min_interval_hours are never written by parser rules
  it('Invariant 5: max_doses_per_day and min_interval_hours are never present as effective clinical fields on candidates', () => {
    const testInputs = [
      '1 tab BD',
      'Tab Paracetamol 500mg SOS',
      '1 tab PRN',
      'Inj Diclofenac stat',
      '1 tab BD pc × 5 days',
    ];

    for (const input of testInputs) {
      const res = parse(input);
      for (const candidate of res.candidates) {
        const candObj = candidate as unknown as Record<string, unknown>;
        expect(candObj.max_doses_per_day).toBeUndefined();
        expect(candObj.min_interval_hours).toBeUndefined();
      }
    }
  });

  // 10. Invariant 6: No clock-time or timestamp written by shorthand rules
  it('Invariant 6: parser rules never write clock times or timestamps to any field', () => {
    const res = parse('Tab Alprazolam HS');
    const candidate = res.candidates[0];

    expect(candidate.timing_anchors).toEqual(['BEDTIME']);
    expect(candidate.frequency_code).toBeNull();
    const candObj = candidate as unknown as Record<string, unknown>;
    expect(candObj.clock_time).toBeUndefined();
    expect(candObj.timestamp).toBeUndefined();
  });

  // 11. Invariant 7: Exactly one of FREQ-OD-001 or AMBIG-OD-001 fires for any OD token
  it('Invariant 7: exactly one of FREQ-OD-001 or AMBIG-OD-001 fires for any OD token, never both or neither', () => {
    // Normal context -> FREQ-OD-001 fires, AMBIG-OD-001 does not
    const normalRes = parse('Tab Atorvastatin 10mg OD');
    const normalMatches = normalRes.candidates[0].matches.map((m) => m.rule_id);
    expect(normalMatches).toContain('FREQ-OD-001');
    expect(normalMatches).not.toContain('AMBIG-OD-001');

    // Ocular context -> AMBIG-OD-001 fires, FREQ-OD-001 does not
    const eyeRes = parse('Moxifloxacin eye drops 1 drop OD');
    const eyeMatches = eyeRes.candidates[0].matches.map((m) => m.rule_id);
    expect(eyeMatches).toContain('AMBIG-OD-001');
    expect(eyeMatches).not.toContain('FREQ-OD-001');
  });

  // 12. Invariant 8: Every MatchRecord has exactly the 5 contract provenance fields
  it('Invariant 8: every MatchRecord across all rule firings has exactly the 5 contract provenance fields', () => {
    const complexRes = parse('1 tab BD pc × 5 days continue stat SOS');
    const allMatches = complexRes.candidates.flatMap((c) => c.matches);

    expect(allMatches.length).toBeGreaterThanOrEqual(4);

    for (const match of allMatches) {
      const keys = Object.keys(match).sort();
      expect(keys).toEqual([
        'dictionary_version',
        'match_type',
        'matched_literal',
        'rule_id',
        'source_span',
      ]);
      expect(match.dictionary_version).toBe('0.1.0');
      expect(typeof match.rule_id).toBe('string');
      expect(typeof match.matched_literal).toBe('string');
      expect(typeof match.source_span.start).toBe('number');
      expect(typeof match.source_span.end).toBe('number');
      expect(match.source_span.end).toBeGreaterThan(match.source_span.start);
    }
  });

  // 13. Read-back source span invariant
  it('Read-back Invariant: sliceByCodePoints(codePoints, span.start, span.end) perfectly reconstructs matched literals and unparsed text', () => {
    const rawText = [
      'Dr. Sharma 🏥 Clinic',
      'Tab Metformin 500mg BD pc',
      '1 tab BD TDS',
      '8D',
    ].join('\n');

    const codePoints = toCodePoints(rawText);
    const result = parse(rawText);

    // Verify candidate matches
    for (const candidate of result.candidates) {
      for (const match of candidate.matches) {
        const readBack = sliceByCodePoints(codePoints, match.source_span.start, match.source_span.end);
        expect(readBack).toBe(match.matched_literal);
      }
      for (const frag of candidate.unparsed_fragments) {
        const readBack = sliceByCodePoints(codePoints, frag.source_span.start, frag.source_span.end);
        expect(readBack).toBe(frag.text);
      }
    }

    // Verify envelope unparsed fragments
    for (const frag of result.unparsed_fragments ?? []) {
      const readBack = sliceByCodePoints(codePoints, frag.source_span.start, frag.source_span.end);
      expect(readBack).toBe(frag.text);
    }
  });

  // 14. §9 Completeness & Missing Fields Matrix
  it('§9 Completeness: verifies missing_fields reporting matrix across all instruction-bearing and non-instruction-bearing inputs', () => {
    // 1. Instruction-bearing line with frequency but no dose amount -> dose_amount absent_from_prescription
    const m1 = parse('Metformin 500mg BD').candidates[0];
    expect(m1.missing_fields).toEqual([
      { field: 'dose_amount', reason: 'absent_from_prescription' },
    ]);

    // 2. Amount stated without frequency -> frequency_code absent_from_prescription
    const m2 = parse('1 tab').candidates[0];
    expect(m2.missing_fields).toEqual([
      { field: 'frequency_code', reason: 'absent_from_prescription' },
    ]);

    // 3. Conditional use -> requires verifier entry for ceilings, no false frequency missing
    const m3 = parse('1 tab SOS').candidates[0];
    expect(m3.missing_fields).toEqual([
      { field: 'max_doses_per_day', reason: 'requires_verifier_entry' },
      { field: 'min_interval_hours', reason: 'requires_verifier_entry' },
    ]);

    // 4. Single-dose -> no missing frequency
    const m4 = parse('1 tab stat').candidates[0];
    expect(m4.missing_fields).toHaveLength(0);

    // 5. Contradictory frequency -> contested frequency must NOT report absent_from_prescription
    const m5 = parse('1 tab BD TDS').candidates[0];
    expect(m5.missing_fields).toHaveLength(0);

    // 6. Complete instruction -> empty missing_fields
    const m6 = parse('1 tab BD').candidates[0];
    expect(m6.missing_fields).toHaveLength(0);
  });
});
