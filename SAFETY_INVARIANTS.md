# SAFETY_INVARIANTS.md

> **Status:** STABLE · **Version:** 1.0.0 · **Last updated:** 2026-08-24
>
> Canonical statement of PrescriptionSetu's non-negotiable safety properties. This file
> formalizes MASTERPLAN Section 26 as a numbered set of invariants (`SI-01`…`SI-16`) that
> the system must satisfy. It is referenced by `AGENTS.md` §2/§4.
>
> **Invariant vs. mechanism.** An entry here states *required system behavior*. It does
> **not** prescribe a database schema, enum, column, or API shape — those are chosen later
> in `docs/SCHEMA.md` and `docs/API_CONTRACTS.md`. Where a behavior needs a store or a
> boundary, that is named as a *prospective* enforcement point, not a committed design.
>
> **No implementation exists yet.** Every enforcement location below is PROSPECTIVE. The
> binding mechanism for each invariant is a failing-test-first written against it (named
> after its `SI-id`) before the code it guards is written. A planned location is not an
> implemented one, and this document must not be read as claiming otherwise.
>
> **Change control.** Weakening any invariant requires a separate, deliberate, written
> sign-off recorded in `docs/DECISIONS.md`. It must never happen as a silent side effect of
> an unrelated change — including a request from the project owner (§26).

---

## 1. The non-negotiable rule

> **No dosage, frequency, or timing instruction may reach a patient or caregiver without
> explicit human confirmation first.** (MASTERPLAN §26, verbatim.)

Enforced at the application-logic layer as a guard on the reminder-generation path — not a
UI convention. It overrides any request to skip verification for convenience or speed,
applies to every phase, every future feature, and every agent, and can only be changed by
the written sign-off described above.

---

## 2. What is guaranteed and what is not

This distinction is the heart of the document. The two claims are easy to conflate and only
the first is true.

> ### GUARANTEE
> No unverified dosage, frequency, or timing instruction reaches a patient. This is a
> property of the code and is testable (SI-01, SI-02, SI-03, SI-15).
>
> ### NOT GUARANTEED
> That a human-verified interpretation is medically correct. The gate ensures a human
> *looked*; it cannot ensure the human was *right*. Verifiers are untrained family members
> and volunteers.

The gap between these two statements is this project's **residual risk** (§8). It is
*narrowed* — not closed — by making verification comprehensible to a layperson (MASTERPLAN
§18.5 Design Principle 2). Its real closure is pharmacist review (§25), which is out of
current scope. Describing the gate as guaranteeing correctness would invite exactly the
unearned reliance that makes a medication-safety system dangerous, and SHALL NOT appear in
any user-facing or portfolio-facing material.

---

## 3. How to read an invariant

Each invariant below carries seven fields:

- **Invariant** — the required behavior, stated as a property that must always hold.
- **Why** — the harm it prevents.
- **Forbidden** — the behavior that must never occur.
- **Required** — what the system must do instead.
- **Enforcement (prospective)** — where it is *intended* to be enforced. No such code
  exists yet; the path is illustrative and pinned when SCHEMA/API/code land.
- **Automated test** — the test that binds code to the invariant (written failing-first).
- **Manual check** — what a human must confirm that a test cannot fully prove.

Every invariant also has an **enforcement class**: **G** guard / boundary check ·
**P** parser pure-logic property · **L** lifecycle / atomic transaction ·
**A** audit-trail or data-flow routing · **±M** carries a required manual-confirmation
component. Classes describe the *kind* of mechanism, not a committed implementation.

`SI-id`s are stable and citable from tests, commits, and `DECISIONS.md`, mirroring the
dictionary's `rule_id` and the `D-xxx` convention.

---

## 4. The invariants

### SI-01 — Human verification gate
- **Invariant:** A prescription cannot become *verified* while any medication associated with it remains unverified; it may become verified only once every associated medication has been confirmed or corrected by a human.
- **Why:** The project's defining constraint (§26). A partially-reviewed prescription treated as fully reviewed is the exact failure the gate exists to prevent.
- **Forbidden:** Treating a prescription as verified while any of its medications is still unconfirmed, rejected, or otherwise not human-approved.
- **Required:** The verification-state transition rejects the move to verified unless all associated medications are in a human-approved state.
- **Enforcement (prospective):** Prescription verification-state transition logic in `apps/api`. Representation of states is deferred to `docs/SCHEMA.md`; defense-in-depth at the data layer is a schema-time option, not a requirement here.
- **Automated test:** Assert the transition to verified fails when at least one associated medication is not human-approved, and succeeds only when all are.
- **Manual check:** In a dev environment, attempt to verify a prescription with one unapproved medication; confirm rejection.
- **Class:** G ±M

### SI-02 — No unverified instruction reaches a patient-facing surface
- **Invariant:** No dosage/frequency/timing content derived from unverified data is ever emitted to a patient- or caregiver-facing channel.
- **Why:** The general form of §26 — the rule is about *reaching a person*, not about one feature.
- **Forbidden:** Any code path that renders or sends instruction content sourced from a medication that is not human-approved.
- **Required:** Every outbound instruction path reads only human-approved medication data (generalized per SI-15).
- **Enforcement (prospective):** A guard at each patient-facing emission boundary, backed by a single shared "approved-data-only" read path in `apps/api`.
- **Automated test:** Integration test asserting no instruction content is produced for an unverified prescription on any channel.
- **Manual check:** Trace each outbound call site and confirm its data source is the approved-only path.
- **Class:** G ±M

### SI-03 — Reminder generation requires verified medication data
- **Invariant:** The reminder-generation step produces reminders only from medication data that has been human-verified.
- **Why:** §18.6 and §30 name this as the flagship guard; it is the concrete instance of §26 on the delivery path.
- **Forbidden:** Generating any reminder from a medication that is pending, rejected, or otherwise not human-approved.
- **Required:** A guard at the entry of reminder generation refuses non-approved input and produces nothing for it.
- **Enforcement (prospective):** Guard clause at the top of the reminder-generation function in `apps/api` (illustratively `reminders/generate`).
- **Automated test:** The failing-test-first mandated by BUILD_ORDER Step 2 / §30 — "reminders cannot be generated for unconfirmed medications." Written before the generator exists.
- **Manual check:** Run generation against an unverified medication in dev; confirm zero reminders and an explicit refusal.
- **Class:** G

### SI-04 — Verified data retains provenance
- **Invariant:** Every parser-derived field carried on a verified medication retains its provenance (the five fields of dictionary §5: `rule_id`, `dictionary_version`, `matched_literal`, `source_span`, `match_type`); every human-corrected field is attributable to the human who set it (links to SI-14).
- **Why:** §26 auditability — every decision must trace to the raw fragment or to a named human. Provenance is nearly free at creation and expensive to retrofit.
- **Forbidden:** Discarding provenance when data is persisted or verified; overwriting `matched_literal` with the canonical expansion so the original token is lost.
- **Required:** Provenance travels with the value through verification; corrections are recorded as human-origin.
- **Enforcement (prospective):** Parser output type in `packages/shared-types`; persistence and correction paths in `apps/api`. Whether `dictionary_version` is stored is **OQ-13**, deferred to the schema task.
- **Automated test:** Unit — parser output includes all five provenance fields. Integration (schema-gated) — a persisted verified field still carries them.
- **Manual check:** Inspect one verified medication end-to-end; confirm each field resolves to a `rule_id` or a named human.
- **Class:** P + A ±M

### SI-05 — Ambiguous parser output stays verifier-visible
- **Invariant:** When the parser cannot resolve a token to a single reading, the safety-relevant field is left empty, the alternative readings are retained, and the case is flagged for a verifier decision and surfaced in the verification view.
- **Why:** §18.5 DP2 and D-007 — different failure modes need different verifier actions; a hidden ambiguity is a silent decision.
- **Forbidden:** Collapsing an ambiguous token to a default reading; hiding the alternative readings from the verifier.
- **Required:** The parser emits the ambiguity (empty field + candidate readings + verifier-action flag); the verification presentation renders both readings.
- **Enforcement (prospective):** Parser pure logic (`apps/api`) plus the verification-view render contract (defined later in `API_CONTRACTS.md`).
- **Automated test:** Unit — ambiguous inputs (e.g. ophthalmic `OD`, bare `× 5`) yield the empty-field + candidates + flag shape. Contract — the view payload carries the candidate readings.
- **Manual check:** Open an ambiguous case in the verification view; confirm both readings display and nothing is pre-resolved.
- **Class:** P ±M

### SI-06 — Unsupported shorthand is never guessed
- **Invariant:** A token not present in the dictionary is preserved verbatim as an unparsed fragment and surfaced to the verifier; it is never converted into an interpretation.
- **Why:** Dictionary §10 and D-009 — a fabricated reading looks identical to a correct one and costs far more than a flagged unknown.
- **Forbidden:** Guessing a meaning; "repairing" OCR (`8D`→`BD`); substring matches (`ODT`→`OD`, `statin`→`stat`); routing the token to an LLM as the primary interpreter.
- **Required:** Preserve the literal token, mark it unparsed, and present it for human attention.
- **Enforcement (prospective):** Parser matcher and token-boundary enforcement in `apps/api`.
- **Automated test:** Unit cases from dictionary §11 (e.g. `ODT`, `BDS`, `statin`, `8D`) asserting an unparsed fragment, not an interpretation.
- **Manual check:** Feed a set of adversarial/near-miss tokens; confirm each becomes an unparsed fragment.
- **Class:** P

### SI-07 — Dose amount is never inferred from strength
- **Invariant:** A medication's dose *amount* is never derived from its dose *strength*. Strength populates only strength fields; amount comes only from an explicit amount token.
- **Why:** D-010 — inferring "1 tablet" from "500 mg" is a plausible-looking factor-of-two error that survives review precisely because it looks normal.
- **Forbidden:** `Metformin 500 mg BD` yielding a dose amount of one tablet.
- **Required:** Leave the amount empty and report it as a missing field (dictionary §9), putting the question in front of a human.
- **Enforcement (prospective):** Parser category isolation in `apps/api` — the strength category has no permission to write amount fields.
- **Automated test:** Unit (dictionary §11) — a strength-only line yields no amount and a missing-field report.
- **Manual check:** Confirm the canonical `500 mg` example produces an empty amount plus a missing-field entry.
- **Class:** P

### SI-08 — PRN/SOS never acquire an invented maximum or interval
- **Invariant:** A conditional-use ("as needed") medication never receives a maximum daily dose or a minimum inter-dose interval unless one is explicitly present in the prescription or entered and confirmed by a human. No parser rule is capable of writing those fields.
- **Why:** D-011 — a fabricated ceiling sits exactly where a real safety limit belongs; for a drug with a genuine toxicity threshold this is the most dangerous possible guess.
- **Forbidden:** Defaulting a dose ceiling or minimum interval for `SOS`/`PRN` (e.g. a generic "max 4/day").
- **Required:** Those limits remain empty and no schedule is derivable until a human supplies them; the fields are structurally unwritable by any rule.
- **Enforcement (prospective):** Parser rule set in `apps/api` — no category lists these fields as writable; enforced by the shared types.
- **Automated test:** Unit (dictionary §11) — an `SOS`/`PRN` line yields no ceiling/interval and no schedule. Dictionary-wide invariant test — no rule writes the maximum-dose or minimum-interval fields.
- **Manual check:** Review the rule set and confirm no producer exists for those two fields.
- **Class:** P

### SI-09 — STAT does not imply administration
- **Invariant:** A `stat` (one-time/immediate) token records intent only. It asserts nothing about whether the dose was actually administered and derives no schedule.
- **Why:** Dictionary §7.5 — the dose may have been given at the clinic before verification; the parser cannot know. Ownership of that fact is **OQ-10**, open.
- **Forbidden:** Any field, flag, or downstream step that treats a `stat` dose as administered, or auto-marks adherence for it.
- **Required:** Record one-time/immediate intent; leave administration to be determined downstream by a human.
- **Enforcement (prospective):** Parser single-dose handling in `apps/api`; adherence workflow must not infer administration from a `stat` record.
- **Automated test:** Unit — a `stat` line produces no administration assertion and no derived schedule. Downstream test — adherence does not auto-mark a `stat` dose as taken.
- **Manual check:** Confirm a `stat` example carries intent only and that no later step claims administration. (OQ-10 remains open.)
- **Class:** P ±M

### SI-10 — Stopping is separated from clinical verification
- **Invariant:** Stopping a medication or its reminders does not require clinical verification — halting instructions must never be gated behind a review step. **Authorization is a separate concern from verification:** the right to stop must still be established, and the mechanism is **OQ-05** (open). This invariant must not be read as "anyone may stop any patient's medication."
- **Why:** §18.10 — stopping *removes* instructions, so making a caregiver wait for verification to halt a reminder is itself a safety failure. But OQ-05 warns that an untrusted caregiver↔patient link is a real safety question, so absence of *clinical* verification does not imply absence of *authorization*.
- **Forbidden:** Gating, deferring, or blocking a stop behind the clinical verification gate; conversely, treating "no verification needed" as "no authorization needed."
- **Required:** An authorized stop succeeds regardless of verification state and takes effect immediately (triggering SI-11). The authorization model is deferred to OQ-05 and must not be silently assumed away.
- **Enforcement (prospective):** Medication lifecycle "stop" handler in `apps/api`, with no clinical-verification precondition; the authorization check is a placeholder pending OQ-05.
- **Automated test:** Stop succeeds on a medication in any verification state and invokes no clinical-verification gate. (An authorization test is added once OQ-05 is resolved.)
- **Manual check:** Stop an active medication in dev; confirm immediate effect with no verification step, and confirm the authorization gap is tracked, not assumed closed.
- **Class:** L ±M

### SI-11 — Stopping or superseding prevents future reminders, atomically
- **Invariant:** When a medication is stopped or superseded, its pending reminders are cancelled as part of the *same* atomic change of state. No observable moment exists in which a stopped or superseded medication still has live reminders.
- **Why:** §18.10 / §21 — a window where a halted medication keeps firing reminders is a direct patient-facing safety failure; a supersede that leaves both old and new schedules live double-doses.
- **Forbidden:** Any state in which a stopped/superseded medication has pending reminders; a gap between old-schedule cancellation and new-schedule creation on supersede.
- **Required:** State change and reminder cancellation happen as one atomic operation that cannot partially apply.
- **Enforcement (prospective):** Transactional lifecycle handler in `apps/api` performing the state change and reminder cancellation together.
- **Automated test:** Integration — after a stop, no live reminders exist for that medication; a supersede leaves no interval in which both schedules are live.
- **Manual check:** Inspect state after a stop/supersede for any orphaned live reminder.
- **Class:** L

### SI-12 — Medication lifecycle transitions are explicit and revisions re-enter the gate
- **Invariant:** A medication moves only along defined lifecycle transitions (it is active, may be completed, may be stopped, or may be superseded by a revision, each transition carrying a reason and a timestamp). A revision to a previously verified medication does not silently overwrite it — it re-enters the full human-verification gate before it can take effect. *Exact state names and storage belong to `docs/SCHEMA.md`; this invariant fixes the behavior, not the representation.*
- **Why:** §18.10 — editing a confirmed instruction in place would let a changed dose reach a patient without re-review, defeating §26.
- **Forbidden:** Editing a confirmed medication's instruction in place; performing an undefined transition; letting a revision bypass verification.
- **Required:** Transitions are validated against the allowed set; a revision is held separately and only replaces the prior instruction once it has itself been verified.
- **Enforcement (prospective):** Lifecycle transition logic in `apps/api`; representation deferred to `docs/SCHEMA.md`.
- **Automated test:** Unit — a disallowed transition is rejected; a revision spawns a new verification and does not mutate the confirmed record (§30).
- **Manual check:** Attempt an in-place edit of a confirmed dose; confirm it is refused and routed back through verification.
- **Class:** L

### SI-13 — Contradictory parsed instructions are never silently resolved
- **Invariant:** When two matches in the same category disagree (e.g. one frequency token says twice-daily and another says thrice-daily), the field is left empty, both readings are retained with their provenance, and the case is flagged for a verifier decision.
- **Why:** Dictionary §8 — choosing first, last, or "more likely" fabricates a resolution the prescription does not support.
- **Forbidden:** Auto-resolving a contradiction by any heuristic (first-wins, last-wins, likelihood).
- **Required:** Surface the contradiction to a human with both readings preserved.
- **Enforcement (prospective):** Parser composition/conflict step in `apps/api`.
- **Automated test:** Unit (dictionary §11) — a dual-frequency line yields an empty field, both readings recorded, and a verifier-action flag.
- **Manual check:** Confirm a contradictory line escalates to a human rather than resolving itself.
- **Class:** P

### SI-14 — Verification and correction are auditable
- **Invariant:** Every confirm, correct, and reject action is recorded with the old value, the new value, the identity of the human who made it, and a timestamp, in an append-only trail.
- **Why:** §26 auditability and §18.5 — an unauditable correction cannot be reviewed, and a mutable audit trail is not an audit trail.
- **Forbidden:** Changing a safety-relevant value with no recorded trail; audit entries that can be edited or deleted.
- **Required:** The correction record is written on the same path as the change and is immutable once written.
- **Enforcement (prospective):** Correction/audit record and its write, in the verification service in `apps/api`; storage shape deferred to `docs/SCHEMA.md`.
- **Automated test:** Integration — a correction produces a trail entry with all four fields; entries are append-only.
- **Manual check:** Correct a field in dev; confirm the entry exists and cannot be altered after the fact.
- **Class:** A

### SI-15 — Patient-facing content derives only from verified data, on every channel
- **Invariant:** Every outbound channel — reminder generation, translation, text-to-speech, and messaging delivery — reads only human-verified medication data. The source-of-truth rule is not specific to reminders; it holds for *all* current and future patient-facing channels.
- **Why:** §26 generalized — this closes the loophole in which a newly added channel bypasses SI-03 by reading raw parser output directly.
- **Forbidden:** Any channel rendering or sending content sourced from unverified or raw parser output.
- **Required:** All patient-facing channels consume one shared "verified medication → deliverable" representation and nothing else.
- **Enforcement (prospective):** A single shared verified-data representation in `apps/api` that every provider (translation, TTS, messaging) consumes; provider seams defined later in `API_CONTRACTS.md`.
- **Automated test:** Contract/integration — each provider receives only verified data (or rejects unverified input) across channels.
- **Manual check:** Audit every provider's input source and confirm it is the shared verified representation.
- **Class:** A ±M

### SI-16 — Sensitive prescription data is not written to plaintext logs
- **Invariant:** Raw OCR text, drug names, prescription contents, medication details, and patient identifiers are never written to plaintext application or system logs. Logs reference record identifiers only. **Scope:** this invariant concerns *application/system logging output* — it does **not** prohibit storing the required prescription and medication data in the controlled application database, which is the system's legitimate purpose.
- **Why:** §26 (DPDP) and §33 — logs are copied, shipped, and retained in places the database's protections do not reach; sensitive health data leaking through a log line is a real disclosure. "Asserted by test, not by convention" (§26).
- **Forbidden:** Emitting raw OCR text, drug names, prescription/medication content, or patient identifiers through any logging path (application logs, error/stack traces, request logs, log-shipping).
- **Required:** Log record identifiers and non-sensitive metadata only; route any needed detail through the controlled data store, not the log stream. Redaction is the default on logging paths.
- **Enforcement (prospective):** Centralized logging boundary in `apps/api` (and the Python perception service) with redaction/allow-listing; sensitive values never passed to loggers.
- **Automated test:** Assert that representative logging paths, when given a prescription/medication payload, emit no drug name, no raw OCR text, and no patient identifier — only record IDs (§30). Include error/exception paths, since these most often leak payloads.
- **Manual check:** Exercise OCR, parsing, verification, and delivery in dev with log capture; grep the captured logs for known drug names and OCR strings and confirm absence.
- **Class:** A

---

## 5. Enforcement map

All locations are PROSPECTIVE (no implementation exists). "Testable now" marks invariants
whose tests need no database or credentials and can be written against the pure parser
today; the rest are gated on the schema, verification view, or providers landing.

| SI | Prospective enforcement point | Class | Earliest testable |
|----|-------------------------------|-------|-------------------|
| 01 | Prescription verification-state transition (`apps/api`) | G ±M | Schema |
| 02 | Patient-facing emission boundaries + shared approved-only read | G ±M | Schema |
| 03 | Reminder-generation guard clause (`apps/api`) | G | Schema (BUILD_ORDER Step 2) |
| 04 | Parser type (`packages/shared-types`) + persistence/correction path | P + A ±M | Parser now / persistence later |
| 05 | Parser + verification-view render contract | P ±M | Parser now / view later |
| 06 | Parser matcher + token boundaries | P | **Now** |
| 07 | Parser category isolation | P | **Now** |
| 08 | Parser rule set (fields structurally unwritable) | P | **Now** |
| 09 | Parser single-dose + adherence discipline | P ±M | Parser now / adherence later |
| 10 | Lifecycle stop handler (no clinical-verification precondition; authz = OQ-05) | L ±M | Schema |
| 11 | Transactional lifecycle + reminder cancellation | L | Schema |
| 12 | Lifecycle transition logic + revision re-verification | L | Schema |
| 13 | Parser composition/conflict step | P | **Now** |
| 14 | Correction/audit record + verification-service write | A | Schema |
| 15 | Shared verified-data representation consumed by all providers | A ±M | Providers |
| 16 | Central logging boundary with redaction (`apps/api` + Python) | A | Logging layer |

**Mechanically enforced (code/test):** SI-01, 02, 03, 06, 07, 08, 10, 11, 12, 13, 14, 16.
**Mechanical-origin with a required manual-confirmation component:** SI-04, 05, 09, 15.
**Explicitly not mechanically enforceable — a tracked residual risk, not an invariant:**
the medical *correctness* of a verified interpretation (§2, §8).

---

## 6. Automated test strategy

Each invariant is bound to a test named for its `SI-id`, mirroring the dictionary's
`rule_id`-named-test convention (D-008) so traceability survives without coupling code to
prose. Tests are written **failing-first**, before the code they guard.

- **Parser unit tests — writable now, no dependencies:** SI-05, 06, 07, 08, 09, 13,
  transcribed by hand from dictionary §11 conceptual cases, plus the dictionary-wide
  invariant that no rule writes the maximum-dose or minimum-interval fields (SI-08).
- **Gate and lifecycle integration tests — gated on the schema (BUILD_ORDER Step 2):**
  SI-01, SI-03 (the flagship "reminders cannot be generated for unconfirmed medications"),
  SI-10, SI-11 ("no live reminders for a stopped medication, cancelled atomically"),
  SI-12 (disallowed transition rejected; revision re-enters verification), SI-14
  (correction writes an append-only trail).
- **Contract / data-flow tests — as channels land (Steps 4–6):** SI-02, SI-15 (each
  provider receives only verified data), SI-04 (a persisted verified field retains
  provenance), SI-05 (the view payload carries candidate readings).
- **Logging tests — as the logging layer lands:** SI-16, asserting sensitive fields never
  appear on representative logging paths, including error/exception paths.

Highest-priority targets, per §30: SI-01, SI-03, SI-11, SI-12, SI-14, SI-16.

---

## 7. Manual verification protocol

For what automation cannot fully prove:

- **SI-04** — trace one verified medication end-to-end; every field resolves to a `rule_id` or a named human.
- **SI-05** — open an ambiguous case in the verification view; both readings render, nothing pre-resolved.
- **SI-09** — confirm no downstream step asserts a `stat` dose was administered.
- **SI-10** — confirm a stop needs no clinical verification *and* that the authorization gap (OQ-05) is tracked, not assumed closed.
- **SI-15** — audit every outbound provider's input source.
- **SI-16** — capture dev logs across the full pipeline and grep for known drug names and OCR strings; confirm absence.

**Standing review gate.** Any change touching reminder generation, prescription/medication
verification state, medication lifecycle, a patient-facing channel, or the logging boundary
is treated as safety-relevant and reviewed against this file before merge (§26, §35).
**Standing rule.** Weakening any invariant requires a written `DECISIONS.md` entry with
sign-off — never a silent side effect.

---

## 8. Residual-risk register

These are known safety limits that the invariants above do **not** eliminate. They are
recorded honestly rather than papered over.

- **Interpretation correctness (the core residual risk).** SI-01…SI-03 and SI-15 guarantee
  that only human-verified instructions reach a patient. They do not guarantee the
  verification was medically correct. Narrowed by §18.5 DP2 (comprehensible verification);
  closed only by pharmacist review (§25), which is out of scope.
- **Verifier fallibility.** Verifiers are untrained family members and volunteers; the gate
  ensures a human looked, not that they were right (§2).
- **Open questions touching invariants — not resolved here:**
  - **OQ-05** — how the caregiver↔patient link is established and trusted. Bears directly on SI-10 (authorization vs. verification).
  - **OQ-08** — what happens when a `needs_attention` escalation reaches no responding caregiver; a dead-end escalation creates false assurance.
  - **OQ-10** — whether a `stat` dose generates a reminder and who determines it was administered (bears on SI-09).
  - **OQ-13** — whether `dictionary_version` is persisted with stored parse results (bears on SI-04's persistence clause).

These remain open in MASTERPLAN §37 and are not decided by this document.

---

## 9. Cross-references

- **MASTERPLAN §26** — the non-negotiable rule, the guarantee/residual-risk distinction, DPDP, auditability (source of SI-01, 02, 03, 04, 14, 16).
- **MASTERPLAN §18.5** — verification design principles; DP2 comprehensibility (SI-05).
- **MASTERPLAN §18.10 / §21** — medication lifecycle and the atomic stop/supersede behavior (SI-10, 11, 12).
- **MASTERPLAN §30 / §35** — testing philosophy and Definition of Done.
- **MASTERPLAN §37** — open questions OQ-05, OQ-08, OQ-10, OQ-13.
- **`docs/SHORTHAND_DICTIONARY.md`** — §5 provenance (SI-04), §7 category permissions (SI-07, 08, 09), §8 conflict handling (SI-13), §9 missing fields (SI-07), §10 unsupported-token protocol (SI-06), §11 conceptual test cases.
- **`docs/DECISIONS.md`** — D-007 (tiers), D-008 (dictionary as spec), D-009 (no fuzzy matching), D-010 (SI-07), D-011 (SI-08).
- **`docs/SCHEMA.md`, `docs/API_CONTRACTS.md`** — *not yet written*; will choose the representations and boundaries these invariants constrain.
