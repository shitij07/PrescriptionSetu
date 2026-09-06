# SHORTHAND_DICTIONARY.md

**dictionary_version:** `0.1.0`
**Status:** DRAFT — open semantic questions in §12 are unresolved; `match_forms` are
provisional until validated against the sample corpus (`BUILD_ORDER.md` §2.1).
**Last updated:** 2026-08-26 (§4/§5 `match_type` clarification, D-027 — see §14)

This document is the specification that the deterministic TypeScript shorthand parser in
`apps/api` implements against. It defines which medical shorthand tokens the parser may
recognise, what each one is permitted to mean, and — more importantly — what the parser
must refuse to conclude.

---

## §1 Scope and authority

### What this document is

A **human-reviewed parser specification**. Every rule in §7 was read and approved by a
human before the parser was allowed to implement it.

### What this document is not

It is not executable code. It is not a fixture source: no build step, script, or test
helper parses this file. It is not a clinical reference, a drug database, an LLM prompt,
or a medical decision engine. It contains no advice about whether a prescription is
correct, safe, or appropriate — only about what its notation literally says.

The distinction matters because a specification that is also a machine input drifts
towards whatever the machine needs and away from what a human can review. This file is
optimised for human review, and that is its entire value.

### Authority and precedence

The parser implements this document and nothing beyond it. If a token is not in §7, the
parser has no interpretation for it — see §10.

Where this document conflicts with `PercriptionSetuMASTERPLAN.md` §18.3 or §26, or with
`SAFETY_INVARIANTS.md`, **those documents win** and this one is wrong and must be fixed.

Per MASTERPLAN §18.3 Design Principle: parsing SHALL be rule-based and deterministic.
**An LLM SHALL NOT be the primary interpreter of any shorthand token.** LLM assistance is
permitted only as a documented, verifier-visible fallback for fragments this dictionary
does not cover, and never as a silent default. No rule in §7 may be implemented by asking
a model what a token probably means.

### Relationship to the parser implementation

Parser code and its Jest tests are separate work, written manually from this
specification. §11 states the cases the parser must satisfy in human-readable form; a
future implementer transcribes them into tests by hand and names each test after the
`rule_id` it covers, so traceability survives without coupling this document to the build.

---

## §2 Token category taxonomy

Eight categories. Each declares exactly which structured fields it may write and which it
must leave `null`. The declaration is load-bearing: it is what structurally prevents a
timing token from producing a frequency, or a strength token from producing a dose amount.

| Category | May write | Must never write |
|---|---|---|
| `frequency` | `frequency_code`, `times_per_day` | dose fields, duration fields, `timing_anchors`, `as_needed` |
| `meal-timing` | `timing_anchors` | any frequency, dose, or duration field |
| `circadian-anchor` | `timing_anchors` | any frequency, dose, or duration field |
| `dose-amount` | `dose_amount`, `dose_unit` | `dose_strength_value`, `dose_strength_unit`, frequency fields |
| `dose-strength` | `dose_strength_value`, `dose_strength_unit` | `dose_amount`, `dose_unit`, frequency fields |
| `duration` | `duration_value`, `duration_unit`, `duration_indefinite` | frequency fields, dose fields |
| `conditional-use` | `as_needed` | `max_doses_per_day`, `min_interval_hours`, frequency fields |
| `single-dose` | `total_doses`, `recurring`, `immediate` | `frequency_code`, `times_per_day` |

Two fields — `max_doses_per_day` and `min_interval_hours` — appear in the "must never
write" column and in **no** category's "may write" column. That is deliberate. No rule in
this dictionary is capable of producing them, so the parser structurally cannot invent a
dosing ceiling or a minimum gap between doses. See §7.4 and §9.

### Structured output field reference

| Field | Type | Written by | Remains `null` unless |
|---|---|---|---|
| `frequency_code` | enum: `ONCE_DAILY`, `TWICE_DAILY`, `THRICE_DAILY`, `FOUR_TIMES_DAILY` | `frequency` | a frequency rule matched deterministically |
| `times_per_day` | integer | `frequency` | as above |
| `timing_anchors` | array of enum: `BEDTIME`, `BEFORE_MEAL`, `AFTER_MEAL` | `meal-timing`, `circadian-anchor` | an anchor rule matched |
| `dose_amount` | integer or exact fraction | `dose-amount` only | a `dose-amount` rule matched — **never** derived from strength |
| `dose_unit` | enum: `tablet`, `ml` | `dose-amount` only | as above |
| `dose_strength_value` | number | `dose-strength` only | a strength literal is present |
| `dose_strength_unit` | enum: `mg`, `mcg`, `g` | `dose-strength` only | as above |
| `duration_value` | integer | `duration` | a unit-bearing duration matched |
| `duration_unit` | enum: `day`, `week` | `duration` | as above |
| `duration_indefinite` | boolean | `duration` | a verifier confirms indefinite use |
| `as_needed` | boolean | `conditional-use` | a conditional-use rule matched |
| `max_doses_per_day` | integer | **no rule** | explicitly present in the prescription **or** explicitly entered and confirmed by the human verifier |
| `min_interval_hours` | number | **no rule** | as above |
| `total_doses` | integer | `single-dose` | a single-dose rule matched |
| `recurring` | boolean | `single-dose` | as above |
| `immediate` | boolean | `single-dose` | as above |
| `schedule_derivable` | boolean | control field | — |
| `verifier_action_required` | boolean | control field | — |
| `candidate_readings` | array of `{reading, rule_id}` | ambiguous outcomes | — |
| `missing_fields` | array of `{field, reason}` | §9 completeness check | — |
| `unparsed_fragments` | array of `{text, source_span}` | §10 | — |

**No defaults, ever.** There is no default frequency and no default duration. A field no
rule wrote is `null`. `null` means "the prescription did not say," which is information —
and replacing it with a plausible guess destroys that information silently.

---

## §3 Interpretation tiers

Every rule carries exactly one tier. The tier determines what the parser is permitted to
write and what the verifier is obliged to see.

| Tier | Parser behaviour | Verifier consequence |
|---|---|---|
| `deterministic` | Writes the structured value. The token has one meaning in this project's scope. | Shown token, meaning, and rule for confirmation |
| `deterministic-with-anchor` | Writes a **symbolic** anchor only. Never a clock time. | Shown the anchor; clock resolution happens downstream |
| `requires-verifier-decision` | Writes `null` to the safety-relevant field, populates `candidate_readings` with every plausible reading, sets `verifier_action_required: true` | Must choose between readings; cannot proceed by default |
| `no-schedule-derivable` | Sets `schedule_derivable: false`. May record the conditional nature of the instruction. | Reminder generation blocked pending human input |
| `unsupported` | Writes nothing. Routes the fragment to §10. | Shown the raw text as "not understood" |

`deterministic` is a claim about **notational** certainty within this project's scope, not
clinical certainty. `BD` deterministically denotes twice daily; whether twice daily is
right for this patient is a question this document has no opinion about.

The tiers are ordered by decreasing parser authority. When a token could plausibly sit in
two tiers, the correct choice is always the lower-authority one.

---

## §4 Matching and normalization policy

### Permitted normalizations — exhaustive

Only these three, and only as declared per rule:

1. **Case folding.** `BD`, `bd`, `Bd` are equivalent. Subject to §12 OQ-11.
2. **Token-internal period stripping.** `B.D.` → `BD`, when the candidate matches a
   dotted form declared in that rule's `match_forms`.
3. **Surrounding whitespace trimming.**

Anything not on this list is forbidden.

### Prohibited matching behaviour — non-negotiable

- **No fuzzy matching.** Not of any kind, anywhere in the parser.
- **No edit-distance or approximate matching.** Levenshtein, Damerau-Levenshtein,
  Jaro-Winkler, phonetic, and n-gram similarity are all forbidden for shorthand tokens.
- **No character-substitution recovery.** The parser must not "repair" plausible OCR
  confusions — not `8D` → `BD`, not `T05` → `TDS`, not `l tab` → `1 tab`, not `0D` → `OD`.
- **No guessing unsupported abbreviations.** A token absent from §7 has no interpretation,
  however medically plausible a reading might seem.

The cost is accepted deliberately. Refusing OCR repair will make corpus accuracy metrics
look worse, because genuine tokens the OCR mangled will be reported as unknown instead of
silently corrected. That is the intended trade: a flagged unknown costs a verifier a few
seconds, while a confidently wrong frequency can cost a patient a dose. This dictionary
optimises for the second failure never happening quietly.

### Complete-token / lexical-boundary matching — mandatory

**A future implementation MUST enforce token boundaries. Safety-relevant shorthand must
never match as a substring.** A boundary-free match is a silent misreading, which is
exactly the failure mode this dictionary exists to prevent.

A candidate match is valid only when delimited on both sides by one of: start of string,
end of string, whitespace, or a member of the boundary set `, ; : ( ) [ ] | .` — with `.`
counting as a delimiter **except** where the period forms part of a candidate that matches a
dotted `match_forms` entry declared by the rule being evaluated, in which case the period
belongs to the token (D-029).

Boundary checking is therefore **edge validation on a candidate**: it inspects only the
characters immediately outside the candidate and never looks inside it. It is *not*
tokenisation, and an implementation must not split the input on the boundary set — splitting
on `.` would break the decimal in `2.5 mg` under `STR-MASS-001` (§7.7).

Required negative behaviour — these must **not** match:

| Input text | Must not match | Why it is dangerous |
|---|---|---|
| `ODT` (orally disintegrating tablet) | `OD` | Would fabricate "once daily" from a dosage-form abbreviation |
| `BDS` | `BD` | Would fabricate "twice daily" from an unrelated token |
| `statin` | `stat` | Would fabricate an immediate single dose from part of a drug-class word |
| `TDSx` | `TDS` | Trailing character means the token was not what it appeared to be |
| `Predmet` | `pc` | Interior substring; no timing meaning whatsoever |
| `50 mcg` | `g`, `mg` | Unit must match as a whole unit, not a trailing letter |

**Implementation hazard — the terminal period.** Normalization 2 strips token-internal
periods, but a period can also terminate a sentence or an abbreviation list. `B.D.` is a
dotted form; the final period in `Give 1 tab BD.` is punctuation. An implementation must
strip periods only inside a candidate that matches a declared dotted form, and must never
treat a sentence-terminating period as part of a token. The boundary set includes `.` for
exactly this reason (D-029): in `Give 1 tab BD.` the period *delimits* the candidate `BD`
rather than joining it, so the match succeeds and the period stays outside `source_span`.
`/` is **not** a boundary character, because duration forms such as `5/7` and the ophthalmic
signal `e/d` contain it legitimately; rules needing `/` declare it in their own pattern.

### Match types

Four values, and no others: `exact`, `case-insensitive`, `punctuation-normalized`, `regex`.

**Provenance records exactly one of them per match (§5), and it is the normalization that
*this* match actually required** — not the set of normalizations its rule is allowed to apply.
The value is an observation about the source text, not a static property of the rule (D-022,
D-027).

| Value | Recorded when |
|---|---|
| `exact` | The text is character-for-character one of the rule's `match_forms`. No normalization was needed. |
| `case-insensitive` | Case folding (normalization 1) was needed, and no period was stripped. |
| `punctuation-normalized` | A token-internal period was stripped (normalization 2), whether or not case folding was also needed. |
| `regex` | The rule matches by declared pattern rather than by a `match_forms` literal. Pattern rules always record `regex`, whatever the input's case. |

Where two normalizations apply to one match, the **most-transforming one is recorded**:
`punctuation-normalized` over `case-insensitive` over `exact`. This keeps the field
single-valued and deterministic. Surrounding-whitespace trimming (normalization 3) never
affects `match_type`; it is not a property of the token itself.

Worked example — `FREQ-BD-001` (§7.1), whose `match_forms` are `BD`, `bd`, `B.D.`, `b.d.`:

| Text | `match_type` | Why |
|---|---|---|
| `BD` | `exact` | A declared form, matched untouched |
| `bd` | `case-insensitive` | Case folded only |
| `B.D.` | `punctuation-normalized` | Token-internal periods stripped |
| `b.d.` | `punctuation-normalized` | Periods stripped *and* case folded — periods win |

**The per-entry `Match type` row in §7 lists the normalizations a rule may apply. It is not
the value written to provenance.** A rule whose row reads `case-insensitive`,
`punctuation-normalized` records `exact` when the text needed neither, and otherwise records
whichever of the two it applied. A rule may never record a normalization its row does not list.

---

## §5 Provenance requirements

Every match records exactly five fields. All five are mandatory. MASTERPLAN §26
Auditability requires that every parsing decision trace back to the exact raw OCR fragment
it came from; these fields are how that requirement is met in practice.

| Field | Content | Why it is required |
|---|---|---|
| `rule_id` | The rule that fired, e.g. `FREQ-QID-001` | Makes a *wrong rule* visible, not just a wrong value |
| `dictionary_version` | Version whose rules produced this reading | A reading is only meaningful relative to the rules in force |
| `matched_literal` | The source substring **byte-for-byte**, original case and punctuation preserved | Normalization becomes visible instead of lossy |
| `source_span` | `{start, end}` offsets into the raw OCR text | Lets the dashboard highlight the exact origin fragment |
| `match_type` | Exactly one of the four §4 values — the normalization *this* match actually required (§4; D-027) | Shows *how* the match was reached, not just that it was |

`matched_literal` must never be overwritten with the canonical form. A prescription that
said `QDS` must remain distinguishable from one that said `QID` even though both
canonicalise identically (§7.1.4), and a prescription that said `b.d.` must remain
distinguishable from one that said `BD`. Preserving the literal is what makes the audit
trail an audit trail rather than a restatement of the parser's conclusion.

Persistence of `dictionary_version` beyond the in-memory parse result is a schema
question, deferred — see §12 OQ-13.

---

## §6 Verifier presentation contract

MASTERPLAN §18.5 Design Principle 2 requires that verification present interpretations a
layperson can actually judge, rather than transcriptions they can only approve. §26 states
plainly that the safety gate guarantees a human looked, not that the human was right. This
contract is how this dictionary narrows that gap.

For every match, the dashboard **must** render at minimum:

1. `matched_literal` — what the prescription actually says
2. `canonical_expansion` — what the parser took it to mean, in plain language
3. `rule_id` — which rule produced that meaning

And additionally, when applicable: the interpretation tier, the rule's `verifier_prompt`,
every entry in `candidate_readings`, every `missing_fields` entry, and every
`unparsed_fragments` entry.

The dashboard **must not** render the canonical expansion alone. Showing "twice daily"
without showing that it came from the literal `BD` via `FREQ-BD-001` reduces verification
to rubber-stamping: the verifier cannot detect that the parser matched the wrong token,
because the evidence has been hidden. A verifier who can see `BDS → twice daily` will
catch it; one who sees only `twice daily` cannot.

Ambiguous readings and unsupported fragments are **verifier-visible by construction**.
Neither may be hidden, collapsed to a default, or resolved by the parser.

### Marathi phrasing

Every entry carries a Marathi phrasing slot with status `pending-native-review`. **No
Marathi medical phrasing is authored in this document.** Inventing authoritative
native-language medical wording without native review is precisely the kind of confident
guess this dictionary is built to prevent, and a mistranslated dosing instruction is a
patient-safety defect rather than a copy defect. Ownership of that review is unassigned —
§12 OQ-12. Until it is assigned and completed, the English canonical expansion is the only
approved plain-language wording.

---

## §7 Dictionary entries

Nineteen rule identifiers across eight categories. Every `rule_id` is unique. Every entry
declares its tier, the fields it writes, and the fields it must leave `null`.

Each entry's **`Match type`** row lists the normalizations that rule may apply. It is **not**
the value recorded in provenance — that is resolved per match, and is `exact` whenever the text
needed no normalization at all. See §4 *Match types*.

Per-entry test expectations are brief and illustrative; cross-rule and adversarial cases
live in §11.

### §7.1 Category: `frequency`

#### The `OD` decision path

`OD` is **one decision path with two mutually exclusive outcomes**, not two independent
rules. Exactly one outcome fires for any given `OD` token. They can never both fire.

```
                          OD token matched
                                 |
                   evaluate OPHTHALMIC_CONTEXT predicate
                                 |
                 +---------------+---------------+
                 |                               |
        predicate FALSE                  predicate TRUE
                 |                               |
           FREQ-OD-001                     AMBIG-OD-001
      (deterministic: once daily)   (requires-verifier-decision)
```

**The `OPHTHALMIC_CONTEXT` predicate.** True if and only if, **within the same medication
line** as the `OD` token, at least one literal from this closed list appears:

`eye drop`, `eye drops`, `eyedrop`, `eyedrops`, `e/d`, `eye ointment`, `ophthalmic`,
`gtt`, `gtts`, `drop`, `drops`, `instil`, `instill`, `OS`, `OU`

Three constraints keep this narrow and prevent it becoming a clinical-context inference
engine:

- **The drug name is never consulted.** No drug list, no therapeutic-class lookup, no
  route inference from the medication itself. Drug identity belongs to MASTERPLAN §18.4
  and is out of scope here.
- **Only the current line is consulted.** The predicate never reads another medication
  line, the prescription header, or the diagnosis.
- **`OS`, `OU`, `gtt`, `gtts` are signal literals only.** They flip the predicate and are
  never themselves interpreted, expanded, or given rules. Ophthalmic laterality is not in
  v1 scope.

This is a literal-presence test on one line, nothing more. It is deliberately capable of
being wrong in both directions, which is why the true branch escalates to a human rather
than choosing a meaning.

#### `FREQ-OD-001` — `OD`, non-ophthalmic context

| | |
|---|---|
| Match forms | `OD`, `od`, `O.D.`, `o.d.` |
| Match type | `case-insensitive`, `punctuation-normalized` |
| Latin origin | *omni die* — every day |
| Fires when | `OPHTHALMIC_CONTEXT` is **false** |
| Canonical expansion | once daily |
| Writes | `frequency_code: ONCE_DAILY`, `times_per_day: 1` |
| Must remain null | all dose, duration, anchor, and conditional fields |
| Tier | `deterministic` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | None in this branch. The ophthalmic reading is excluded by the predicate. |
| On failure | Not applicable — a non-match routes to §10 |
| Verifier prompt | "Prescription says `OD`. Read as **once daily**. Correct?" |

Test expectations: `Tab Atorvastatin OD` → `ONCE_DAILY` via `FREQ-OD-001`. `Tab Amlo ODT`
→ no frequency match (boundary, §4).

#### `AMBIG-OD-001` — `OD`, ophthalmic context

| | |
|---|---|
| Match forms | Identical to `FREQ-OD-001` |
| Match type | `case-insensitive`, `punctuation-normalized` |
| Latin origin | *omni die* (every day) **or** *oculus dexter* (right eye) |
| Fires when | `OPHTHALMIC_CONTEXT` is **true** |
| Canonical expansion | **unresolved — two candidate readings** |
| Writes | `frequency_code: null`, `times_per_day: null`, `verifier_action_required: true`, `candidate_readings: [{once daily, AMBIG-OD-001}, {right eye, AMBIG-OD-001}]` |
| Must remain null | every interpretation field, including frequency |
| Tier | `requires-verifier-decision` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | In an ophthalmic line `OD` may denote once-daily frequency **or** the right eye. Both readings are common and the parser cannot distinguish them from notation alone. |
| On failure | Frequency stays `null`; no reminder schedule derivable from this token |
| Verifier prompt | "Prescription says `OD` on a line that appears ophthalmic. Does it mean **once daily** or **right eye**?" |

Test expectations: `Moxifloxacin eye drops 1 drop OD` → `AMBIG-OD-001`,
`frequency_code: null`, both readings present, `verifier_action_required: true`. Critically,
the parser must **not** emit `ONCE_DAILY` here.

#### `FREQ-BD-001` — `BD`

| | |
|---|---|
| Match forms | `BD`, `bd`, `B.D.`, `b.d.` |
| Match type | `case-insensitive`, `punctuation-normalized` |
| Latin origin | *bis die* — twice a day |
| Canonical expansion | twice daily |
| Writes | `frequency_code: TWICE_DAILY`, `times_per_day: 2` |
| Must remain null | all dose, duration, anchor, and conditional fields |
| Tier | `deterministic` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | None within scope. Which two times of day is a scheduler concern (OQ-06), not a parsing one. |
| On failure | Non-match routes to §10 |
| Verifier prompt | "Prescription says `BD`. Read as **twice daily**. Correct?" |

Test expectations: `1 tab BD` → `TWICE_DAILY`. `BDS` → no match (boundary, §4). `8D` → no
match (no character-substitution recovery, §4).

#### `FREQ-TDS-001` — `TDS`

| | |
|---|---|
| Match forms | `TDS`, `tds`, `T.D.S.`, `t.d.s.` |
| Match type | `case-insensitive`, `punctuation-normalized` |
| Latin origin | *ter die sumendus* — to be taken three times a day |
| Canonical expansion | three times daily |
| Writes | `frequency_code: THRICE_DAILY`, `times_per_day: 3` |
| Must remain null | all dose, duration, anchor, and conditional fields |
| Tier | `deterministic` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | None within scope. |
| On failure | Non-match routes to §10 |
| Verifier prompt | "Prescription says `TDS`. Read as **three times daily**. Correct?" |

Test expectations: `1 tab TDS × 5 days` → `THRICE_DAILY`. `T05` → no match. `TDSx` → no
match (boundary).

#### `FREQ-QID-001` — `QID` and `QDS`

| | |
|---|---|
| Match forms | `QID`, `qid`, `Q.I.D.`, `q.i.d.`, `QDS`, `qds`, `Q.D.S.`, `q.d.s.` |
| Match type | `case-insensitive`, `punctuation-normalized` |
| Latin origin | *quater in die* / *quater die sumendus* — four times a day |
| Canonical expansion | four times daily |
| Writes | `frequency_code: FOUR_TIMES_DAILY`, `times_per_day: 4` |
| Must remain null | all dose, duration, anchor, and conditional fields |
| Tier | `deterministic` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | None within scope. `QID` and `QDS` are treated as equivalent four-times-daily notations for v1. |
| On failure | Non-match routes to §10 |
| Verifier prompt | "Prescription says `{matched_literal}`. Read as **four times daily**. Correct?" |

One rule covers both literals, because their canonical meaning is identical in v1.
Provenance keeps them distinct: `matched_literal` records whichever form the prescription
actually used, so a `QDS` prescription never appears in the audit trail as having said
`QID`. Note the verifier prompt interpolates `matched_literal` rather than hard-coding a
form, so the verifier is always shown the text actually on the page.

### §7.2 Category: `circadian-anchor`

#### `ANCH-HS-001` — `HS`

| | |
|---|---|
| Match forms | `HS`, `hs`, `H.S.`, `h.s.` |
| Match type | `case-insensitive`, `punctuation-normalized` |
| Latin origin | *hora somni* — at the hour of sleep |
| Canonical expansion | at bedtime |
| Writes | `timing_anchors: ["BEDTIME"]` |
| Must remain null | every frequency, dose, and duration field |
| Tier | `deterministic-with-anchor` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | Bedtime is patient-specific and unknown to the parser. |
| On failure | Non-match routes to §10 |
| Verifier prompt | "Prescription says `HS`. Read as **at bedtime**. Correct?" |

**No clock time.** This rule emits the symbolic anchor `BEDTIME` and never a time value.
Converting `BEDTIME` to a clock time requires per-patient configuration that does not
exist at parse time; that resolution belongs to the reminder scheduler (OQ-06).

`HS` does **not** imply a frequency. `HS` alone means "at bedtime," not "once daily at
bedtime" — the once-daily reading requires a frequency token. Inferring one would be
exactly the accidental inference §2's category isolation exists to prevent.

Case semantics are subject to §12 OQ-11.

Test expectations: `Tab Alprazolam HS` → `timing_anchors: ["BEDTIME"]`,
`frequency_code: null`. No time value present anywhere in output.

### §7.3 Category: `meal-timing`

#### `TIME-AC-001` — `ac`

| | |
|---|---|
| Match forms | `ac`, `AC`, `a.c.`, `A.C.` |
| Match type | `case-insensitive`, `punctuation-normalized` |
| Latin origin | *ante cibum* — before food |
| Canonical expansion | before food |
| Writes | `timing_anchors: ["BEFORE_MEAL"]` |
| Must remain null | every frequency, dose, and duration field |
| Tier | `deterministic-with-anchor` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | How long before food is unspecified by the notation and is not inferred. Which meal is unspecified when no frequency is present. |
| On failure | Non-match routes to §10 |
| Verifier prompt | "Prescription says `ac`. Read as **before food**. Correct?" |

No clock time (see `ANCH-HS-001`). No frequency: `ac` modifies existing doses and never
creates them.

Test expectations: `1 tab BD ac` → `TWICE_DAILY` **and** `["BEFORE_MEAL"]`, from two
separate rules with separate provenance. `Predmet` → no `pc`/`ac` match (boundary).

#### `TIME-PC-001` — `pc`

| | |
|---|---|
| Match forms | `pc`, `PC`, `p.c.`, `P.C.` |
| Match type | `case-insensitive`, `punctuation-normalized` |
| Latin origin | *post cibum* — after food |
| Canonical expansion | after food |
| Writes | `timing_anchors: ["AFTER_MEAL"]` |
| Must remain null | every frequency, dose, and duration field |
| Tier | `deterministic-with-anchor` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | How long after food is unspecified and is not inferred. |
| On failure | Non-match routes to §10 |
| Verifier prompt | "Prescription says `pc`. Read as **after food**. Correct?" |

No clock time. No frequency.

Test expectations: `1 tab TDS pc` → `THRICE_DAILY` and `["AFTER_MEAL"]`.

### §7.4 Category: `conditional-use`

Both rules in this category are `no-schedule-derivable`, and both are bound by the same
prohibition, stated here once and referenced by each entry.

**The conditional-use prohibition.** A conditional-use rule must never produce
`max_doses_per_day`, `min_interval_hours`, or a reminder schedule. These are not defaulted,
estimated, or derived from the drug, the strength, or any other token. They remain `null`
unless explicitly present in the prescription data, or explicitly entered and confirmed
through the human verification workflow.

The reason is direct: "take when needed" with a fabricated ceiling of four per day is a
maximum dose the prescriber never wrote. For a drug with a real toxicity threshold —
paracetamol being the obvious case — an invented ceiling is a plausible-looking number
standing exactly where a safety limit should be. A `null` prompts a human to supply the
real limit; a guess prevents anyone from noticing it was never supplied.

#### `COND-SOS-001` — `SOS`

| | |
|---|---|
| Match forms | `SOS`, `sos`, `S.O.S.`, `s.o.s.` |
| Match type | `case-insensitive`, `punctuation-normalized` |
| Latin origin | *si opus sit* — if there is need |
| Canonical expansion | only if needed |
| Writes | `as_needed: true`, `schedule_derivable: false`, `verifier_action_required: true` |
| Must remain null | `max_doses_per_day`, `min_interval_hours`, `frequency_code`, `times_per_day` |
| Tier | `no-schedule-derivable` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | The trigger condition ("need") is clinical and not stated in notation. No dosing ceiling or minimum interval is stated. |
| On failure | No schedule generated. Reminder generation blocked pending human input. |
| Verifier prompt | "Prescription says `SOS` — take only if needed. No automatic reminders will be created. If there is a maximum number of doses per day or a minimum gap between doses, enter it from the prescription." |

Test expectations: `Tab Paracetamol 500mg SOS` → `as_needed: true`,
`schedule_derivable: false`, `max_doses_per_day: null`, `min_interval_hours: null`,
`frequency_code: null`. Strength is still captured by `STR-MASS-001`.

#### `COND-PRN-001` — `PRN`

| | |
|---|---|
| Match forms | `PRN`, `prn`, `P.R.N.`, `p.r.n.` |
| Match type | `case-insensitive`, `punctuation-normalized` |
| Latin origin | *pro re nata* — as the circumstance arises |
| Canonical expansion | only as needed |
| Writes | `as_needed: true`, `schedule_derivable: false`, `verifier_action_required: true` |
| Must remain null | `max_doses_per_day`, `min_interval_hours`, `frequency_code`, `times_per_day` |
| Tier | `no-schedule-derivable` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | As `COND-SOS-001`. |
| On failure | No schedule generated. Reminder generation blocked pending human input. |
| Verifier prompt | "Prescription says `PRN` — take only as needed. No automatic reminders will be created. If there is a maximum number of doses per day or a minimum gap between doses, enter it from the prescription." |

Test expectations: `1 tab PRN` → as `COND-SOS-001`. A `PRN` medication must never appear
in reminder-schedule output.

### §7.5 Category: `single-dose`

#### `DOSE-STAT-001` — `stat`

| | |
|---|---|
| Match forms | `stat`, `STAT`, `Stat` |
| Match type | `case-insensitive` |
| Latin origin | *statim* — immediately |
| Canonical expansion | immediately, as a single dose |
| Writes | `total_doses: 1`, `recurring: false`, `immediate: true`, `schedule_derivable: false` |
| Must remain null | `frequency_code`, `times_per_day`, all dose and duration fields |
| Tier | `deterministic` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | None as to notation: `stat` denotes a single immediate dose. |
| On failure | Non-match routes to §10 |
| Verifier prompt | "Prescription says `stat`. Read as **one dose, to be taken immediately**. Correct?" |

The notational meaning is deterministic, so the tier is `deterministic`. But
`schedule_derivable` is `false`, because a single immediate dose yields no recurring
schedule to derive, and "immediately" relative to a prescription written hours or days
before verification is not a time the parser can compute.

**The parser must not decide whether the dose was administered.** It records the intent —
one-time, non-recurring, immediate — and nothing about fulfilment. Whether a `stat` dose
was already given at the clinic, and what a reminder should do about it, belongs to the
verification and adherence workflows. See §12 OQ-10.

Test expectations: `Inj Diclofenac stat` → `total_doses: 1`, `recurring: false`,
`immediate: true`, `schedule_derivable: false`, `frequency_code: null`. `Tab Atorvastatin`
in text containing `statin` → no `stat` match (boundary, §4). No field anywhere in output
asserts administration.

### §7.6 Category: `dose-amount`

This category is the **only** source of `dose_amount` and `dose_unit`. See §7.7 for the
prohibition that keeps it separate from strength.

#### `AMT-TAB-001` — whole tablet counts

| | |
|---|---|
| Pattern | integer immediately followed by a tablet unit literal: `tab`, `tabs`, `tablet`, `tablets` |
| Match type | `regex` |
| Canonical expansion | *n* tablet(s) per dose |
| Writes | `dose_amount: n`, `dose_unit: tablet` |
| Must remain null | `dose_strength_value`, `dose_strength_unit`, all frequency fields |
| Tier | `deterministic` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | None when a countable unit is explicit. |
| On failure | Non-match routes to §10 |
| Verifier prompt | "Prescription says `{matched_literal}`. Read as **{n} tablet(s) per dose**. Correct?" |

Unit literals require token boundaries (§4), so `tabs` matches and `tablespoon` does not.

Test expectations: `2 tab BD` → `dose_amount: 2`, `dose_unit: tablet`, plus
`TWICE_DAILY` from a separate rule. `1 tablet` → `dose_amount: 1`.

#### `AMT-FRAC-001` — tablet fractions

| | |
|---|---|
| Pattern | a fraction literal `1/2`, `½`, `1/4`, `¼` followed by a tablet unit literal |
| Match type | `regex` |
| Canonical expansion | half / quarter tablet per dose |
| Writes | `dose_amount` as an **exact fraction**, `dose_unit: tablet` |
| Must remain null | `dose_strength_value`, `dose_strength_unit`, all frequency fields |
| Tier | `deterministic` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | None when the fraction and unit are both explicit. |
| On failure | Non-match routes to §10 |
| Verifier prompt | "Prescription says `{matched_literal}`. Read as **half a tablet** (or **quarter tablet**) per dose. Correct?" |

Fractions are preserved as exact fractions rather than converted to decimals. "Half a
tablet" is easier for an untrained verifier to sanity-check than `0.5`, and keeping doses
out of floating-point arithmetic removes a class of rounding defect from a safety-relevant
value before it can exist.

Test expectations: `1/2 tab OD` → `dose_amount: 1/2`, `dose_unit: tablet`, `ONCE_DAILY`.
`½ tablet HS` → `dose_amount: 1/2` plus `["BEDTIME"]`.

#### `AMT-VOL-001` — millilitre volumes

| | |
|---|---|
| Pattern | number (integer or decimal) followed by `ml` or `mL` |
| Match type | `regex` |
| Canonical expansion | *n* millilitres per dose |
| Writes | `dose_amount: n`, `dose_unit: ml` |
| Must remain null | `dose_strength_value`, `dose_strength_unit`, all frequency fields |
| Tier | `deterministic` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | None when the unit is explicit. |
| On failure | Non-match routes to §10 |
| Verifier prompt | "Prescription says `{matched_literal}`. Read as **{n} ml per dose**. Correct?" |

`ml` is a volume *amount*, not a strength. A syrup labelled `125mg/5ml` carries both a
strength and a volume; this rule captures only the volume, and the strength-to-volume
relationship is not computed anywhere in this dictionary.

Test expectations: `5 ml TDS` → `dose_amount: 5`, `dose_unit: ml`, `THRICE_DAILY`.

### §7.7 Category: `dose-strength`

#### `STR-MASS-001` — mass strengths

| | |
|---|---|
| Pattern | number (integer or decimal) followed by `mg`, `mcg`, or `g` |
| Match type | `regex` |
| Canonical expansion | strength of *n* {unit} |
| Writes | `dose_strength_value: n`, `dose_strength_unit` |
| Must remain null | **`dose_amount`, `dose_unit`**, all frequency and duration fields |
| Tier | `deterministic` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | None as to the strength itself. The strength does not state how much to take. |
| On failure | Non-match routes to §10 |
| Verifier prompt | "Prescription says `{matched_literal}`. Read as a **strength of {n} {unit}** — this is the tablet's strength, not how many to take. Correct?" |

**`dose_amount` is never inferred from `dose_strength`.** This is the single most important
prohibition in this category and it is absolute.

`Metformin 500 mg BD` states a strength and a frequency. It does **not** state an amount.
The parser must produce `dose_strength_value: 500`, `dose_strength_unit: mg`,
`frequency_code: TWICE_DAILY`, `times_per_day: 2` — and must leave `dose_amount: null`
and `dose_unit: null`. It must **not** conclude `dose_amount: 1, dose_unit: tablet`.

One tablet is the common case, not a stated fact. Where a 500 mg dose is supplied as two
250 mg tablets, the guess is wrong by a factor of two in a direction nobody would ever
audit, because `1 tablet` looks exactly like what a prescription would say. The absence is
therefore reported as missing information under §9 rather than filled in.

Unit matching requires token boundaries (§4): the `g` in `50 mcg` must not match as a
standalone gram unit.

Test expectations: `Metformin 500 mg BD` → strength 500 mg, `TWICE_DAILY`,
`dose_amount: null`, `dose_unit: null`, and `dose_amount` reported in `missing_fields`.
`Amoxicillin 500mg 1 tab TDS` → strength 500 mg from this rule **and** amount 1 tablet
from `AMT-TAB-001`, each with its own provenance. `50 mcg` → one strength match of
`50 mcg`, never a `g` match.

### §7.8 Category: `duration`

#### `DUR-DAYS-001` — day forms

| | |
|---|---|
| Pattern | `x N days`, `× N days`, `for N days`, `x N d`, `N/7` |
| Match type | `regex` |
| Canonical expansion | for *N* days |
| Writes | `duration_value: N`, `duration_unit: day` |
| Must remain null | all frequency and dose fields |
| Tier | `deterministic` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | Whether day 1 is the prescription date or the first dose date is not stated by the notation and is not inferred. |
| On failure | Non-match routes to §10 |
| Verifier prompt | "Prescription says `{matched_literal}`. Read as **for {N} days**. Correct?" |

The `N/7` form denotes *N* days out of a week in common Indian prescribing usage; `/` is
part of this pattern and is therefore not a boundary character (§4).

Test expectations: `1 tab BD × 5 days` → `duration_value: 5`, `duration_unit: day`.
`5/7` → same. Start-date semantics never appear in output.

#### `DUR-WEEKS-001` — week forms

| | |
|---|---|
| Pattern | `x N weeks`, `× N weeks`, `for N weeks`, `x N wks`, `N/52` |
| Match type | `regex` |
| Canonical expansion | for *N* weeks |
| Writes | `duration_value: N`, `duration_unit: week` |
| Must remain null | all frequency and dose fields |
| Tier | `deterministic` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | As `DUR-DAYS-001`. |
| On failure | Non-match routes to §10 |
| Verifier prompt | "Prescription says `{matched_literal}`. Read as **for {N} weeks**. Correct?" |

Weeks are **not** normalised to days. `2 weeks` is stored as `2` / `week`, preserving what
the prescription said; any conversion is the scheduler's business.

Test expectations: `× 2 weeks` → `duration_value: 2`, `duration_unit: week`, and
`duration_value` is not `14`.

#### `DUR-BARE-001` — bare duration, no unit

| | |
|---|---|
| Pattern | `x N` or `× N` with **no** unit literal following |
| Match type | `regex` |
| Canonical expansion | **unresolved — unit not stated** |
| Writes | `duration_value: null`, `duration_unit: null`, `verifier_action_required: true`, `candidate_readings: [{N days, DUR-BARE-001}, {N weeks, DUR-BARE-001}, {N doses total, DUR-BARE-001}]` |
| Must remain null | every duration field, plus all frequency and dose fields |
| Tier | `requires-verifier-decision` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | `× 5` may mean five days, five weeks, or five doses in total. All three are attested in real prescribing shorthand and the notation does not distinguish them. |
| On failure | Duration stays `null`; the verifier must supply the unit |
| Verifier prompt | "Prescription says `{matched_literal}` without a unit. Does it mean **{N} days**, **{N} weeks**, or **{N} doses in total**?" |

Days is the most common reading, which is exactly why it must not be assumed: a plausible
default here silently converts a five-week course into a five-day one.

Test expectations: `1 tab BD × 5` → `TWICE_DAILY`, `duration_value: null`, three candidate
readings, `verifier_action_required: true`. `× 5 days` → matches `DUR-DAYS-001`, not this
rule.

#### `DUR-CONTINUOUS-001` — continuous / lifelong wording

| | |
|---|---|
| Match forms | `continue`, `to continue`, `continuous`, `lifelong`, `life long` |
| Match type | `case-insensitive` |
| Canonical expansion | **unresolved — ongoing use, no end date stated** |
| Writes | `duration_indefinite: null`, `verifier_action_required: true`, `candidate_readings: [{indefinite ongoing use, DUR-CONTINUOUS-001}, {continue until next review, DUR-CONTINUOUS-001}]` |
| Must remain null | `duration_value`, `duration_unit`, all frequency and dose fields |
| Tier | `requires-verifier-decision` |
| Marathi | *pending native review* (OQ-12) |
| Ambiguity | "Continue" may mean indefinitely, or only until a review appointment the prescription does not name. An indefinite reminder schedule created from an ambiguous word is a schedule nobody chose. |
| On failure | `duration_indefinite` stays `null`; no indefinite schedule generated |
| Verifier prompt | "Prescription says `{matched_literal}`. Should this medication continue **indefinitely**, or only **until the next review**?" |

`duration_indefinite` becomes `true` only on explicit verifier confirmation, never from
this rule alone.

Test expectations: `Tab Thyronorm OD continue` → `ONCE_DAILY`, `duration_indefinite: null`,
two candidate readings, `verifier_action_required: true`. No indefinite schedule is
derivable before confirmation.

---

## §8 Composition rules

A single medication line usually contains tokens from several categories. Composition is
**declarative only**: the parser assembles independently-matched fields into one structured
medication candidate and derives nothing new in the process.

### Rules of composition

1. **Independent matching.** Each rule matches on its own against the raw text. No rule's
   result is used as input to another rule's matching.
2. **Category isolation is preserved through composition.** Composition never writes a
   field that no rule wrote. If `1 tab BD ac × 5 days` produced four matches, the composed
   candidate contains exactly the union of those four rules' outputs and nothing more.
3. **Provenance is per-field, not per-line.** Each composed field retains the five §5
   provenance values from the rule that produced it. A composed candidate therefore carries
   several provenance records, not one.
4. **Anchors accumulate.** `timing_anchors` is an array precisely so multiple anchor rules
   can contribute. `BD pc` yields `["AFTER_MEAL"]` alongside `TWICE_DAILY`.
5. **No cross-category derivation.** Frequency plus duration does not produce a total dose
   count. Strength plus volume does not produce a strength-per-dose. Frequency plus anchor
   does not produce clock times. Each of these is arithmetic the prescription did not
   perform, and performing it silently converts transcription into inference.
6. **`verifier_action_required` is sticky.** If any contributing rule sets it `true`, the
   composed candidate is `true`. One ambiguous token makes the whole line require review.
7. **`schedule_derivable` is conjunctive.** If any contributing rule sets it `false`, the
   composed candidate is `false`. A single non-schedulable token blocks schedule derivation
   for the line.

### Conflict handling

If two rules from the **same** category produce contradictory values for the same field —
for example a line containing both `BD` and `TDS` — the parser must **not** choose. It
records both matches with their provenance, writes `null` to the contested field, sets
`verifier_action_required: true`, and populates `candidate_readings` with both. Picking the
first, the last, or the "more likely" one would be a silent resolution of a genuine
contradiction, and a prescription containing two frequencies is a prescription a human
needs to look at.

---

## §9 Completeness and missing-information reporting

### What `missing_fields` means

**`missing_fields` means: a field required to construct the downstream actionable
instruction is absent from the prescription data.**

It does **not** mean "every field the prescription did not contain." Most absences are
legitimate and reporting them all would flood the verifier with noise, which is its own
safety failure — a verifier who is shown twenty non-problems will stop reading the
twenty-first item, which is the real one.

Reporting a field as missing is never the same as inventing a value for it. The parser's
options are report-absent or leave-`null`; guessing is not among them.

### When each field is reported missing

| Field | Enters `missing_fields` when | Never reported missing when |
|---|---|---|
| `dose_amount` | The line is **instruction-bearing** (a `frequency`, `meal-timing`, `circadian-anchor`, or `conditional-use` rule matched) **and** no `dose-amount` rule matched | The line is not instruction-bearing, or an amount was parsed |
| `frequency_code` | A `dose-amount` rule matched but no `frequency`, `conditional-use`, or `single-dose` rule did — an amount with no "how often" | A conditional-use or single-dose rule matched, since neither has a recurring frequency by definition |
| `max_doses_per_day` | A `conditional-use` rule matched | On any non-conditional medication |
| `min_interval_hours` | A `conditional-use` rule matched | On any non-conditional medication |

**`dose_amount` is not automatically required for every medication.** It is required only
when the line already carries an instruction the patient is meant to act on. A line with no
frequency, no anchor, and no conditional marker is not an actionable instruction, so
demanding an amount for it would be reporting a problem that does not exist.

### Fields never reported missing

`dose_strength_value` and `dose_strength_unit` are frequently and legitimately absent —
`1 tab Crocin BD` is a complete, actionable instruction with no strength in it. `timing_anchors`
is optional by nature. `duration_value` and `duration_unit` are absent from a large share of
real prescriptions, particularly for ongoing medication, and treating that as an error would
misreport normal prescribing as incomplete. `duration_indefinite` is verifier-set only.

### Reason codes

Each entry carries a reason. Two are defined:

- `absent_from_prescription` — no rule matched and no value is present in the source text.
- `requires_verifier_entry` — the value cannot come from the prescription text at all and
  must be entered by a human. Used for `max_doses_per_day` and `min_interval_hours` on
  conditional-use medications.

### The canonical example

`Metformin 500 mg BD` produces:

| Field | Value | Source |
|---|---|---|
| `dose_strength_value` | `500` | `STR-MASS-001` |
| `dose_strength_unit` | `mg` | `STR-MASS-001` |
| `frequency_code` | `TWICE_DAILY` | `FREQ-BD-001` |
| `times_per_day` | `2` | `FREQ-BD-001` |
| `dose_amount` | `null` | no `dose-amount` rule matched |
| `dose_unit` | `null` | no `dose-amount` rule matched |
| `missing_fields` | `[{dose_amount, absent_from_prescription}]` | §9 completeness check |
| `verifier_action_required` | `true` | missing actionable field |

The verifier is asked how many tablets make up one dose. The parser does not answer that
question, and `dose_amount: 1, dose_unit: tablet` never appears anywhere in this output.

### Relationship to the safety gate

`missing_fields` is advisory to the verifier and is **not** a substitute for the
verification gate in MASTERPLAN §26. An empty `missing_fields` array does not mean a
medication is safe to deliver; it means the parser found no *absent* required field. Every
medication still requires explicit human confirmation regardless of what this section
reports.

---

## §10 Unsupported-token protocol

### The rule

**No OCR text is ever silently dropped.** Any fragment the parser does not match against a
§7 rule is preserved verbatim and surfaced to the verifier.

An unmatched fragment is appended to `unparsed_fragments` as `{text, source_span}`, where
`text` is the byte-for-byte source substring and `source_span` locates it in the raw OCR
text. The dashboard renders these as text that was not understood (§6).

### What the parser must not do with an unsupported token

- **Must not guess.** No interpretation is produced for a token absent from §7, however
  medically plausible a reading might be. `OM`, `ON`, `qwk`, `SL`, `IM`, and every other
  unlisted abbreviation are unsupported, not inferable.
- **Must not repair.** No edit-distance, character-substitution, or fuzzy recovery (§4).
  `8D` becomes an unparsed fragment, not `BD`.
- **Must not drop.** Discarding an unrecognised fragment is the most dangerous available
  behaviour, because it makes an instruction the parser could not read look like an
  instruction that was not there. A verifier shown `TDS` alone cannot know the prescription
  also said something the parser skipped.
- **Must not route to an LLM as a primary interpreter.** MASTERPLAN §18.3 permits LLM
  assistance only as a documented, clearly-flagged fallback for genuinely ambiguous
  fragments, never as the silent default. Any such fallback must be marked as
  LLM-originated in provenance and must remain verifier-visible. It may never write a
  safety-relevant field without human confirmation, and it may never be invoked in place of
  a §7 rule.

### Unsupported versus ambiguous

Both remain verifier-visible, and the distinction is about which array they land in.
*Unsupported* means no rule matched, so no interpretation exists — the fragment goes to
`unparsed_fragments`. *Ambiguous* means a rule matched but yielded more than one plausible
reading — the readings go to `candidate_readings` and the field stays `null`. Neither is
ever resolved by the parser.

---

## §11 Conceptual test cases

These cases are stated for human review and for a future implementer to transcribe into
Jest tests **by hand**. Nothing parses this section. There is no fixture generator, no
Markdown or YAML extraction step, and no test helper that reads this file.

Each future test should name the `rule_id` it covers so traceability from specification to
test survives without coupling this document to the build.

### Cross-rule and composition cases

| # | Input | Must produce |
|---|---|---|
| 1 | `Metformin 500 mg BD` | strength 500 mg, `TWICE_DAILY`; `dose_amount: null`; `dose_amount` in `missing_fields` |
| 2 | `Amoxicillin 500mg 1 tab TDS` | strength 500 mg **and** amount 1 tablet, `THRICE_DAILY`; separate provenance per field |
| 3 | `1 tab BD pc × 5 days` | amount 1 tablet, `TWICE_DAILY`, `["AFTER_MEAL"]`, 5 days; four provenance records |
| 4 | `1 tab QDS` vs `1 tab QID` | identical canonical output; `matched_literal` differs (`QDS` / `QID`) |
| 5 | `Tab Atorvastatin OD` | `ONCE_DAILY` via `FREQ-OD-001` |
| 6 | `Moxifloxacin eye drops 1 drop OD` | `AMBIG-OD-001`; `frequency_code: null`; both candidate readings; **not** `ONCE_DAILY` |
| 7 | `Tab Paracetamol 500mg SOS` | `as_needed: true`, `schedule_derivable: false`, `max_doses_per_day: null`, `min_interval_hours: null`; strength still captured |
| 8 | `1 tab BD × 5` | `TWICE_DAILY`; `duration_value: null`; three candidate readings |
| 9 | `Inj Diclofenac stat` | `total_doses: 1`, `recurring: false`, `immediate: true`, `schedule_derivable: false`; nothing about administration |
| 10 | `Tab Thyronorm OD continue` | `ONCE_DAILY`; `duration_indefinite: null`; two candidate readings |
| 11 | `1 tab BD TDS` | contradiction: `frequency_code: null`, both matches recorded, `verifier_action_required: true` |
| 12 | `× 2 weeks` | `duration_value: 2`, `duration_unit: week` — **not** `14` days |
| 13 | `Tab Alprazolam HS` | `["BEDTIME"]`, `frequency_code: null`, no clock time anywhere in output |
| 14 | `1/2 tab OD` | `dose_amount: 1/2` as an exact fraction (not `0.5`), `dose_unit: tablet`, `ONCE_DAILY` |

### Boundary and substring-trap cases

| # | Input | Must produce |
|---|---|---|
| 15 | `Tab Amlo ODT` | no `OD` match |
| 16 | `BDS` | no `BD` match |
| 17 | `Tab Atorvastatin` (contains `statin`) | no `stat` match |
| 18 | `TDSx` | no `TDS` match |
| 19 | `Predmet` | no `pc` and no `ac` match |
| 20 | `50 mcg` | one strength match of `50 mcg`; no standalone `g` match |
| 21 | `Give 1 tab BD.` | `BD` matches; terminal period is not part of the token |

### Adversarial OCR cases — must all become unparsed fragments

| # | Input | Must produce |
|---|---|---|
| 22 | `8D` | unparsed fragment, **not** `BD` |
| 23 | `T05` | unparsed fragment, **not** `TDS` |
| 24 | `l tab` (lowercase L) | unparsed fragment, **not** `1 tab` |
| 25 | `0D` (zero) | unparsed fragment, **not** `OD` |
| 26 | `OM` | unparsed fragment; no interpretation invented |

### Dictionary-wide invariants

Assertions the parser test suite should make about the dictionary as a whole:

1. Every `rule_id` in §7 is unique.
2. No rule writes a field its entry lists under "must remain null."
3. Every field a rule writes is permitted by its category in §2.
4. Every `no-schedule-derivable` rule yields `schedule_derivable: false`.
5. No rule writes `max_doses_per_day` or `min_interval_hours`.
6. No rule writes a clock time to any field.
7. Exactly one of `FREQ-OD-001` / `AMBIG-OD-001` fires for any `OD` token — never both,
   never neither.
8. Every match carries all five §5 provenance fields.

---

## §12 Open semantic questions

Items this document cannot settle on its own. Each has a **mandated interim behaviour** so
the specification is implementable now, and each interim behaviour is the conservative
option. Four are tracked in `PercriptionSetuMASTERPLAN.md` §37; one is already covered by an
existing entry there.

| Ref | Question | Interim behaviour |
|---|---|---|
| OQ-10 | Should a `stat` dose ever generate a reminder, given verification happens after the dose was due? Who determines whether it was already administered? | `DOSE-STAT-001` records one-time/immediate intent with `schedule_derivable: false` and asserts nothing about administration |
| OQ-11 | Is letter case semantically meaningful in local prescribing (`HS` vs `hs`)? `BUILD_ORDER.md` §4 lists both separately. | Treated as a listing artifact; case folding permitted per §4. **This is the one interim assumption that would invalidate `match_forms` across every rule if wrong** |
| OQ-12 | Who reviews and signs off Marathi phrasing, and does this dictionary hold fixed phrasing or does Bhashini translate at delivery? | Every entry marked `pending-native-review`; no Marathi values authored or shipped |
| OQ-13 | Should `dictionary_version` be persisted with stored parse results so a historical interpretation can be re-evaluated after a rule changes? | Required in the in-memory parse result (§5); storage deferred to the schema task |
| **OQ-06** *(existing)* | Anchor resolution — who converts `BEDTIME` / `BEFORE_MEAL` / `AFTER_MEAL` into clock times? | **Already covered by MASTERPLAN §37 OQ-06**, which owns default meal times and assigns them to the reminder scheduler. No duplicate question created. This dictionary emits symbolic anchors only |

**Non-blocking residual.** Whether ophthalmic prescriptions appear in the corpus at all is
unknown. The `OD` decision path handles both cases, so `AMBIG-OD-001` may simply never
fire in practice. Worth knowing; not worth waiting on.

None of the above blocks implementing the parser against this specification.

---

## §13 Proposed future additions

Deliberately **excluded** from v1. Listed so the exclusion is a recorded decision rather
than an oversight, and so nobody adds them casually. Each requires human review and a
`docs/DECISIONS.md` entry before entering §7.

**Frequency and timing:** `QOD` / alternate-day dosing, `Q4H`-style interval notation,
`OM` (*omni mane*, morning), `ON` (*omni nocte*, night), `weekly` / `qwk`.

**Route and form:** `PO`, `IV`, `IM`, `SC`, `SL`, `PR`, `top`, `neb`, `puff`. Route is
absent from v1 entirely.

**Ophthalmic laterality:** `OS`, `OU`, `OD`-as-right-eye as a *resolved* reading. Currently
`OS` and `OU` are signal literals only (§7.1) and carry no interpretation.

**Dose forms and units:** `cap` / capsules, `IU` international units, `drops` as a countable
dose amount, `tsp` / `tbsp`, `sachet`, `mg/kg` weight-based dosing.

**Tapering and complex regimens:** step-down schedules (`2-1-1`), the `1-0-1` positional
frequency notation common on Indian prescriptions, `SOS` with an explicit stated ceiling.

**Why each is excluded now.** Route and form do not affect reminder timing, which is what
this phase delivers. Weight-based dosing requires patient weight and real dose arithmetic —
a materially larger safety surface. Positional notation such as `1-0-1` is genuinely common
locally and is the strongest candidate for the next addition, but it needs corpus evidence
to pin down before it can be specified rather than assumed. Tapering schedules need a
medication-lifecycle model (MASTERPLAN §18.10) that is specified but not built.

---

## §14 Changelog

Append-only. The parser pins a `dictionary_version` and records it in provenance (§5), so a
version bump is a semantic event and not merely editorial.

Versioning: **major** for a breaking change to an existing rule's meaning or output
contract, **minor** for new rules or new fields, **patch** for clarifications that cannot
change parser behaviour.

| Version | Date | Change |
|---|---|---|
| `0.1.0` | 2026-08-23 | Initial specification. 19 rule identifiers across 8 categories covering the approved minimum scope: `OD` (decision path), `BD`, `TDS`, `QID`/`QDS`, `HS`, `ac`, `pc`, `SOS`, `PRN`, `stat`, tablet counts, tablet fractions, `ml` volumes, mass strengths, day/week/bare durations, continuous wording. Five interpretation tiers, exact-match-only policy with mandatory token boundaries, five-field provenance, `missing_fields` semantics, unsupported-token protocol. Status DRAFT — `match_forms` provisional pending corpus validation; §12 unresolved. |
| `0.1.0` *(amended in place)* | 2026-08-26 | **§4 *Match types* and the §5 `match_type` row clarified** (D-027): `match_type` records the normalization *this* match actually required — `exact` for an untouched declared form, `case-insensitive` for case folding alone, `punctuation-normalized` when a token-internal period was stripped, `regex` for pattern rules; most-transforming value wins when two apply; whitespace trimming never affects it. A §7 preamble note states that each entry's `Match type` row lists *permitted* normalizations, not the recorded value. No rule's `match_forms`, writes, `Must remain null` set, tier, or meaning changed, and no match type was added or removed. |
| `0.1.0` *(amended in place)* | 2026-08-27 | **§4 boundary set completed** (D-029): `.` is a boundary character, **except** where the period forms part of a candidate matching a dotted `match_forms` entry declared by the rule being evaluated. §4 also now states that boundary checking is edge validation on a candidate rather than tokenisation, because splitting the input on `.` would break `STR-MASS-001`'s decimals (`2.5 mg`). Closes the contradiction between §4's enumerated delimiter list — which omitted `.` — and the three places requiring `Give 1 tab BD.` to match `BD`: §4's own terminal-period hazard note, §11 case 21, and `API_CONTRACTS.md` §12.5. No rule's `match_forms`, writes, `Must remain null` set, tier, or meaning changed; every required negative (`ODT`, `BDS`, `statin`, `TDSx`, `Predmet`, `50 mcg`, `8D`) is period-free and so unaffected. |

**Why the version was not bumped.** Amendment in place is permitted only while this document is
DRAFT and no parser has been built against it. `0.1.0` has never been implemented, so no stored
provenance record and no build pins it, and there is no superseded reading for a consumer to be
holding. Bumping to `0.1.1` would announce a semantic event to consumers that do not exist while
invalidating every in-flight reference to `0.1.0` across `API_CONTRACTS.md` and `SCHEMA.md`. The
first bump to `0.1.1` or beyond happens once a parser exists that pins a version — after which
amendment in place is no longer available and every change, however small, takes a new number.

**Why the 2026-08-27 amendment is the last one permitted in place.** It is the boundary case: it
lands in the *same task* as the first parser implementation, which does pin `0.1.0`. It lands
before that implementation exists and before any commit — the repository has no commits at all —
so no artifact has ever claimed `0.1.0` under the old §4, and there is still no superseded reading
for a consumer to hold. From this point the allowance above is spent.
