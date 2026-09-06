# API_CONTRACTS.md

> Contract specification for the internal boundaries of PrescriptionSetu.
>
> **This is a contract, not an implementation.** It states *what* crosses each boundary —
> the shape, the value domains, the guarantees, and the prohibitions — and deliberately does
> **not** state how any of it is computed. It contains no algorithm, no matching strategy, no
> TypeScript source, no SQL, no DDL, no migration, no HTTP route, no controller, and no
> library choice. Those are downstream tasks that must conform to this document.
>
> **This version specifies one boundary only:** the Phase 1 shorthand parser
> (raw OCR text → structured medication data). The other boundaries this file will eventually
> own are named but left empty in §13, so the document cannot be mistaken for complete.

**Version:** 0.1.0 (DRAFT)
**Date:** 2026-08-25 (amended in place 2026-08-26 — §5 `match_type`; see §15)
**Status:** Draft for review. No parser, no tests, and no types exist yet. The parser contract
(§2–§12) is complete enough to write failing tests against (§12). §13 is empty by intent.

---

## 0. What this contract guarantees and does not guarantee

Two claims below are easy to conflate and only one of them is true. Stating both plainly is a
requirement, not a courtesy (`SAFETY_INVARIANTS.md` §2; MASTERPLAN §26 "What this rule does
and does not guarantee"; `SCHEMA.md` §0).

### 0.1 Guaranteed

These are structural properties of the parser boundary. Each is testable, and §12 says how.

- **Determinism.** The same input text always produces the same output. There is no clock, no
  randomness, no I/O, no network call, no ambient configuration, and no accumulated state
  between calls (§3).
- **Purity.** The input string is not mutated, and nothing outside the returned value is
  written — including logs (SI-16, §3.6).
- **Traceability.** Every effective field the parser writes carries the five provenance fields
  (SI-04; dictionary §5; §5 below), so every parsing decision traces back to the exact raw OCR
  fragment it came from (MASTERPLAN §26).
- **No invention.** No field is populated by inference, default, or convenience. A field no
  rule wrote is `null`, and `null` means "the prescription did not say" (dictionary §2, "No
  defaults, ever"; §4.4 below).
- **No loss.** Text the parser could not interpret is preserved verbatim as an unparsed
  fragment with its span; it is never guessed at, repaired, or silently dropped (SI-06;
  dictionary §10; §6.3 below).
- **Ambiguity and contradiction stay visible.** Where a token has more than one supported
  reading, or where two matches disagree about one field, the parser reports the alternatives
  and flags the line for a human instead of choosing (SI-05, SI-13; §6.1, §6.2).
- **Exactness of amounts.** Dose amounts preserve exact integer or fractional semantics and
  are never represented in floating point (§7).

### 0.2 Not guaranteed — and never to be implied

- **Medical correctness.** Nothing in this contract asserts that a parsed reading is clinically
  right, safe, appropriate for the patient, or consistent with the prescriber's intent. The
  parser reports what the text says under a reviewed dictionary; it has no clinical knowledge
  and no drug knowledge.
- **Deliverability.** Parser output is **never itself deliverable to a patient or caregiver**.
  It is an input to the human verification gate, not a result that has passed it (SI-01, SI-02,
  SI-03, SI-15; §8.1).
- **Completeness of the input.** The parser sees OCR output, not the prescription. Anything the
  OCR stage lost is invisible to it, and its absence from the output is not evidence of its
  absence from the prescription.
- **Safety by empty report.** An empty `missing_fields` array does not mean a medication is safe
  to deliver (dictionary §9). No combination of parser output values constitutes clearance.
- **Correctness of a human confirmation.** The gate downstream ensures a human *looked*; it
  cannot ensure the human was *right* (`SAFETY_INVARIANTS.md` §2). This document must not be
  read, cited, or extended as if any parser or verification state meant "medically correct."

---

## 1. Scope and authority

### 1.1 Authority order

Where this file appears to conflict with a higher authority, **this file is wrong and must be
corrected**. It realises other documents' requirements as a boundary shape; it does not get to
soften them.

1. **`SAFETY_INVARIANTS.md`** (v1.0.0, STABLE) — required behaviour. Wins over everything here.
2. **`docs/SHORTHAND_DICTIONARY.md`** (`dictionary_version` 0.1.0) — the authoritative parser
   specification: rule IDs, shorthand meanings, output field names, enum values, permitted
   normalizations, token boundaries, composition rules, and the unsupported-token protocol.
3. **MASTERPLAN** §18.3 (parsing module), §20 (service boundary), §21 (schema rule), §26
   (auditability), §30 (testing strategy).
4. **`docs/DECISIONS.md`** — recorded architectural decisions (D-001 … D-025). Binding unless a
   later entry supersedes them.
5. **`docs/SCHEMA.md`** — peer authority, authoritative on *storage* shape. §10 below states
   compatibility with it and must not contradict it.
6. **This file** — last. It loses every conflict.

### 1.2 What this document does not introduce

This contract **invents nothing semantic**. It introduces no rule ID, no shorthand meaning, no
output field, no enum value, no reason code, no match type, no token boundary, and no fallback
behaviour. Every such name below already exists in the dictionary or `SCHEMA.md` and is
reproduced verbatim. If a name here does not appear in an authoritative document, that is a
defect in this file.

### 1.3 Names this document does introduce

Only *container* names — the envelope and record types that hold dictionary-defined fields. They
carry no new semantics and no new clinical meaning:

| Name | What it is |
|---|---|
| `ParseResult` | The envelope returned by one parser call (§4.1). |
| `MedicationCandidate` | One medication line's structured interpretation (§4.2). |
| `MatchRecord` | One rule firing and its five provenance fields (§5). |
| `matches` | The list of every `MatchRecord` for a candidate (§5.2). |
| `field_provenance` | The per-effective-field provenance map (§5.3). |

The element shapes of `candidate_readings` (`{reading, rule_id}`), `missing_fields`
(`{field, reason}`) and `unparsed_fragments` (`{text, source_span}`) are **dictionary-defined**
(dictionary §2); any type name later given to them is a convenience, not a new contract.

### 1.4 Scope of this version

**In scope:** the parser boundary — §2 through §12.

**Not in scope, and named in §13 so their absence is visible:** the Node↔Python `OcrProvider`
boundary (`BUILD_ORDER.md` Step 3), the verification-view render contract (SI-05, SI-15,
dictionary §6), HTTP endpoints, and the delivery/reminder boundaries.

---

## 2. The contract boundary

```
  image bytes                raw OCR text              ParseResult              confirmed data
      │                           │                        │                         │
      ▼                           ▼                        ▼                         ▼
┌─────────────┐            ┌─────────────┐          ┌──────────────┐         ┌───────────────┐
│ Python OCR  │───text +──▶│  (persist)  │──text───▶│    parse()   │────────▶│ HUMAN         │──▶ delivery
│ service     │  confidence│ prescriptions│         │  TypeScript  │         │ VERIFICATION  │
│ perception  │            │.raw_ocr_text │         │  apps/api    │         │ GATE (SI-01)  │
└─────────────┘            └─────────────┘          └──────────────┘         └───────────────┘
                                 │                         ▲                         │
                            confidence ─────── X ───────────┘                 nothing downstream
                            never crosses this line                           of the gate is the
                            (§3.4, D-021)                                     parser's concern
```

**Upstream of the parser.** The Python service does *perception only*: pixels in, raw text plus
confidence out. It performs no interpretation (MASTERPLAN §20; D-001).

**The parser.** TypeScript, inside `apps/api`, sharing types with the verification gate through
`packages/shared-types` (D-001; MASTERPLAN §20; `BUILD_ORDER.md` Step 1). One entry point (§3.1).

**Downstream of the parser.** A human verification gate, then persistence, then scheduling, then
delivery. **Parser output is an input to the gate, never a result that has passed it.**

**The parser is not responsible for**, and this contract grants it no authority over: human
verification; patient or caregiver delivery; reminder scheduling or clock-time resolution;
medical correctness; drug identity or fuzzy drug-name matching; and inventing any clinical value
the prescription did not state.

---

## 3. Input contract

### 3.1 Entry point

```
parse(rawOcrText: string) → ParseResult
```

One required argument. No second argument. No options object (§3.4).

### 3.2 Text-content identity

`rawOcrText` **must contain exactly the same text content** that is — or will be — persisted as
`prescriptions.raw_ocr_text` for the prescription being parsed (`SCHEMA.md` §2.4, §8).

This is a requirement about *text content*, not about bytes. This contract names no character
encoding, and conformance must not be described or tested as byte identity: the same text may be
held in memory, on the wire, and in the database under different encodings and still satisfy
this clause. What must not differ is the sequence of characters.

**Why it matters.** Every `source_span` in the output is a pair of offsets into this exact
string (§5.1). If the string the parser saw differs from the string the offsets are later
resolved against, every offset silently points at the wrong text — silently, because a
plausible-looking fragment is still returned. That would break the MASTERPLAN §26 guarantee that
every parsing decision traces back to the exact raw OCR fragment it came from, and it would
break it without any error being raised.

### 3.3 Caller prohibitions

Before calling `parse`, a caller **must not**:

- trim or strip leading or trailing whitespace;
- pad the text;
- Unicode-normalize it (no NFC, NFD, NFKC, or NFKD);
- repair, substitute, or "correct" any character, including confusable characters that OCR
  commonly produces (dictionary §11 cases #22–#26 exist precisely so that such repair is
  *asserted against*, not performed);
- alter line endings, or convert between them;
- reflow, re-wrap, join, split, or re-order lines;
- otherwise transform the text in any way.

A caller that needs a transformed copy of the OCR text for some other purpose may make one, but
must not pass it to `parse`, and must not persist it as `prescriptions.raw_ocr_text`.

### 3.4 What must not enter the parser

| Excluded input | Why |
|---|---|
| **OCR confidence** (overall or per-block) | Interpretation must not vary with perception confidence. A confidence-conditioned interpretation is a silent threshold on the safety-critical path — the same failure mode D-007 rejected when it refused a parser confidence score. Confidence belongs to routing and review-prioritisation decisions made *outside* the parser (D-021). |
| **Patient context** (age, meal times, history, language) | Interpretation of shorthand must not depend on who the patient is. Anchor→clock-time resolution is a scheduling concern using `patients.meal_times` (OQ-06), downstream of the gate. |
| **Drug list / drug identity** | The dictionary forbids consulting the drug name in the one place a reader might expect it (dictionary §7.1: the ophthalmic predicate is literal-presence only and "the drug name is never consulted"). Drug validation is a separate module (MASTERPLAN §18.4) and is advisory (`SCHEMA.md` §2.5). |
| **Locale** | Case folding is ASCII-only and locale-invariant (§4.5). A locale parameter would make the same text parse differently in different runtimes. |
| **Clock / current time / timezone** | A pure function of text cannot depend on when it ran. No rule writes a clock time (dictionary §11 invariant 6). |
| **Options object / feature flags / thresholds** | Every option is a second behaviour that must be separately reviewed and tested, and a caller-selectable interpretation is exactly the silent decision boundary the project's safety framing rejects. |

### 3.5 `dictionary_version` is build-pinned

The parser build pins exactly one `dictionary_version` — the version declared by the dictionary
revision the build was written against (currently `0.1.0`, dictionary §14). It is **not** a
parameter, **not** caller-supplied, **not** configurable at call time, and **not** read from the
environment. It is recorded in provenance on every match (dictionary §5, §14).

Consequence: two parser builds pinned to different dictionary versions may legitimately produce
different output for the same text, and the provenance says which build produced which reading.
A caller cannot ask for a different dictionary version; that requires a different build.

### 3.6 The parser performs no logging

The parser writes nothing to any log, stream, console, metric, or trace. This is stronger than
redaction: raw OCR text and drug names must never appear in plaintext logs (SI-16; MASTERPLAN
§26; `AGENTS.md` §8), and a pure function that emits no diagnostics cannot leak them. Callers
that need observability log record identifiers around the call, never its argument or its return
value.

### 3.7 Difficult input is valid input

Empty, whitespace-only, garbled, wholly unsupported, control-character-bearing, non-Latin-script,
and very long inputs are all **valid inputs** that produce a successful `ParseResult`. They are
not errors. See §9.

---

## 4. Output contract

The shapes below are stated in an illustrative notation for readability. **They are not a code
artifact**; no type definitions are created by this document, and the notation is not a
prescription for how the types must be written.

### 4.1 `ParseResult` — the envelope

```
ParseResult {
  candidates:          MedicationCandidate[]
  unparsed_fragments?: { text, source_span }[]   // envelope level — see §4.1.1 and §10.2
}
```

`candidates` is the list of medication interpretations found in the text. It may be empty; an
empty list is a successful result meaning "no medication line was recognised" (§9.2).

#### 4.1.1 Envelope-level `unparsed_fragments`

Text that could not be attributed to any medication candidate at all — a header, a footer, a
stray line, an entirely unrecognised block — is reported here rather than being dropped
(SI-06; dictionary §10, "No OCR text is ever silently dropped"). This is distinct from the
candidate-level `unparsed_fragments` of §4.2, which cover text *inside* a recognised medication
line.

**These envelope-level fragments have no defined storage location today.** `medications.parse_result`
is per-medication (`SCHEMA.md` §2.5), so it cannot hold text that belongs to no medication. This
is an unresolved gap recorded as **discovered gap #2** (§14.2). This document does **not** resolve
it and invents no column, table, side channel, or second storage representation for it.

### 4.2 `MedicationCandidate` — one medication line

```
MedicationCandidate {
  // effective clinical fields (§4.3) — every one nullable, no defaults
  frequency_code, times_per_day, timing_anchors,
  dose_amount, dose_unit, dose_strength_value, dose_strength_unit,
  duration_value, duration_unit, duration_indefinite,
  as_needed, total_doses, recurring, immediate,
  schedule_derivable, verifier_action_required,

  // dictionary-defined reporting arrays (§6)
  candidate_readings:  { reading, rule_id }[]
  missing_fields:      { field, reason }[]
  unparsed_fragments:  { text, source_span }[]

  // provenance (§5)
  matches:             MatchRecord[]
  field_provenance:    { <effective field name> → MatchRecord | MatchRecord[] }
}
```

A `MedicationCandidate` is **self-contained**: it carries its own effective values, its own
reporting arrays, and its own complete provenance, with no pointer into any other candidate and
no reliance on the envelope. This is the property that makes it storable verbatim in
`medications.parse_result` (§10.1).

### 4.3 Effective clinical field reference

Every field name, type, and value domain below is reproduced verbatim from the dictionary's
"Structured output field reference" (dictionary §2) and matches the `medications` column names in
`SCHEMA.md` §2.5. **Every one of these fields may be `null`.**

| Field | Value domain | Writing category (dictionary §2) |
|---|---|---|
| `frequency_code` | `ONCE_DAILY` · `TWICE_DAILY` · `THRICE_DAILY` · `FOUR_TIMES_DAILY` | frequency |
| `times_per_day` | integer 1–4 | frequency |
| `timing_anchors` | array of `BEDTIME` · `BEFORE_MEAL` · `AFTER_MEAL` | timing-anchor |
| `dose_amount` | exact integer or exact fraction — never a decimal (§7) | dose-amount |
| `dose_unit` | `tablet` · `ml` | dose-amount |
| `dose_strength_value` | numeric | dose-strength |
| `dose_strength_unit` | `mg` · `mcg` · `g` | dose-strength |
| `duration_value` | integer | duration |
| `duration_unit` | `day` · `week` | duration |
| `duration_indefinite` | boolean | duration |
| `as_needed` | boolean | conditional-use |
| `total_doses` | integer | single-dose |
| `recurring` | boolean | frequency / single-dose |
| `immediate` | boolean | single-dose |
| `schedule_derivable` | `false` or `null` — see §4.7 | control |
| `verifier_action_required` | boolean — sticky, see §4.8 | control |

Anchors **accumulate** rather than replace: a line bearing more than one timing anchor yields
more than one element in `timing_anchors`, each with its own provenance (dictionary §8 rule 4;
§5.3 below).

`duration_unit` values are reported as matched; weeks are **not** normalised to days (dictionary
§7.8).

### 4.4 No defaults, ever

No field is populated because a value is usual, likely, or convenient. A field that no rule wrote
is `null`, and `null` carries information: *the prescription did not say* (dictionary §2;
`SCHEMA.md` §1). Consumers must therefore distinguish "absent" from "zero", "false", and "empty",
and must never substitute a default of their own — a default applied downstream reintroduces
exactly the invented instruction the parser refused to produce.

`SCHEMA.md` §1 carries the storage counterpart of this rule: no column holding parser-derived
clinical data has a database default.

### 4.5 Matching constraints inherited from the dictionary

These are stated here because the output cannot be reasoned about without them, and restated
without alteration (dictionary §4; D-009):

- Matching is **exact** after exactly three permitted normalizations: case folding;
  token-internal period stripping, and only for `match_forms` the dictionary declares in dotted
  form; and trimming of whitespace surrounding a candidate token.
- Case folding is **ASCII-only and locale-invariant**. The same text must fold identically in
  every runtime and under every system locale. (The dictionary does not state this explicitly;
  recorded as **discovered gap #6**, §14.6.)
- **No** edit-distance, phonetic, n-gram, or character-substitution matching, and no OCR repair
  (D-009).
- Matches must be delimited by **token boundaries**: start of string, end of string, whitespace,
  or one of `, ; : ( ) [ ] |`. `/` is deliberately **not** a boundary, because supported forms
  such as `5/7` and `e/d` depend on it (dictionary §4).
- Consequently `ODT` never matches `OD`, `BDS` never matches `BD`, `TDSx` never matches `TDS`,
  `statin` never matches `stat`, `Predmet` never matches `pc`, and the `g` in `50 mcg` is never
  read as a strength unit (dictionary §4, §11 cases #15–#21).

### 4.6 Fields structurally absent from parser output

"Absent" here means **not present in the output shape at all** — not "present and null". A
consumer cannot read them, cannot set them, and a future rule cannot populate them without a
visible, reviewable change to this contract.

| Absent from parser output | Authority |
|---|---|
| `max_doses_per_day` | SI-08; dictionary §2 (in no category's permitted writes), §7.4, §11 invariant 5; D-011, D-020 |
| `min_interval_hours` | SI-08; same as above |
| `drug_name` | No dictionary rule authorises drug-name extraction — **discovered gap #1** (§14.1), D-025 |
| any clock time | dictionary §11 invariant 6; anchor→time resolution is a scheduling concern |
| `tier` | §5.4; D-022 |
| `canonical_expansion` | §5.4; D-022 |
| any confidence score or probability | D-007 (a number invites a threshold); D-021 |

**On the two SI-08 fields specifically.** They are the most dangerous fields in the system to
guess: a fabricated ceiling is a maximum dose the prescriber never wrote, sitting exactly where a
real safety limit belongs (D-011). Making them structurally unwritable is stronger than a policy
of not writing them.

They may appear in parser output in exactly **one** way: as the `field` value of a
`missing_fields` entry, with reason `requires_verifier_entry`, when a conditional-use rule has
fired (dictionary §9). That is a *report that a human must supply the value*, not a slot the
parser could fill. A human verifier may later enter and confirm such a value when the prescription
itself states one; that is human-verified data, not parser output (`SCHEMA.md` §2.5; D-020).

### 4.7 `schedule_derivable` is fail-safe and currently never `true`

`schedule_derivable` is conjunctive: it is `false` if **any** contributing rule disproves
derivability, and no rule may raise it back (dictionary §8 rule 7).

In `dictionary_version` 0.1.0, **no rule sets it to `true`.** Rules can only disprove it (for
example the conditional-use rules, dictionary §7.4; D-011). The contract therefore fixes the
fail-safe reading:

- `false` — a contributing rule explicitly disproved derivability.
- `null` — not disproven, and **not established either**. `null` is not permission.

**Consumers must require `schedule_derivable === true`** before generating any schedule
(`SCHEMA.md` §2.5, §9). Because nothing currently produces `true`, the correct present-day
behaviour is that the parser alone never authorises a schedule. Treating `null` as "probably
fine" would invert the invariant. This asymmetry — a field that can only ever be lowered — is
recorded as **discovered gap #3** (§14.3); it is a gap in the rule set, not a licence to relax
the check.

### 4.8 `verifier_action_required` is sticky

Once any rule sets `verifier_action_required` to `true`, nothing clears it (dictionary §8 rule 6).
No later match, no absence of a match, and no consumer may lower it. It is set by, among others,
ambiguity (§6.1) and contradiction (§6.2).

---

## 5. Provenance

Every match records **exactly five fields** (dictionary §5; SI-04). Not four, not six.

```
MatchRecord {
  rule_id             // the dictionary rule that fired, e.g. FREQ-BD-001
  dictionary_version  // build-pinned (§3.5)
  matched_literal     // the source text the span covers, as it appears in the input
  source_span         // { start, end } — half-open, Unicode code points (§5.1)
  match_type          // the normalization this match required (§5, below) — exactly one of four
}
```

| Field | Contract |
|---|---|
| `rule_id` | One of the **19** rule IDs the dictionary defines (§12.2). Rule IDs are unique (dictionary §11 invariant 1). |
| `dictionary_version` | The version pinned by the parser build (§3.5). It appears **only** inside `MatchRecord`; there is no envelope-level or candidate-level copy, and no top-level storage column (`SCHEMA.md` §8; D-015). This placement does **not** resolve OQ-13 (§14.8). |
| `matched_literal` | The source text the span covers, reproduced as it appears in the input. It is **never** overwritten with the canonical or expanded form of the token (dictionary §5). It survives independently of the input string, so it remains readable even if the raw OCR text is later removed (`SCHEMA.md` §8). |
| `source_span` | See §5.1. |
| `match_type` | Exactly one of `exact`, `case-insensitive`, `punctuation-normalized`, `regex` (dictionary §5) — the normalization *this* match required, resolved as below. |

**`match_type` is a fact about the matched text, not about the rule.** It records the
normalization this particular match actually required, so one rule yields different values on
different input (dictionary §4; D-027):

| Text matching `FREQ-BD-001` | `match_type` |
|---|---|
| `BD` — a declared `match_forms` literal, matched untouched | `exact` |
| `bd` — case folded | `case-insensitive` |
| `B.D.` and `b.d.` — token-internal periods stripped | `punctuation-normalized` |

Where two normalizations apply to one match, the most-transforming one is recorded:
`punctuation-normalized` over `case-insensitive` over `exact`. Rules that match by declared
pattern rather than by literal always record `regex`, whatever the input's case. Whitespace
trimming never affects the value. The dictionary's per-entry `Match type` row lists the
normalizations a rule *may* apply and is **not** the recorded value — a rule listing
`case-insensitive`, `punctuation-normalized` records `exact` for input that needed neither.

Provenance is **per field, not per medication** (dictionary §8 rule 3): two fields on the same
candidate written by two different rules carry two different `MatchRecord`s.

### 5.1 `source_span` semantics

`source_span` is `{ start, end }`, a **half-open interval `[start, end)`** measured in **Unicode
code points** over the exact input string of §3.2.

Stated without room for interpretation:

- **Zero-based.** The first code point of the input is at offset `0`.
- **`start` is inclusive** — it is the number of code points that precede the matched text.
- **`end` is exclusive** — it is the number of code points that precede the first code point
  *after* the matched text. The code point at offset `end` is **not** part of the match.
- **`end - start` is the length of the match in code points.**
- **`end >= start` always.** `end === start` denotes an empty span; no match produces one.
- **The text lying at offsets `start` through `end - 1`, inclusive, is exactly
  `matched_literal`.** This is the read-back property, and §12.4 requires it be asserted.
- Offsets are resolved against the input string of §3.2 and against
  `prescriptions.raw_ocr_text` (`SCHEMA.md` §8) — which §3.2 requires to hold the same text.

#### Why code points

Code points are a property **of the text**. Byte counts and code-unit counts are properties of a
*chosen encoding of* the text, and grapheme boundaries are the output of a *versioned algorithm*
over the text. Only the first is stable across the languages, runtimes, storage engines, and
library versions this offset must survive — which is the whole requirement, since a span is
written by TypeScript, stored as JSON, read back by TypeScript, possibly inspected in SQL, and
must denote the same characters every time. Compatibility with any particular engine's substring
indexing is a *consequence* of that choice, not a reason for it.

#### Rejected units

| Rejected unit | Why rejected |
|---|---|
| **UTF-8 byte offsets** | A property of one encoding, not of the text. The same characters yield different offsets under a different encoding, and a byte offset can land mid-character, which is a representable but meaningless span. |
| **UTF-16 code-unit offsets** | Also a property of an encoding. Characters outside the Basic Multilingual Plane count as two units, so offsets diverge from character counts exactly where OCR of non-Latin scripts and symbols is most likely to produce them, and a surrogate half is again a representable but meaningless boundary. |
| **Grapheme-cluster offsets** | Defined by UAX #29, which is **versioned**: the same text can segment differently under a later Unicode revision, so a stored offset could change meaning without the text changing. Storing an offset whose interpretation drifts under a dependency upgrade is disqualifying for an audit record. |

#### JavaScript's default indexing is not the contract unit

**Native JavaScript string indexing, `String.prototype.length`, `slice`, `substring`, and
`charAt` operate on UTF-16 code units, and are therefore NOT the unit of this contract.** For
text confined to the Basic Multilingual Plane the two coincide, which is precisely why the
divergence is easy to ship and hard to notice; §12.4 requires a fixture whose text does not
coincide.

This document specifies the **unit**, not the mechanism. How an implementation converts between
its runtime's native indexing and code-point offsets is an implementation concern and is
deliberately unspecified here.

#### Retention dependency

A span is only meaningful against the text it was computed from. `SCHEMA.md` §8 records the
unresolved dependency: MASTERPLAN §26 defines deletion for raw *images* and is silent on raw OCR
text, so a retention or erasure policy that removed `prescriptions.raw_ocr_text` would leave every
stored span dangling. `matched_literal` survives such a deletion; the offsets do not. This
contract does not resolve that dependency and must not be read as authorising the deletion.

### 5.2 `matches` — every rule firing

`matches` records **every** rule that fired for the candidate, **including matches that wrote no
field**. A non-writing match is not noise; it is the evidence that:

- every match carries all five provenance fields, which is dictionary §11 invariant 8 and is only
  auditable if non-writing matches are present;
- a contested field is `null` because two rules disagreed, not because nothing matched (§6.2,
  dictionary §8 conflict handling);
- a rule the reader expected to fire did, or did not.

### 5.3 `field_provenance` — per effective field

`field_provenance` maps each effective field the parser **wrote** to the provenance of the write:

- one `MatchRecord` per written scalar field;
- for `timing_anchors`, **provenance is per array element** — each anchor carries the
  `MatchRecord` of the rule that contributed it (dictionary §8 rule 4);
- a field that is `null` has no `field_provenance` entry. Absence of an entry means no rule wrote
  the field, which is the same information `null` carries.

Each `MatchRecord` here is **self-contained**: it repeats all five fields rather than referring
into `matches`. This is deliberate. `SCHEMA.md` §8 requires the five provenance fields to be
readable per effective field from stored `parse_result`, and a reference that must be resolved
through another array is a reference that can be lost, reordered, or misread. The duplication is
of *match-specific facts* about this input text, which is the class of fact provenance exists to
record.

### 5.4 What provenance deliberately omits

**`tier` is not parser output.** The five interpretation tiers (dictionary §3; D-007) are
properties of a *rule*, not observations about the input, and every safety consequence a tier
carries is already an explicit output field: `verifier_action_required` for
`requires-verifier-decision`, `schedule_derivable` for `no-schedule-derivable`, an
`unparsed_fragments` entry for `unsupported`. Emitting the tier as well would invite downstream
code to branch on the enum instead of reading those fields — a second, weaker decision path over
the same facts, which is the failure mode D-007 rejected when it refused a confidence score.

**`canonical_expansion` is not parser output.** It is fully determined by `rule_id` +
`dictionary_version`, and it is *prose*. Copying prose into the immutable `parse_result`
(`SCHEMA.md` §2.5) would fossilise wording that a patch-level dictionary revision — explicitly
defined as a clarification that cannot change parser behaviour (dictionary §14) — is entitled to
reword, leaving stored records disagreeing with the dictionary about a rule's own description.

Both are **resolved by consumers** from `rule_id` + `dictionary_version` against shared rule
metadata in `packages/shared-types`. The verification view's obligation to render
`matched_literal`, `canonical_expansion`, and `rule_id` together, and never the canonical
expansion alone (dictionary §6), is therefore satisfied by resolution at render time, not by
storage. The render contract itself is reserved to §13.2.

Recorded as **D-022**. Rejecting these two is what makes "exactly five fields" a checkable
statement rather than a minimum.

---

## 6. Ambiguity, contradiction, unsupported input, and missing fields

These four are different failure modes requiring different verifier actions, and the contract
keeps them distinct rather than collapsing them into one "could not parse" bucket (D-007).

### 6.1 Ambiguity — reported, never resolved

Where a supported token has more than one supported reading in its context, the parser **reports
every reading and chooses none** (SI-05):

- the contested field is left `null`;
- each reading is added to `candidate_readings` as `{ reading, rule_id }` (dictionary §2);
- `verifier_action_required` is set `true` (§4.8);
- the firing is recorded in `matches` with full provenance (§5.2).

The dictionary's own instances are `AMBIG-OD-001` — `OD` on a line bearing an
`OPHTHALMIC_CONTEXT` literal, where it may mean *once daily* or *oculus dexter*, the right eye
(dictionary §7.1; D-012) — and `DUR-BARE-001`, where a bare duration number yields three candidate
readings (dictionary §7.8). Exactly one of `FREQ-OD-001` and `AMBIG-OD-001` ever fires, never both
(dictionary §11 invariant 7).

**A consumer must not resolve ambiguity by picking a reading.** Selecting the first element, the
most common reading, or the "safer-looking" one re-creates the choice the parser refused to make
and removes the evidence that a choice existed.

### 6.2 Contradiction — recorded unresolved

Where two matches disagree about the value of one field, the parser records the disagreement and
resolves nothing (SI-13; dictionary §8, conflict handling):

- the contested field is `null`;
- **both** matches are recorded in `matches`, each with its own complete provenance;
- `verifier_action_required` is `true`;
- `candidate_readings` is populated with the competing readings.

No precedence rule, no ordering rule, no "last match wins", and no scoring exists to break the
tie. A contradiction is information about the prescription — it means the text says two things —
and silently resolving it would delete that information while producing a confident-looking value.

### 6.3 Unsupported input — preserved, never repaired

For text the dictionary does not cover, the parser **must not**:

- guess a meaning;
- repair, correct, or substitute characters to reach a recognisable token;
- drop the text;
- route the text to an LLM as the primary interpreter (dictionary §10; MASTERPLAN §18.3 Design
  Principle; SI-06).

Instead the text is preserved as an `unparsed_fragments` entry — `{ text, source_span }`
(dictionary §2) — at candidate level if it lies within a recognised medication line, or at
envelope level if it does not (§4.1.1). **No OCR text is ever silently dropped** (dictionary §10).

This is why the adversarial-OCR cases of dictionary §11 (#22–#26: `8D`, `T05`, `l tab`, `0D`, `OM`)
exist as *negative* assertions: the correct behaviour for each is an unparsed fragment, never a
repaired token. A missed token costs a verifier seconds; a repaired token produces a confident
instruction that looks exactly like a correct one (D-009).

### 6.4 Missing fields — reported with a reason

`missing_fields` entries are `{ field, reason }` (dictionary §2), and `reason` is exactly one of
the two dictionary-defined codes (dictionary §9):

| Reason code | Meaning |
|---|---|
| `absent_from_prescription` | The prescription did not state this field. |
| `requires_verifier_entry` | A human must supply this value; the parser structurally cannot (the SI-08 ceiling fields under a conditional-use rule are the case the dictionary names — §4.6). |

The dictionary's canonical example is `Metformin 500 mg BD`, which yields a strength and a
frequency and reports `dose_amount` as missing — it never yields `dose_amount: 1`,
`dose_unit: tablet` (dictionary §7.7, §9; SI-07; D-010).

**An empty `missing_fields` array does not mean a medication is safe to deliver** (dictionary §9).
It means no rule identified a specific gap. Deliverability is decided by the gate and the
deliverable predicate (`SCHEMA.md` §2.5), never by this array.

---

## 7. Exact amounts

`dose_amount` carries a quantity per administration. The dictionary preserves such quantities as
**exact fractions**, specifically to keep dose quantities out of floating-point arithmetic
(dictionary §7.6, `AMT-FRAC-001`). Supported fractional literals are `1/2`, `½`, `1/4`, and `¼`.

**The contract representation is exact and non-floating-point:**

```
dose_amount =
    { kind: "integer",  value: <exact integer> }
  | { kind: "fraction", numerator: <exact integer>, denominator: <exact integer> }
```

Requirements:

- **Floating-point representation is prohibited.** `½` is `{ kind: "fraction", numerator: 1,
  denominator: 2 }`. It is never `0.5`, never `.5`, and never a float of any width. `¼` is
  `1/4`, never `0.25`. (D-024.)
- The **exact source token is independently preserved** in `matched_literal` (§5), so a `½`
  written on the prescription remains recoverable as `½` regardless of how the quantity is
  represented.
- **`dose_amount` is never derived from `dose_strength_value`** (SI-07; dictionary §7.7; D-010).
  The two are independent fields written by two different categories, and no cross-category
  derivation is permitted (dictionary §8 rule 5). This holds in both directions and for every
  consumer: a downstream component must not synthesise a dose amount from a strength either.
- `dose_unit` is `tablet` or `ml` and is written only by the dose-amount category.

**Storage remains open, with one constraint.** `SCHEMA.md` §2.5 and §10 leave the
`medications.dose_amount` column encoding undecided (a `text` token versus a numerator/denominator
pair), requiring only that it not be a float. This contract does **not** close that item. It adds
one requirement to whatever encoding is chosen: the stored value must be **losslessly derivable
from this representation, and this representation losslessly recoverable from it.** An encoding
that cannot round-trip `½` is disqualified by the same reasoning that disqualified the float.

---

## 8. Safety-invariant mapping

Invariant numbering is taken from **`SAFETY_INVARIANTS.md` v1.0.0 (STABLE)**, which is canonical.
`SI-id`s are traceability keys used in test names (D-008; §12.3), so mis-numbering one propagates
into the test suite. Earlier working notes on this task mis-numbered three of them; the canonical
assignments are **SI-08** (PRN/SOS ceilings), **SI-09** (STAT), and **SI-13** (contradictions).
Canonical SI-10 is stopping-versus-verification and canonical SI-12 is lifecycle and revisions;
neither is a parser concern.

### 8.1 Invariants this contract carries

| Invariant | What the parser boundary does |
|---|---|
| **SI-01 / SI-02 / SI-03 / SI-15** — verification gate; nothing unverified reaches a patient | **Parser output is never itself deliverable.** It is an input to the gate. This contract defines no path from `ParseResult` to any patient-facing surface, and grants no consumer permission to construct one. Delivery requires the deliverable predicate on persisted, human-confirmed data (`SCHEMA.md` §2.5). |
| **SI-04** — verified data retains provenance | Exactly five provenance fields per match, per written field (§5). |
| **SI-05** — ambiguity stays verifier-visible | `candidate_readings` + `verifier_action_required`; no reading is chosen (§6.1). |
| **SI-06** — unsupported shorthand never guessed | No fuzzy matching, no repair, no guessing, no dropping, no LLM-primary interpretation; text preserved as unparsed fragments (§4.5, §6.3). |
| **SI-07** — dose amount never inferred from strength | `dose_amount` and `dose_strength_value` are independent; no cross-category derivation; the gap is reported via `missing_fields` (§6.4, §7). |
| **SI-08** — PRN/SOS never acquire an invented maximum or interval | `max_doses_per_day` and `min_interval_hours` are **structurally absent** from parser output, not merely null (§4.6). Conditional-use tokens yield no ceiling, no interval, and no schedule: `as_needed: true`, `schedule_derivable: false` (dictionary §7.4; D-011). They may appear only as `missing_fields` references with reason `requires_verifier_entry`. |
| **SI-09** — STAT does not imply administration | `DOSE-STAT-001` records one-time / immediate **intent only** (`immediate`, `total_doses`). The parser asserts nothing about whether a dose was administered, triggers no adherence record, and creates no administration action. Who owns a STAT dose remains **OQ-10** (dictionary §7.5). |
| **SI-13** — contradictions never silently resolved | Contested field `null`, both matches recorded, flagged for a verifier (§6.2). |
| **SI-16** — sensitive data not in plaintext logs | The parser performs **no logging at all** (§3.6), and no error path emits input text (§9.4). |

### 8.2 Invariants outside this boundary

SI-10 (stop authorization, bearing on OQ-05), SI-11 (atomic cancellation), SI-12 (lifecycle
transitions and revisions), and SI-14 (audit trail) are properties of persistence, lifecycle, and
delivery. The parser neither enforces nor weakens them. SI-05 and SI-15 additionally name this
file as the future home of the verification-view render contract and provider seams — reserved to
§13.2 and §13.1, not written here.

### 8.3 No medical-correctness guarantee is created

Nothing in §8.1 should be read as a claim about clinical correctness. Every invariant above is a
structural property: what the parser must not invent, must not resolve, and must not hide. The
residual risk that a *misreading* is confirmed by a human is unchanged by this contract and is
recorded in `SAFETY_INVARIANTS.md` §2 and §8, and MASTERPLAN §26.

---

## 9. Failure contract

The parser distinguishes two categories, and consumers must keep them distinguishable.

### 9.1 Domain outcomes always return successfully

Every outcome that is *about the text* — however poor the text is — is a successful call that
returns a `ParseResult`. This includes, without exception:

| Input | Result |
|---|---|
| empty string | success; no candidates |
| whitespace-only | success; no candidates |
| garbled or corrupted OCR | success; unparsed fragments (never repaired — §6.3) |
| wholly unsupported content | success; unparsed fragments |
| control characters present | success; preserved, not stripped |
| non-Latin script | success; preserved, spans measured in code points (§5.1) |
| very long input | success; **never silently truncated** |

Difficulty is not an error. Truncation, stripping, or normalising the input to make it tractable
would violate §3.3 and would invalidate every span.

### 9.2 "No candidates" is a real, distinct answer

An empty `candidates` list means *no medication line was recognised in this text*. It is a
meaningful, successful result, and it is not interchangeable with a failure. Accompanying
`unparsed_fragments` show what the text actually contained.

### 9.3 Exceptions are reserved for input-contract violations

The parser may throw **only** when it was called wrongly — the argument is not a string
(`null`, `undefined`, a number, an object, a missing argument). That is a programming error at the
call site, not a fact about a prescription.

**Consumers must not catch such a failure and substitute an empty result.** Collapsing an invalid
invocation into "no medication found" makes a broken call site indistinguishable from a blank
prescription, and the broken call site then fails silently and permanently. The two must remain
distinguishable.

### 9.4 No partial results, no leaking errors

If the parser throws, it returns nothing — there is no partially populated `ParseResult` to
inspect. Any error raised carries no raw OCR text, no drug name, and no fragment of the input,
because such a message would be logged by the caller and would breach SI-16 (§3.6).

---

## 10. Storage compatibility

This section states how parser output relates to the storage shape `SCHEMA.md` already defines. It
introduces **no** column, table, index, side channel, JSON blob, or second storage representation,
and it does not modify `SCHEMA.md`.

### 10.1 `MedicationCandidate` → `medications.parse_result`

A `MedicationCandidate` is **currently storable verbatim** in `medications.parse_result` (jsonb).
`SCHEMA.md` §2.5 defines that column as the **immutable** full parser output *for this line*,
holding `candidate_readings`, `missing_fields`, `unparsed_fragments`, and per-field five-field
provenance — which is exactly the content of §4.2 and §5. This is why §4.2 requires the candidate
to be self-contained: no field of it needs a value that lives elsewhere.

Consequences inherited from `SCHEMA.md`:

- `parse_result` is written once and **never mutated**; a revision creates a new `medications` row
  with its own `parse_result` (`SCHEMA.md` §2.5, §9; SI-12).
- Effective values are copied into their own `medications` columns, whose names match the field
  names of §4.3 verbatim.
- `dictionary_version` is persisted **only** inside the provenance objects; there is no top-level
  column (`SCHEMA.md` §2.5, §8; D-015).

§12.4 requires a test that a `MedicationCandidate` survives a JSON round-trip without loss.

### 10.2 `ParseResult` is **not** claimed to be persistable without loss

The envelope is a different thing from a candidate, and the distinction is load-bearing:

| | Contains | Current storage |
|---|---|---|
| **`ParseResult`** | `candidates[]`, and **may** contain envelope-level `unparsed_fragments[]` | **No single location.** Its candidates are storable individually (§10.1); its envelope-level fragments have **no defined storage location**. |
| **`MedicationCandidate`** | one medication line's fields, reporting arrays, and provenance | Storable **verbatim** in `medications.parse_result`. |

**This document does not claim that a complete `ParseResult` is currently persistable without
loss.** Envelope-level `unparsed_fragments` (§4.1.1) belong to no medication, so the per-medication
`parse_result` column cannot hold them, and no other column is defined for them. That is
**discovered gap #2** (§14.2) and it remains **unresolved** here. Inventing a column, a table, or a
convention to absorb them would resolve a schema question inside a contract document, which is not
this file's authority (§1.1).

Until it is resolved, an implementation must not silently discard envelope-level fragments to make
persistence succeed. Discarding them would breach SI-06 and dictionary §10 ("No OCR text is ever
silently dropped") in order to fit a storage shape — the wrong direction of accommodation.

### 10.3 OQ-13 is not resolved

Whether `dictionary_version` additionally needs first-class persistence — so that "all rows parsed
under dictionary vX" is queryable after a rule changes — is **OQ-13**, open (MASTERPLAN §37;
`SCHEMA.md` §8, §10; D-015). Placing it inside provenance (§5) satisfies the parser's requirement
without deciding the storage question, and this file leaves it open (§14.8).

---

## 11. Non-goals

The parser boundary explicitly does not do, and this contract does not authorise:

- **Human verification.** The parser produces the material a verifier judges; it never stands in
  for one (SI-01).
- **Patient or caregiver delivery.** No output of `parse` is a message, and none may be rendered
  to a patient-facing channel (SI-02, SI-15).
- **Reminder scheduling or clock-time resolution.** Timing anchors are reported as anchors;
  resolving them to times uses `patients.meal_times` (OQ-06) after the gate.
- **Medical correctness, clinical reasonableness, or dose checking.** No ceiling, no interaction
  check, no plausibility check (SI-08; D-011).
- **Drug identification, drug-name extraction, or fuzzy drug matching** (§14.1; D-025; D-009).
- **OCR, OCR repair, or perception of any kind** (MASTERPLAN §20; D-001).
- **Inventing any clinical value the prescription did not state** (dictionary §2; §4.4).
- **LLM interpretation of shorthand.** An LLM SHALL NOT be the primary parsing mechanism for
  safety-relevant fields (MASTERPLAN §18.3; dictionary §10; SI-06). Nothing in this contract
  creates a fallback seam for one.
- **Persistence, transactions, or queries.** No SQL, DDL, migration, or ORM concern appears here.
- **Transport.** No HTTP route, controller, request/response envelope, status code, or
  serialisation format for the parser boundary — `parse` is an in-process function call (D-001).

---

## 12. Test contract

### 12.1 Test-first is required; tests are not created by this document

Tests for the parser **must be written before the parser is implemented** (`AGENTS.md` §8;
MASTERPLAN §28, §30; `BUILD_ORDER.md` §7, Step 1; D-008). **This task creates no tests.** This
section is the specification the first test file must satisfy, so that the failing test can be
written against a contract rather than against an intuition.

The dictionary is never machine-parsed to generate tests; each test is written by hand from it and
named after what it covers (D-008).

### 12.2 Coverage: all 19 rule IDs

One or more tests per rule ID, using only examples the dictionary supports (dictionary §7, §11):

`FREQ-OD-001` · `AMBIG-OD-001` · `FREQ-BD-001` · `FREQ-TDS-001` · `FREQ-QID-001` ·
`ANCH-HS-001` · `TIME-AC-001` · `TIME-PC-001` · `COND-SOS-001` · `COND-PRN-001` ·
`DOSE-STAT-001` · `AMT-TAB-001` · `AMT-FRAC-001` · `AMT-VOL-001` · `STR-MASS-001` ·
`DUR-DAYS-001` · `DUR-WEEKS-001` · `DUR-BARE-001` · `DUR-CONTINUOUS-001`

**No new clinical examples may be invented.** If a case is not supported by the dictionary or
MASTERPLAN, it does not belong in the suite.

### 12.3 Naming

Tests are named for the `rule_id` or the `SI-id` they cover (D-008; dictionary §11; MASTERPLAN
§30), so that a reader can go from a safety invariant or a dictionary rule to the test that holds
it without searching. Invariant tests are named for the invariant.

Parser unit tests are writable now for **SI-05, SI-06, SI-07, SI-08, SI-09, and SI-13**
(`SAFETY_INVARIANTS.md` §5, §6). SI-04 is testable now at the parser level (provenance
completeness); its persistence half comes later.

### 12.4 Required structural and property tests

| Test | Asserts |
|---|---|
| **Deterministic repeatability** | The same input parsed repeatedly yields identical output. No clock, no randomness, no state carried between calls (§3). |
| **Input immutability** | The input string is unchanged after the call, and no output field aliases mutable parser state (§3, purity). |
| **`source_span` read-back** | For every `MatchRecord`, the text at offsets `start` … `end - 1` equals `matched_literal`. **State this in code-point terms**; asserting it with the runtime's native UTF-16 indexing would test the wrong unit and would pass for the wrong reason (§5.1). |
| **Code-point vs UTF-16 divergence fixture** | At least one fixture whose text contains characters outside the Basic Multilingual Plane, so that code-point offsets and UTF-16 code-unit offsets **diverge**. A suite built only from BMP text cannot detect the wrong unit (§5.1). |
| **JSON round-trip for `MedicationCandidate`** | A candidate serialised and deserialised is unchanged, including every provenance field and every exact amount — the property `medications.parse_result` storage depends on (§10.1). |
| **No floating-point fraction representation** | A parsed `½` is an exact fraction. Assert positively that it is `1/2` **and** negatively that no `0.5` (or float of any width) appears anywhere in the output or its serialisation (§7; D-024). |
| **Text conservation at parser level** | Every region of the input is accounted for: covered by a match span, or reported as an unparsed fragment. Nothing is silently dropped, and long input is never truncated (§6.3, §9.1). |
| **Locale-invariant ASCII case folding** | The same text folds identically regardless of ambient locale, and folding is ASCII-only (§4.5; gap #6, §14.6). |
| **Parser logging prohibition** | The parser emits nothing to any log, console, stream, metric, or trace during any call, including error paths (§3.6; SI-16). |
| **Provenance completeness** | Every `MatchRecord` carries all five fields, and every written effective field has a `field_provenance` entry — including per-element entries for `timing_anchors` (§5.3; dictionary §11 invariant 8). |
| **Exactly five provenance fields** | No `MatchRecord` carries a sixth field, and specifically no `tier` and no `canonical_expansion` (§5.4; D-022). |
| **Category isolation** | No field is written by a rule whose category does not permit it (dictionary §2, §8 rule 2). |

### 12.5 Required negative and safety cases

These assert what the parser must **not** do. They are the cases most likely to be "fixed" by a
well-meaning future change, so each needs a test that fails loudly.

**Boundary and substring traps** (dictionary §4, §11 cases #15–#21):

- `OD` vs `ODT` — `ODT` must not yield a frequency.
- `BD` vs `BDS` — `BDS` must not yield `TWICE_DAILY`.
- `TDS` vs `TDSx` — `TDSx` must not yield `THRICE_DAILY`.
- `stat` vs `statin` — a drug name ending in `statin` must not yield `immediate`.
- `Predmet` vs `pc` / `ac` — a drug name must not yield a meal-timing anchor.
- `50 mcg` — the trailing `g` must not be read as a separate strength unit, and `mcg` must not
  reduce to `mg`.
- `Give 1 tab BD.` — a terminal sentence period must not prevent the `BD` match (period stripping
  applies only to declared dotted `match_forms`). The mechanism that licenses this is dictionary
  §4's boundary set, which includes `.` per **D-029** (§14.10).

**Adversarial OCR must not be repaired** (dictionary §11 cases #22–#26): `8D`, `T05`, `l tab`,
`0D`, `OM` each yield an unparsed fragment, never a repaired token (§6.3; D-009; SI-06).

**Safety-invariant negatives:**

- **SI-07** — `Metformin 500 mg BD` yields `dose_strength_value: 500`, `dose_strength_unit: mg`,
  `frequency_code: TWICE_DAILY`, and `dose_amount: null` with a `missing_fields` entry. Assert
  explicitly that `dose_amount` is **not** `1` and `dose_unit` is **not** `tablet` (dictionary
  §7.7; D-010).
- **SI-08** — `SOS` / `PRN` yield `as_needed: true` and `schedule_derivable: false`, with **no**
  `max_doses_per_day` and **no** `min_interval_hours` field present in the output at all, and
  `missing_fields` entries with reason `requires_verifier_entry` (dictionary §7.4; D-011, D-020).
- **SI-09** — `STAT` yields immediate/one-time intent only; assert no administration or adherence
  effect and no schedule (dictionary §7.5; OQ-10).
- **SI-13** — a contradictory line leaves the contested field `null`, records both matches, and
  sets `verifier_action_required: true` (§6.2).
- **SI-05** — `OD` on a line bearing an `OPHTHALMIC_CONTEXT` literal yields `AMBIG-OD-001` with
  both readings in `candidate_readings` and no frequency written; assert `FREQ-OD-001` did **not**
  also fire (§6.1; dictionary §7.1, §11 invariant 7; D-012).
- **SI-06** — unsupported tokens are preserved, not guessed, repaired, dropped, or routed to an
  LLM (§6.3).
- **Exact fractions** — `½` and `1/2` both yield the exact fraction `1/2` (§7).
- **No defaults** — a line stating only a frequency leaves every other effective field `null`
  rather than filled (§4.4).

### 12.6 Dictionary-wide invariant tests

The eight invariants of dictionary §11 are asserted directly:

1. Every `rule_id` is unique.
2. No rule writes a field that must remain `null`.
3. Every field a rule writes is permitted by its category.
4. Every `no-schedule-derivable` rule yields `schedule_derivable: false`.
5. No rule writes `max_doses_per_day` or `min_interval_hours`.
6. No rule writes a clock time.
7. Exactly one of `FREQ-OD-001` / `AMBIG-OD-001` fires.
8. Every match carries all five provenance fields.

### 12.7 The first test to write

**`FREQ-BD-001` and `SI-07`** — the simplest deterministic frequency rule plus the
dose-versus-strength prohibition. Together they exercise a positive match with full provenance and
a mandatory refusal to infer, which is the smallest pair that pins both halves of the contract.
The test must fail before any parser exists.

---

## 13. Reserved sections — named, deliberately empty

Other documents already name this file as the home of the contracts below. They are listed here so
that this document cannot be mistaken for a complete `API_CONTRACTS.md`, and so that a later agent
knows the section was left empty on purpose rather than overlooked.

**Nothing in these subsections is specified. Do not treat an empty subsection as a decision.**

### 13.1 `OcrProvider` — the Node↔Python perception boundary — RESERVED

Named by `BUILD_ORDER.md` §4 ("the Node↔Python boundary. Defining this early is what lets you fake
the OCR service in Step 3") and Step 3, which defines the interface from this file and then three
implementations: `FixtureOcrProvider`, `CloudVisionOcrProvider`, `LlmVisionOcrProvider`. Its
request/response shape, confidence reporting, and the LLM-vision fallback threshold (**OQ-03**,
provisionally 0.70) are **not specified here**. Note that whatever confidence this boundary carries
must not reach the parser (§3.4; D-021).

### 13.2 Verification-view render contract — RESERVED

Named by `SAFETY_INVARIANTS.md` SI-05 and SI-15, and constrained in advance by dictionary §6: the
view **must** render `matched_literal`, `canonical_expansion`, and `rule_id` together, and **must
not** render the canonical expansion alone. Because `canonical_expansion` is not parser output
(§5.4), this contract will have to state how it is resolved from `rule_id` + `dictionary_version`
at render time. Marathi phrasing is `pending-native-review` throughout (**OQ-12**). **Not specified
here.**

### 13.3 Prescription Ingestion API Contract (`POST /api/prescriptions/upload`)

**Endpoint:** `POST /api/prescriptions/upload`  
**Purpose:** Ingests a prescription image, synthetic fixture, or direct shorthand text, executes OCR perception and deterministic shorthand parsing, and atomically stores pending records for clinical verification.

**Rate Limiting:**
Protected by sliding-window rate limiting middleware (D-032). Default: 10 requests per 60 seconds per client key. Exceeded requests return `429 Too Many Requests` with a `Retry-After` header.

**Headers:**
- `Content-Type: application/json`

**Request Body Schema:**
```json
{
  "patient_id": "UUID string (required, existing patient)",
  "caregiver_id": "UUID string (required, acting verifier/uploader)",
  "fixture_key": "string (optional, fixture key registered in FixtureOcrProvider)",
  "raw_text": "string (optional, raw prescription shorthand text if fixture_key not supplied)"
}
```

**Field Semantics & Validation Rules:**
1. `patient_id`: Required UUID string. Must match UUID regex (`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`). Invalid or missing returns `400 Bad Request` (`INVALID_REQUEST`).
2. `caregiver_id`: Required UUID string. Identifies the uploader/verifier. Must match UUID regex. Invalid or missing returns `400 Bad Request` (`INVALID_REQUEST`).
3. `fixture_key`: Optional string. Identifies a pre-registered benchmark or outpatient fixture in `FixtureOcrProvider` (e.g. `SYN-01`–`SYN-28`, `amoxicillin_500mg_tds`, `paracetamol_bd_5days`).
4. `raw_text`: Optional string. Direct prescription text used when `fixture_key` is not provided.
5. Ingestion source precedence: If `fixture_key` is present, `{ fixture_key }` is passed to the OCR provider; otherwise `{ raw_text }` is passed.

**Processing Pipeline & Safety Guarantees:**
1. **Perception:** Calls `ocrProvider.processImage(ocrInput)` to obtain `raw_ocr_text`, `confidence`, and `metadata`.
2. **Deterministic Parsing:** Executes `parse(raw_ocr_text)` with zero OCR confidence passed to the parser (D-021, pure deterministic parsing).
3. **Atomic Persistence:** In a single transaction:
   - Inserts `prescriptions` row in `status = 'pending_verification'` with `raw_ocr_text`, `ocr_confidence`, and `uploaded_by = caregiver_id`.
   - Inserts `medications` rows with `verification_status = 'pending'`, `lifecycle_state = NULL`, and immutable `parse_result`.
   - Inserts initial `medication_audit_events` rows with `event_type = 'parsed'` and `actor_caregiver_id = caregiver_id`.
4. **SI-01 Invariant:** Under no circumstances are reminders generated or scheduled at upload time. The prescription cannot be verified until all medications are confirmed/corrected by a human.

**Responses:**
- `201 Created`:
  ```json
  {
    "prescription": {
      "id": "e2a0b123-4567-89ab-cdef-0123456789ab",
      "patient_id": "de103cdf-a2c8-4381-823f-352c465ae365",
      "status": "pending_verification",
      "raw_ocr_text": "Tab Amoxicillin 500mg 1 tab TDS",
      "ocr_confidence": 0.95,
      "uploaded_by": "00000000-0000-0000-0000-000000000001",
      "created_at": "2026-09-05T21:00:00.000Z",
      "updated_at": "2026-09-05T21:00:00.000Z"
    },
    "medications": [
      {
        "id": "f3b1c234-5678-90bc-def0-123456789abc",
        "prescription_id": "e2a0b123-4567-89ab-cdef-0123456789ab",
        "raw_line_text": "Tab Amoxicillin 500mg 1 tab TDS",
        "verification_status": "pending",
        "lifecycle_state": null,
        "dose_amount": 1,
        "dose_unit": "tablet",
        "frequency": "THRICE_DAILY",
        "created_at": "2026-09-05T21:00:00.000Z"
      }
    ],
    "unparsed_fragments": []
  }
  ```
- `400 Bad Request`:
  ```json
  {
    "error": {
      "code": "INVALID_REQUEST",
      "message": "Both 'patient_id' and 'caregiver_id' are required"
    }
  }
  ```
- `429 Too Many Requests`:
  ```json
  {
    "error": {
      "code": "RATE_LIMIT_EXCEEDED",
      "message": "Rate limit exceeded. Please try again later."
    }
  }
  ```
- `500 Internal Server Error`: Standard sanitized error envelope per SI-16.

**Privacy & Logging (SI-16):**
- Raw prescription text and candidate details are strictly excluded from logging.
- Structured logs emit only: `{ action: 'prescription_uploaded', prescription_id, patient_id }`.

### 13.4 Delivery and reminder payload boundary — RESERVED

**Blocked on OQ-02** — whether WhatsApp business-initiated messages require pre-approved
per-language templates with bounded, ordered variables, versus a single rendered body. MASTERPLAN
§21 requires OQ-02 resolved before the `reminders` migration is written (`SCHEMA.md` §2.6; D-017).
**Resolved by D-030.**

### 13.5 Patient DPDP Right-to-Erasure API Contract

**Endpoint:** `DELETE /api/patients/:patient_id`
**Purpose:** Executes an atomic right-to-erasure request under Section 12 of the Digital Personal Data Protection (DPDP) Act 2023.

**Behavior & Semantics:**
1. **PII Redaction:** `patients.deleted_at` is set to UTC `now()`, `full_name` is redacted to `'[DELETED_PATIENT]'`, and `phone_number` and `meal_times` are nullified.
2. **Caregiver Unlinking:** All rows in `patient_caregivers` referencing `patient_id` are removed.
3. **Image Purge:** `prescriptions.image_storage_key` is cleared to `null` across all prescriptions for this patient.
4. **Reminder Cancellation:** All pending reminders for the patient's medications are atomically transitioned to `status = 'cancelled'`, `cancelled_at = now()`, immediately halting dispatch (SI-10, SI-11).
5. **Medication Lifecycle Transition:** Active medications transition to `lifecycle_state = 'stopped'` with `lifecycle_reason = 'PATIENT_ERASURE_REQUEST'`.
6. **Audit Preservation:** Appends an immutable event to `medication_audit_events` recording `reason = 'PATIENT_ERASURE_REQUEST'` and `event_type = 'stopped'` (SI-14).

**Request Parameters:**
- Path param: `patient_id` (UUID string, required).
- Body / Header: Optional `caregiver_id` (`x-caregiver-id`) identifying the acting clinician/verifier.

**Responses:**
- `200 OK`:
  ```json
  {
    "success": true,
    "data": {
      "patient_id": "33d41718-65d6-46f3-8875-687864cbf7c6",
      "cancelled_reminders_count": 2,
      "stopped_medications_count": 1,
      "deleted_at": "2026-08-30T14:31:48.662Z"
    }
  }
  ```
- `400 Bad Request`: `{ "error": { "code": "INVALID_PATIENT_ID", "message": "A valid patient UUID is required" } }`
- `404 Not Found`: `{ "error": { "code": "PATIENT_NOT_FOUND", "message": "Patient record not found" } }` (returned for unknown or already-erased patients).

### 13.6 Patient Registration API Contract (`POST /api/patients`)

**Endpoint:** `POST /api/patients`  
**Purpose:** Registers a new patient record in PrescriptionSetu for prescription triage, review, and automated WhatsApp reminder scheduling.

**Headers:**
- `Content-Type: application/json`

**Request Body Schema:**
```json
{
  "full_name": "string (required, trimmed, 1-200 characters)",
  "phone_number": "string | null (optional, E.164 format: ^\\+[1-9]\\d{1,14}$)",
  "preferred_language": "'mr' | 'en' (optional, defaults to 'mr')",
  "meal_times": {
    "breakfast": "HH:mm (optional, 24-hour time)",
    "lunch": "HH:mm (optional, 24-hour time)",
    "dinner": "HH:mm (optional, 24-hour time)",
    "bedtime": "HH:mm (optional, 24-hour time)"
  }
}
```

**Field Semantics & Validation Rules:**
1. `full_name`: Required string. Trimmed length must be between 1 and 200 characters. If missing or empty after trim, returns `400 Bad Request` with code `INVALID_FULL_NAME`.
2. `phone_number`: Optional string or null. If empty string or whitespace, normalized to `null`. If non-empty, must strictly conform to E.164 pattern (`^\+[1-9]\d{1,14}$`). Invalid format returns `400 Bad Request` with code `INVALID_PHONE_NUMBER`.
3. `preferred_language`: Optional string. If provided, must be `'mr'` (Marathi) or `'en'` (English). Defaults to `'mr'`. Unsupported values return `400 Bad Request` with code `INVALID_PREFERRED_LANGUAGE`.
4. `meal_times`: Optional object. When provided, any present slot (`breakfast`, `lunch`, `dinner`, `bedtime`) must match 24-hour `HH:mm` format (`^(?:[01]\d|2[0-3]):[0-5]\d$`). Invalid formats return `400 Bad Request` with code `INVALID_MEAL_TIMES`.

**Caregiver Relationship / Authorization (OQ-05 Boundary):**
- As established in `SCHEMA.md` §10 and `DECISIONS.md`, caregiver↔patient trust and authorization semantics remain open (OQ-05).
- Patient registration creates **only** the `patients` record. No `caregiver_id` is accepted, and no record is created in `patient_caregivers`.

**Responses:**
- `201 Created`:
  ```json
  {
    "patient": {
      "id": "7b0d7cf8-8a8b-4c4f-9e73-b3c1d9b932c1",
      "full_name": "Asha Suresh Patil",
      "phone_number": "+910000000019",
      "preferred_language": "mr",
      "meal_times": {
        "breakfast": "08:30",
        "lunch": "13:00",
        "dinner": "20:30",
        "bedtime": "22:00"
      },
      "created_at": "2026-09-05T20:45:00.000Z",
      "updated_at": "2026-09-05T20:45:00.000Z"
    }
  }
  ```
- `400 Bad Request`:
  ```json
  {
    "error": {
      "code": "INVALID_FULL_NAME",
      "message": "Patient full name is required"
    }
  }
  ```
- `500 Internal Server Error`: Standard sanitized error envelope per SI-16.

**Privacy & Logging (SI-16):**
- In compliance with `SAFETY_INVARIANTS.md` SI-16, personal identifiable information (`full_name`, `phone_number`) is strictly forbidden from plaintext logs.
- Structured application logs emit only: `{ action: 'patient_created', patient_id: patient.id }`.

### 13.7 Patient Profile & Active Regimens Contract (`GET /api/patients/:id`)

**Endpoint:** `GET /api/patients/:id`  
**Purpose:** Retrieves patient clinical profile, demographics, meal-time anchor schedule, active prescription count, and deliverable active medication regimens.

**Headers:**
- `Accept: application/json`

**Request Parameters:**
- Path param: `id` (UUID string, required). Must conform to UUID format (`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`).

**Deliverable Predicate & Safety Guarantees (SI-01, SI-02, SI-15):**
- In strict adherence to `SAFETY_INVARIANTS.md` SI-02/SI-15 and `docs/SCHEMA.md` §2.5, active medications returned for a patient must satisfy the canonical deliverable predicate:
  `verification_status IN ('confirmed', 'corrected') AND lifecycle_state = 'active'`
- Medications in `verification_status = 'pending'`, `verification_status = 'rejected'`, `lifecycle_state = 'stopped'`, `lifecycle_state = 'superseded'`, or `lifecycle_state IS NULL` are structurally excluded from this response.
- Each returned medication is formatted via `formatMedicationForDashboard()` from `apps/api/src/verification/display.ts`, providing full shorthand provenance and plain-language display expansions (`display_expansions`, SI-04/SI-05).

**Responses:**
- `200 OK`:
  ```json
  {
    "patient": {
      "id": "de103cdf-a2c8-4381-823f-352c465ae365",
      "full_name": "Asha Suresh Patil",
      "phone_number": "+910000000019",
      "preferred_language": "mr",
      "meal_times": {
        "breakfast": "08:30",
        "lunch": "13:00",
        "dinner": "20:30",
        "bedtime": "22:00"
      },
      "created_at": "2026-09-05T20:45:00.000Z",
      "updated_at": "2026-09-05T20:45:00.000Z"
    },
    "active_prescriptions_count": 1,
    "active_medications": [
      {
        "id": "4b684949-a2e6-4fa2-be9d-58fbfa8fc6ad",
        "prescription_id": "7d8d54de-d966-457f-a075-18aa3c34c2ba",
        "drug_name": "Amoxicillin",
        "drug_name_validation": null,
        "verification_status": "confirmed",
        "lifecycle_state": "active",
        "effective_fields": {
          "frequency_code": "THRICE_DAILY",
          "times_per_day": 3,
          "timing_anchors": null,
          "dose_amount": 1,
          "dose_unit": "tablet",
          "dose_strength_value": 500,
          "dose_strength_unit": "mg",
          "duration_value": null,
          "duration_unit": null,
          "duration_indefinite": null,
          "as_needed": null,
          "total_doses": null,
          "recurring": true,
          "immediate": null,
          "schedule_derivable": true,
          "verifier_action_required": false,
          "max_doses_per_day": null,
          "min_interval_hours": null
        },
        "display_expansions": [
          {
            "rule_id": "FREQ-TDS-001",
            "matched_literal": "TDS",
            "canonical_expansion": "thrice daily",
            "source_span": { "start": 26, "end": 29 }
          }
        ],
        "candidate_readings": [],
        "missing_fields": [],
        "unparsed_fragments": [],
        "created_at": "2026-09-05T21:05:00.000Z"
      }
    ]
  }
  ```
- `400 Bad Request`:
  ```json
  {
    "error": {
      "code": "INVALID_PATIENT_ID",
      "message": "A valid patient UUID is required"
    }
  }
  ```
- `404 Not Found`:
  ```json
  {
    "error": {
      "code": "PATIENT_NOT_FOUND",
      "message": "Patient record not found"
    }
  }
  ```
- `500 Internal Server Error`: Standard sanitized error envelope per SI-16.

**Privacy & Logging (SI-16):**
- In compliance with `SAFETY_INVARIANTS.md` SI-16, personal identifiable information and medication names are strictly forbidden from plaintext logs.
- Structured application logs emit only: `{ action: 'patient_profile_retrieved', patient_id: id }`.

---

## 14. Discovered gaps

Gaps found while writing this contract. **None was resolved here when this section was written.**
They are recorded so that a later agent meets them as known open items rather than rediscovering
them, and so that no one closes one by accident. Where a gap is later resolved, its subsection is
marked **RESOLVED** with the deciding entry from `docs/DECISIONS.md` rather than deleted — see
§14.10, the only one so far.

New open items are recorded in this section and in `HANDOFF.md`, **not** as new `OQ-nn` entries in
MASTERPLAN §37 — that document is stable and its open-question list is owned there. Where a gap is
already an `OQ`, it is cited by its existing ID.

### 14.1 Gap #1 — drug-name extraction has no authorising dictionary rule

MASTERPLAN §18.3 lists "extract drug name, dosage, frequency, timing, duration as separate
structured fields" among the parsing module's responsibilities, and `SCHEMA.md` §2.5 defines a
`medications.drug_name` column plus an advisory `drug_name_validation`. But **no rule in the
dictionary's 19 authorises drug-name extraction**, no category's permitted writes include
`drug_name`, and the dictionary explicitly forbids consulting the drug name where a reader might
expect it (dictionary §7.1).

Consequence: `drug_name` is **absent from parser output** (§4.6). Something must eventually
populate that column, but it is not this contract, and it must not be invented as a side effect
of implementing the parser — an unrestricted "the first word on the line" heuristic is exactly the
kind of unreviewed rule the dictionary exists to prevent. Recorded as **D-025**. Resolution
requires either a new dictionary rule or a separately specified extraction step with its own
review.

### 14.2 Gap #2 — envelope-level `unparsed_fragments` have no storage location

As stated in §4.1.1 and §10.2. `medications.parse_result` is per-medication, so text belonging to
no medication has nowhere to go. **Unresolved.** No column, table, or convention is invented here.
It must be settled by a schema task with `SCHEMA.md`'s authority, and in the interim an
implementation must not discard the fragments to make persistence succeed.

### 14.3 Gap #3 — nothing sets `schedule_derivable` to `true`

In `dictionary_version` 0.1.0 the field can only be lowered (§4.7). The fail-safe reading is
therefore correct and safe today, but it means the parser alone never authorises a schedule, and
reminder generation will need an authority for `true` that does not yet exist. **Unresolved.** The
fix is a dictionary decision about which rule or rule combination establishes derivability — not a
relaxation of the `=== true` check by a consumer.

### 14.4 Gap #4 — "medication line" is not defined

Dictionary §7.1 scopes the ophthalmic predicate to "the current line", and §4.1.1 above distinguishes
text inside a medication line from text outside one. Neither the dictionary nor `SCHEMA.md` defines
what constitutes a medication line in raw OCR text — how line breaks, wrapped lines, or multi-drug
lines are treated. Since the `OD` decision path depends on it (D-012), the definition is
safety-relevant. **Unresolved**, and it must be answered by the dictionary rather than settled
implicitly by whatever the first implementation does.

### 14.5 Gap #5 — the dictionary field reference lists two fields the output omits

Dictionary §2's "Structured output field reference" lists `max_doses_per_day` and
`min_interval_hours`, each annotated as having **no rule**, while §4.6 above holds that they are
structurally absent from parser output (SI-08; D-011, D-020). The two readings are compatible in
intent but a reader could take the field reference as licensing the fields' presence. A
**patch-level clarification** to the dictionary — one that cannot change parser behaviour
(dictionary §14) — stating that these two appear in the reference only to document their
prohibition, would remove the ambiguity. **Not applied here**; this document does not modify the
dictionary.

### 14.6 Gap #6 — case folding is not stated to be locale-invariant

Dictionary §4 permits case folding as one of the three normalizations but does not say it is
ASCII-only and locale-invariant. Locale-sensitive folding would make the same prescription text
parse differently under different system settings — a determinism break that no test would catch
unless it varied the locale. §4.5 above states the invariant this contract relies on, and §12.4
requires a test for it. **A dictionary clarification is still owed.**

### 14.7 OQ-02 remains open

WhatsApp business-initiated message payload shape. Blocks the `reminders` table and its migration
(MASTERPLAN §21, §37; `SCHEMA.md` §2.6; D-017). **Untouched by this contract**; §13.4 is reserved
precisely so that nothing here presumes an answer.

### 14.8 OQ-13 remains open

Whether `dictionary_version` needs first-class persistence in addition to living inside provenance
(MASTERPLAN §37; `SCHEMA.md` §8; D-015). §5 and §10.3 leave it open. **Not resolved here.**

### 14.9 Other open questions this boundary touches

- **OQ-03** — the OCR confidence threshold routing to the LLM-vision fallback (provisionally 0.70).
  Lives entirely outside the parser (§3.4; §13.1).
- **OQ-06** — `patients.meal_times` shape, needed to resolve timing anchors to clock times after
  the gate (§11).
- **OQ-10** — who owns and acknowledges a STAT dose. The parser records intent only (§8.1, SI-09).
- **OQ-11** — whether letter case is semantically meaningful in local prescribing (`HS` vs `hs`).
  Case folding is currently permitted on the assumption that it is not (dictionary §12). If the
  answer is that it *is* meaningful, §4.5 changes and so does every `match_forms` list.
- **OQ-12** — Marathi phrasing sign-off; all dictionary Marathi entries are
  `pending-native-review` and none is authored (§13.2).
- **Raw-OCR retention dependency** — deletion of `prescriptions.raw_ocr_text` would dangle every
  stored `source_span` (§5.1; `SCHEMA.md` §8, §10). Must be settled with the retention/erasure
  design.

### 14.10 Gap #7 — the terminal-period mechanism was unspecified — **RESOLVED (D-029)**

Numbered out of sequence deliberately: §14.7 … §14.9 are cited elsewhere in this document and in
`SCHEMA.md`, so the gap list is appended to rather than renumbered.

Found on 2026-08-26 while writing the parser's first failing tests, after this section was
written — hence the position. Three passages required `Give 1 tab BD.` to match `BD` without
absorbing the period (dictionary §4's terminal-period hazard note, dictionary §11 case 21, and
§12.5 below), but dictionary §4's boundary set was enumerated as the exhaustive validity condition
for a match and **omitted `.`**. Read literally, the match had to be rejected. No other mechanism
closed the gap: `BD.` is not a declared dotted `match_forms` entry, and normalization 2 licenses
stripping only *token-internal* periods inside a candidate that already matches a declared dotted
form.

**Resolved by D-029**, in the same task as the first parser implementation: dictionary §4's
boundary set is now `, ; : ( ) [ ] | .`, with `.` a delimiter except where the period forms part of
a candidate matching a dotted `match_forms` entry declared by the rule being evaluated, and §4 now
states that boundary checking is edge validation on a candidate rather than tokenisation. Amended
in place at `0.1.0` (dictionary §14). Nothing in this contract changed as a result — §12.5 already
required the behaviour.

---

## 15. Changelog

Versioning mirrors the dictionary's policy (dictionary §14): **major** for a change that breaks an
existing consumer, **minor** for additive contract surface, **patch** for clarifications that
cannot change behaviour on either side of the boundary.

| Version | Date | Change |
|---|---|---|
| 0.1.0 | 2026-08-25 | Initial DRAFT. Specifies the Phase 1 parser boundary only: §0 guarantees and non-guarantees, §1 scope and authority, §2 boundary, §3 input contract, §4 output contract, §5 provenance and §5.1 `source_span` semantics, §6 ambiguity/contradiction/unsupported/missing, §7 exact amounts, §8 safety-invariant mapping, §9 failure contract, §10 storage compatibility, §11 non-goals, §12 test contract, §13 reserved sections (empty by intent), §14 discovered gaps. Decisions D-021 … D-025 recorded in `docs/DECISIONS.md`. No parser, no tests, no types, no migrations created. |
| 0.1.0 *(amended in place)* | 2026-08-26 | **§5 `match_type` resolved** (D-027): the value records the normalization *this* match required — `exact`, `case-insensitive`, `punctuation-normalized`, `regex` — with the most-transforming value winning when two apply, and the dictionary's per-entry `Match type` row identified as *permitted* normalizations rather than the recorded value. Mirrors the dictionary's §4/§5 amendment of the same date. No field added or removed; provenance remains exactly five fields. Amendment in place rather than a version bump, on the same grounds the dictionary states in its §14: DRAFT, no implementation, nothing pinned to a superseded reading. |
| 0.1.0 *(amended in place)* | 2026-08-27 | **Editorial only — no contract surface changed.** §14 gained §14.10 recording discovered gap #7 (the unspecified terminal-period mechanism) and marking it **RESOLVED by D-029**; §14's preamble now says how a resolved gap is marked; §12.5's `Give 1 tab BD.` bullet now names dictionary §4's boundary set as the mechanism that licenses it. The required behaviour was already stated in §12.5 and is unchanged, so no consumer or implementer obligation moved. |

---

*This document is a contract, not a clearance. Nothing in it authorises any dosage, frequency, or
timing instruction to reach a patient. That requires explicit human confirmation, every time
(SI-01; MASTERPLAN §26; `AGENTS.md` §2).*
