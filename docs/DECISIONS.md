# DECISIONS.md

> Append-only decision log. One entry per non-obvious choice, written **when you make
> it** — reconstructed reasoning always reads as reconstructed.
>
> Format: what was decided, what else was considered, what it costs. Keep entries short.
> Newest at the bottom.

---

## D-001 — Parser in TypeScript inside `apps/api`, not Python

**Date:** 2026-08-23
**Status:** Accepted

MASTERPLAN Section 19 left this open ("TypeScript or Python").

**Decision:** the shorthand parser lives in TypeScript in `apps/api`. The Python service
does perception only (pixels → text + confidence).

**Alternatives:** parser in the Python OCR service, keeping all text processing together.

**Why:** parser output feeds the verification gate and the database writes, both in Node.
Keeping it in Node avoids a network hop on the safety-critical path and lets parser and
gate share types via `packages/shared-types`. Resulting boundary is easy to defend:
**Python does perception, Node does interpretation and safety.**

**Cost:** gives up Python's richer text-processing ecosystem. Judged not to matter for
rule-based dictionary matching.

---

## D-002 — Build the parser before the infrastructure

**Date:** 2026-08-23
**Status:** Accepted

**Decision:** first coding task is the shorthand parser, not the `patients` Knex
migration.

**Why:** the parser needs no credentials, database, or Docker, so it cannot be blocked by
external onboarding. It is also the intellectual core of the project and the part a
reviewing engineer will actually read. The migration is quick work that slots in anywhere
and gains nothing from being first.

**Cost:** the parser is initially developed against fixtures rather than real persisted
data. Acceptable — it is a pure function by design.

---

## D-003 — `AGENTS.md` as the single canonical agent instruction file

**Date:** 2026-08-23
**Status:** Accepted

**Decision:** `AGENTS.md` is canonical. `CLAUDE.md`, `GEMINI.md`, and `.cursorrules` are
one-screen stubs that redirect to it. MASTERPLAN's planned `AI_CONTEXT.md` is folded into
`AGENTS.md` and will not be created separately.

**Alternatives:** maintaining per-tool instruction files; symlinking (rejected — the
project owner develops on Windows, where symlinks are awkward and often not preserved by
git checkouts).

**Why:** the project is worked on by several different agent tools (Claude Code, Codex,
Antigravity, OpenCode) so that hitting a token limit in one is not blocking. Duplicated
instruction files would drift, and drift in the file that states the safety rule is the
worst possible drift. `AGENTS.md` is read natively by several of these tools already.

**Cost:** one extra indirection for tools that auto-load a different filename. Trivially
cheap versus divergence.

---

## D-004 — One volatile state file, not two

**Date:** 2026-08-23
**Status:** Accepted

**Decision:** `HANDOFF.md` absorbs the role MASTERPLAN Section 34 assigned to
`PROJECT_STATE.md`. `PROJECT_STATE.md` will not be created.

**Why:** both files were specified to hold "what has been built so far / current status."
Two overlapping trackers reliably diverge, and a stale progress file actively misleads a
fresh agent. Git history is the real record; `HANDOFF.md` is the human-readable cursor
over it.

**Cost:** MASTERPLAN Sections 1, 2, and 34 needed updating to match. Done in v1.1.0.

---

## D-005 — Handoff written continuously, not at session end

**Date:** 2026-08-23
**Status:** Accepted

**Decision:** agents write their intended task into `HANDOFF.md` **before** starting it,
update it after each meaningful step, and commit WIP freely.

**Why:** the multi-agent workflow exists because sessions die at token limits — which
means they die *without warning*, precisely when an end-of-session update cannot be
written. A protocol that only works when the session ends gracefully fails in the exact
case it was designed for.

**Cost:** slightly more bookkeeping per session. Cheap relative to losing a task's
context.

---

## D-006 — Scope cuts against MASTERPLAN's phase list

**Date:** 2026-08-23
**Status:** Accepted

**Decision:** cut handwriting OCR (Phase 4), multi-language beyond Marathi (Phase 5), and
the production WhatsApp sender (use the Twilio sandbox). Keep TTS only if Bhashini
onboarding lands.

**Why:** solo developer at 6–12 hrs/week optimizing for portfolio depth. MASTERPLAN
Section 24 already states voice notes, handwriting OCR, and multi-language are not
required for MVP completion. Handwriting OCR specifically is likely to perform badly on
Indian clinical handwriting, making the demo worse rather than better.

**Cost:** the project no longer covers its own Phase 4/5. Documented as future scope with
the accuracy reasoning stated, which is itself a defensible signal.

**Open risk:** if WhatsApp requires approved templates for business-initiated messages,
sandbox-only delivery may not fully satisfy MASTERPLAN Section 24's "delivered in Marathi
(text) via WhatsApp on schedule." Unresolved — tracked as MASTERPLAN Section 37, OQ-02.

---

## D-007 — Five interpretation tiers instead of a binary parsed/unparsed split

**Date:** 2026-08-23
**Status:** Accepted

**Decision:** every dictionary rule carries exactly one of five tiers: `deterministic`,
`deterministic-with-anchor`, `requires-verifier-decision`, `no-schedule-derivable`,
`unsupported`. Where a token could sit in two tiers, the lower-authority tier wins.

**Alternatives:** a binary parsed/unparsed flag, with a confidence score for the middle
ground.

**Why:** a binary split forces genuinely different failure modes into one bucket. "I do not
recognise this token," "I recognise it but it has two meanings here," and "I recognise it
and it means no schedule can exist" require different verifier actions, and collapsing them
loses the distinction the verifier needs. A confidence score was rejected because a number
invites a threshold, and a threshold on shorthand interpretation is a silent decision
boundary — the opposite of what MASTERPLAN Section 26 asks for.

**Cost:** more structure for an implementer to hold, and each new rule needs a deliberate
tier choice rather than defaulting.

---

## D-008 — The dictionary is a human-reviewed specification, not an executable artifact

**Date:** 2026-08-23
**Status:** Accepted

**Decision:** `docs/SHORTHAND_DICTIONARY.md` is human-readable documentation. No build step,
script, or test helper parses it. Parser tests are written manually from it, each named after
the `rule_id` it covers.

**Alternatives:** embedding YAML/JSON blocks in the Markdown and generating Jest fixtures
from them, so specification and tests could never drift.

**Why:** the drift argument is real but the cure is worse. A file that is also a machine
input evolves towards whatever the machine needs — stable keys, parseable structure, no
prose — and away from what a human can actually review. Since the document's entire value is
that a human read and approved every rule before the parser implemented it, optimising it for
a parser would remove the reason it exists. Hand-naming tests after rule IDs gives most of the
traceability at none of the coupling cost.

**Cost:** specification and tests can drift. Mitigated by rule-ID naming in tests and by the
dictionary-wide invariants listed in dictionary §11, not eliminated.

---

## D-009 — No fuzzy matching, with mandatory token-boundary enforcement

**Date:** 2026-08-23
**Status:** Accepted

**Decision:** shorthand matching is exact, after only three declared normalizations (case
folding, token-internal period stripping, whitespace trimming). No edit-distance, phonetic,
n-gram, or character-substitution matching. Matches must be delimited by token boundaries, so
`ODT` never matches `OD`, `BDS` never matches `BD`, and `statin` never matches `stat`.

**Alternatives:** permitting small edit distances to recover OCR corruptions such as `8D` for
`BD`, which would measurably raise the proportion of tokens successfully parsed.

**Why:** OCR repair and shorthand interpretation fail in opposite directions. A missed token
produces a flagged unknown that costs a verifier seconds; a repaired token produces a
confident frequency that may be wrong and looks identical to a correct one. Substring matching
is the same failure without even the excuse of a corrupted input — `ODT` is a dosage form, and
reading "once daily" out of it fabricates an instruction from a word about tablet coating.

**Cost:** corpus accuracy metrics will look worse than a fuzzy matcher's. This is accepted and
should be stated when the metric is reported, since the number is lower for a defensible
reason.

---

## D-010 — `dose_amount` is never inferred from `dose_strength`

**Date:** 2026-08-23
**Status:** Accepted

**Decision:** the `dose-strength` category may write only `dose_strength_value` and
`dose_strength_unit`. `dose_amount` and `dose_unit` come exclusively from the `dose-amount`
category. `Metformin 500 mg BD` yields a strength and a frequency, and reports `dose_amount`
as missing — it never yields `dose_amount: 1, dose_unit: tablet`.

**Alternatives:** defaulting to one tablet when a strength is present and no count is, which
is correct in the large majority of real prescriptions.

**Why:** the minority case is a factor-of-two dosing error in a form nobody would audit. Where
a 500 mg dose is dispensed as two 250 mg tablets, `1 tablet` is both wrong and completely
plausible-looking, so it survives review precisely because it looks like something a
prescription would say. A `null` plus a missing-field report puts the question in front of a
human; a default removes any trace that a question existed.

**Cost:** more verifier interactions, since a common and usually-correct inference is now a
prompt. Judged the correct trade for a dosing quantity.

---

## D-011 — Conditional-use tokens produce no ceiling, no interval, and no schedule

**Date:** 2026-08-23
**Status:** Accepted

**Decision:** `SOS` and `PRN` set `as_needed: true` and `schedule_derivable: false`. No rule
in the dictionary is capable of writing `max_doses_per_day` or `min_interval_hours` — they
appear in no category's permitted-writes list. Both remain `null` unless explicitly present in
the prescription or explicitly entered and confirmed by the human verifier.

**Alternatives:** a conservative default ceiling per drug class, or a generic maximum such as
four doses per day.

**Why:** a fabricated ceiling is a maximum dose the prescriber never wrote, sitting exactly
where a real safety limit belongs. For a drug with a genuine toxicity threshold — paracetamol
being the obvious case — that is the most dangerous possible field to guess, because the guess
is indistinguishable from a real limit. Making the fields structurally unwritable is stronger
than a policy of not writing them: no future change can accidentally populate them without
first adding a producing rule, which is a visible, reviewable act.

**Cost:** as-needed medications generate no reminders at all until a human supplies limits.
Correct behaviour, but it means the feature looks incomplete in a demo unless the reason is
explained.

---

## D-012 — `OD` handled as one decision path with a narrow ophthalmic predicate

**Date:** 2026-08-23
**Status:** Accepted

**Decision:** `OD` is one decision path with two mutually exclusive outcomes. A literal-presence
predicate checks the current medication line for a closed list of ophthalmic markers (`eye
drop`, `e/d`, `ophthalmic`, `gtt`, `drops`, `OS`, `OU`, `instil`, and similar). Predicate false
routes to `FREQ-OD-001` (deterministic, once daily); predicate true routes to `AMBIG-OD-001`
(`requires-verifier-decision`, both readings presented). Exactly one fires, never both.

**Alternatives:** treating `OD` as globally deterministic once-daily, which is correct on the
overwhelming majority of prescriptions; or building general clinical-context inference.

**Why:** in an ophthalmic context `OD` may mean *oculus dexter*, the right eye. Reading it as
"once daily" on an eye-drop line converts a laterality instruction into a frequency, which is
not a near-miss but a different kind of instruction entirely. General context inference was
rejected as far too large a mechanism for one token and impossible to review; the predicate is
deliberately narrow — one line, literal presence only, drug name never consulted, and `OS`,
`OU`, `gtt` treated as signal literals that flip the predicate without ever being interpreted
themselves.

**Cost:** the predicate can be wrong in both directions. A false positive costs one verifier
prompt on a correctly-once-daily line; a false negative returns the pre-existing behaviour.
The asymmetry is acceptable because the true branch escalates to a human rather than choosing.

---

## D-013 — `verification_status` and `lifecycle_state` are separate, orthogonal axes on `medications`

**Date:** 2026-08-24
**Status:** Accepted

The schema task had to choose how to represent both "has a human confirmed this?" and "where is
this medication in its treatment lifecycle?"

**Decision:** two independent columns. `verification_status` (`pending` / `confirmed` /
`corrected` / `rejected`) is the SI-01 gate axis; `lifecycle_state` (`active` / `completed` /
`stopped` / `superseded`, `NULL` until live) is the clinical axis. The patient-facing
**deliverable predicate** is their conjunction: `verification_status IN ('confirmed','corrected')
AND lifecycle_state = 'active'`.

**Alternatives:** a single combined status enum spanning both gate and lifecycle.

**Why:** the two answer different questions and change on different events. A medication a human
has confirmed, on a prescription not yet fully verified, is a real and valid interim state
(`confirmed` + `lifecycle_state NULL`) that a single column cannot express without inventing
hybrid values. Separation keeps the delivery gate a plain conjunction and localises each concern.
Conflating them was judged the most likely source of a delivery-gating bug.

**Cost:** two columns and a documented predicate to keep in sync instead of one; every
patient-facing path must check both conjuncts.

---

## D-014 — Enumerated states as `text` + `CHECK`, not native `ENUM` or lookup tables

**Date:** 2026-08-24
**Status:** Accepted

**Decision:** every enumerated-state column (`status`, `verification_status`, `lifecycle_state`,
`role`, reminder/adherence/audit states) is `text` constrained by a `CHECK` on its value set.

**Alternatives:** PostgreSQL native `ENUM` types; foreign keys to lookup tables.

**Why:** these values appear constantly in queries and logs, where readable text beats an opaque
enum label or a lookup id. Adding or retiring a permitted value is a plain constraint change
rather than an `ALTER TYPE` (awkward to reverse, historically transaction-unfriendly) or a
lookup-table migration with a join on every read. The safety value of the constraint — rejecting
unknown states — is fully preserved.

**Cost:** a `CHECK` gives weaker type-system guarantees than a native `ENUM`; the permitted set
lives in a constraint definition rather than a first-class type.

---

## D-015 — Provenance stored in an immutable `parse_result` JSONB column; no `dictionary_version` column; OQ-13 left open

**Date:** 2026-08-24
**Status:** Accepted

**Decision:** the full parser output — `candidate_readings`, `missing_fields`,
`unparsed_fragments`, and the five per-field provenance fields (`rule_id`, `dictionary_version`,
`matched_literal`, `source_span`, `match_type`) — is stored in one immutable
`medications.parse_result` JSONB column. There is **no** separate top-level `dictionary_version`
column; it lives only inside the provenance objects.

**Alternatives:** promoting the five provenance fields (or `dictionary_version` specifically) to
scalar columns.

**Why:** provenance is per-field and structurally rich; flattening it to columns would either
lose structure or explode the table width. An immutable blob matches the parser's write-once model
— revisions create new rows (D-013/§9), they never edit `parse_result`. Promoting
`dictionary_version` to a queryable column would silently resolve OQ-13; whether it needs
first-class persistence (e.g. to query "all rows parsed under dictionary vX") is deliberately kept
open.

**Cost:** querying by a provenance field needs JSONB access rather than a plain indexed column;
OQ-13 stays unresolved and must still be answered.

---

## D-016 — `medication_audit_events` is required append-only safety infrastructure; enforcement mechanism deferred

**Date:** 2026-08-24
**Status:** Accepted

**Decision:** a dedicated `medication_audit_events` table records every consequential medication
event (parse, verification action, lifecycle transition) with `old_value`, `new_value`, actor
identity, `reason`, and timestamp. It is required by SI-14, not optional. Rows are **append-only**.

**Alternatives:** reconstructing history from the current `medications` row plus application logs;
no dedicated table.

**Why:** SI-14 requires an append-only trail of old value / new value / actor / timestamp, and the
`medications` row holds only current state. Application logs are redacted (SI-16) and are not a
reliable record. A dedicated table is the only structure that satisfies the invariant. The
append-only property is stated as a required *property*; **how** it is enforced (triggers, `REVOKE`
of UPDATE/DELETE, database roles, or application discipline) is left to the implementation task so
the schema document prescribes no mechanism.

**Cost:** every consequential write to `medications` must be accompanied by an audit insert; the
enforcement mechanism is still to be chosen.

---

## D-017 — `reminders` message payload deferred (blocked on OQ-02)

**Date:** 2026-08-24
**Status:** Accepted (deferral)

**Decision:** the `reminders` table is documented except for its message-payload columns, which
are left unspecified. The schema does **not** choose between a single rendered `body` and a
`template_name` + ordered `template_variables` payload.

**Alternatives:** committing now to one payload shape to finalise the table.

**Why:** WhatsApp business-initiated messages may require pre-approved, per-language templates with
bounded variables — which dictates a template-shaped payload — or may allow a free body if not.
This is unverified (OQ-02) and platform-dictated, not our choice to invent. MASTERPLAN §21 requires
OQ-02 resolved before the `reminders` migration is written. Guessing the shape would likely force a
destructive migration later, on the delivery-critical path.

**Cost:** the `reminders` migration cannot be written and the table cannot be finalised until OQ-02
is resolved.

---

## D-018 — No prescription-level supersession column

**Date:** 2026-08-24
**Status:** Accepted

**Decision:** `prescriptions` has no `superseded_by_prescription_id` (or equivalent). Supersession
is modelled only at the medication level, via `medications.superseded_by`.

**Alternatives:** a prescription-level pointer expressing "this prescription replaces that one."

**Why:** MASTERPLAN §21 names a `superseded_by` self-reference on `medications` only. Supersession
is a clinical event on a specific medication (a revised dose replaces an old one); a parallel
prescription-level pointer would create a second supersession axis with no defined interaction with
the medication-level one, inviting divergence about which is authoritative. A whole-prescription
replacement, if ever needed, is expressible as supersession of its medications.

**Cost:** "this prescription supersedes that one" is not a single queryable fact; it must be
derived from the medication-level links.

---

## D-019 — `lifecycle_state` uses `NULL` for "not yet live", not an invented `pending_activation` state

**Date:** 2026-08-24
**Status:** Accepted

**Decision:** a medication that has not entered its clinical lifecycle has `lifecycle_state = NULL`.
No `pending_activation` (or similar) state is added. The only transition out of `NULL` is
`NULL → active`, occurring only when the prescription passes the SI-01 gate.

**Alternatives:** an explicit `pending_activation` lifecycle value "for completeness."

**Why:** the documented lifecycle set (§18.10, SI-12) is `active` / `completed` / `stopped` /
`superseded`; `pending_activation` is not in it, and adding a state purely for completeness
duplicates information already carried by `verification_status`, creating a two-axis drift hazard.
`NULL` cleanly means "lifecycle not applicable yet." Safety is preserved because the deliverable
predicate requires `lifecycle_state = 'active'`, so a `NULL` medication is never deliverable and
never reminder-generating.

**Cost:** `NULL` semantics must be documented and understood; a three-valued column requires
`IS NULL` handling in queries rather than a simple equality.

---

## D-020 — SI-08 ceiling fields are parser-unwritable and human-confirmable, with no DB default and no origin constraint

**Date:** 2026-08-24
**Status:** Accepted

**Decision:** `max_doses_per_day` and `min_interval_hours` exist as nullable columns with **no
default**. The parser can never write them (enforced in the parser and shared types, per
D-011/SI-08). A human verifier **may** explicitly enter and confirm a value when the prescription
itself states one. The database applies no default and **no** constraint attempting to enforce who
wrote the value; only ordinary value-validity (positive-when-present, `NULL` always allowed) is
permissible.

**Alternatives:** a DB default or `NOT NULL`; or a constraint attempting to enforce
parser-vs-human origin.

**Why:** a fabricated ceiling is the most dangerous field to guess (D-011), so the parser must
never write it — yet a limit the prescription actually states, confirmed by a human, is legitimate
data that must be storable. The database cannot distinguish origin, so any origin-gating constraint
would risk blocking a legitimate human-confirmed value. The guarantee therefore lives in the
code/type layer and the database stays provenance-neutral for these two fields. Presence of the
column is not permission for the parser to populate it: **parser output cannot contain these
values; human-verified data may.**

**Cost:** the parser-unwritable guarantee is not enforced by the database and depends on the
parser/type layer holding it; at the raw SQL level the columns look ordinarily writable.

---

## D-021 — OCR confidence never crosses into interpretation

**Date:** 2026-08-25
**Status:** Accepted

**Decision:** the parser's only input is the raw OCR text. No OCR confidence score — per-character,
per-word, per-line, or per-document — is passed to `parse()`, and no parser behaviour varies with
confidence. Confidence is used *before* the boundary, by the perception layer, to decide whether to
retry or escalate to the LLM-vision fallback (OQ-03); it stops there.

**Alternatives:** pass confidence through so the parser could downgrade a low-confidence match, or
attach it to provenance for the verification view.

**Why:** confidence-dependent parsing would mean identical text parses differently depending on how
the image happened to scan, breaking the determinism guarantee that makes the parser testable and
auditable. It would also reintroduce a threshold, and D-007 already rejected numeric confidence in
interpretation for exactly this reason: a number invites a threshold, and a threshold on shorthand
interpretation is a silent decision boundary. Low-confidence OCR is a *perception* problem with a
perception-layer remedy (retry, better model, human re-upload); silently weakening interpretation is
not a remedy, it just moves the failure somewhere less visible. Separately, the safety model already
routes every reading through a human (SI-01), so the parser has no need to self-censor.

**Cost:** the verification view cannot say "this token scanned poorly, look closely" unless the
perception layer surfaces that separately alongside the parse; the two signals must be joined
outside the parser if that is ever wanted.

---

## D-022 — Parser output records facts about the input text, not static properties of rules

**Date:** 2026-08-25
**Status:** Accepted

**Decision:** a provenance record contains exactly five fields — `rule_id`, `dictionary_version`,
`matched_literal`, `source_span`, `match_type`. `tier` and `canonical_expansion` are **not** parser
output. Both are static properties of a rule, and a consumer that needs them resolves them from
`rule_id` + `dictionary_version`.

**Alternatives:** denormalise `tier` (so a consumer can sort by authority without a lookup) and/or
`canonical_expansion` (so the verification view can render without a lookup) into each record.

**Why:** the five fields are the dictionary's declared provenance set (§5) and SI-04's requirement;
each is a fact about *this* text — which rule fired, against which dictionary, on which literal, at
which offsets, by which matching mode. `tier` and `canonical_expansion` are facts about the *rule*,
identical for every match of that rule at that dictionary version. Copying them into output creates
a second source of truth that can silently disagree with the dictionary — the failure mode is a
verification screen showing a stale expansion that no longer matches the rule it cites, which is
precisely the safety-relevant surface (SI-05, SI-15). Keeping the dictionary the sole authority for
rule semantics means a corrected expansion is corrected everywhere at once. The version pin makes
the lookup unambiguous even for historical records.

**Cost:** every consumer needs a rule-lookup path, including the verification view, so the parse
result is not fully self-explaining on its own; rendering requires the dictionary (or a build
artifact derived from it) to be available at that point.

---

## D-023 — `source_span` uses half-open Unicode code-point offsets

**Date:** 2026-08-25
**Status:** Accepted

**Decision:** `source_span` is `[start, end)` — zero-based, end-exclusive — measured in **Unicode
code points** of the exact text persisted in `prescriptions.raw_ocr_text`. JavaScript's native
UTF-16 code-unit indexing is explicitly *not* the contract unit. The contract fixes the unit only;
the conversion mechanism is an implementation matter.

**Alternatives:** UTF-16 code units (free in JavaScript, `slice` just works); UTF-8 bytes (free in
Python and in PostgreSQL storage); grapheme clusters (closest to "what a human sees as one
character").

**Why:** spans are written by TypeScript, stored in PostgreSQL, and read by a verification UI and
potentially by Python tooling — so the unit must mean the same thing in all of them, and must be
intrinsic to the text rather than to one runtime's string representation. UTF-16 and UTF-8 both
encode the *same* text differently, and they diverge on real prescription content: Devanagari for
Marathi labels, and any character outside the BMP. Code points are the one unit that is a property
of the text itself. Grapheme clusters were rejected because their definition is versioned (UAX #29),
so the same offsets could shift meaning under a library upgrade — unacceptable for a stored,
auditable pointer. Half-open was chosen because `end - start` is the length and adjacent spans abut
without ambiguity, and because an empty span is representable without a special case.

**Cost:** the natural JavaScript operations (`length`, `slice`, `substring`, `charAt`, `[i]`) are
*not* the contract unit, so a conversion is required at the boundary and a plain `slice(start, end)`
is a latent bug on non-BMP input. This must be covered by an explicit divergence test rather than
left to reviewer vigilance.

---

## D-024 — `dose_amount` uses an exact integer/fraction representation; floating point is prohibited

**Date:** 2026-08-25
**Status:** Accepted

**Decision:** `dose_amount` is represented exactly — either an exact integer, or an exact
numerator/denominator pair. `½` is 1/2, never `0.5`; `¼` is 1/4, never `0.25`. No floating-point
number may represent a dose amount anywhere in parser output, and the original token is preserved in
`matched_literal` regardless.

**Alternatives:** a floating-point number (simplest, and every consumer already handles numbers); a
decimal string; store the literal only and let consumers parse it.

**Why:** a dose amount is an instruction a human will act on, so it must round-trip without
approximation and must be renderable back as the fraction the prescription actually wrote. Floating
point cannot represent thirds exactly, and it invites arithmetic — averaging, summing, unit
conversion — on a value whose only legitimate use is to be shown to a human and confirmed. It also
loses the distinction between `0.5` and `½` at render time, and "take 0.5 tablet" is a worse
instruction than "take half a tablet" for the patient population this system serves. Keeping the
literal alone was rejected because consumers would each re-parse it, which is a fuzzy-parsing
surface reintroduced in a new place. `SCHEMA.md` §10 already flagged the exact representation as
open; this fixes the semantics while leaving the storage encoding to the schema.

**Cost:** consumers cannot do naive arithmetic on `dose_amount`; comparison and rendering need
fraction-aware handling, and the JSON encoding must be chosen so that a round-trip is provably
lossless.

---

## D-025 — Drug-name extraction is outside the Phase 1 parser contract

**Date:** 2026-08-25
**Status:** Accepted

**Decision:** the parser does not extract drug names, and `drug_name` is structurally absent from
parser output. `medications.drug_name` remains in the schema and must be populated by something
else, specified separately.

**Alternatives:** implement a heuristic now (the leading token of a medication line, optionally
validated against a drug list) so the Phase 1 field is not left empty.

**Why:** MASTERPLAN §18.3 lists drug-name extraction among the parsing module's responsibilities,
but **no rule among the dictionary's 19 authorises it** — no token category's permitted writes
include `drug_name`, and there is no reviewed specification of what a drug name looks like in this
text. Writing the heuristic anyway would make the implementation the specification, which is the
exact inversion D-008 exists to prevent, and it would do so on a field whose failure modes are
severe: `Predmet` versus `pc`, `Tab Atorvastatin` versus `stat`, and every OCR-mangled brand name
are already documented boundary traps (dictionary §11). A wrong drug name presented confidently to a
verifier is worse than a blank field, because a blank field is obviously incomplete. Introducing a
drug list would additionally violate the parser's purity and no-external-input constraints.

**Cost:** `medications.drug_name` has no producer at the end of Phase 1, so either the verifier
enters it manually or a subsequent task specifies extraction properly. Recorded as discovered gap #1
in `docs/API_CONTRACTS.md` §14.1.

---

## D-026 — npm is the package manager for `apps/api`

**Date:** 2026-08-26
**Status:** Accepted

**Decision:** `apps/api` uses **npm** — the version bundled with the Node 20 image its
`Dockerfile` already pins — and commits `package-lock.json`. No workspaces, no pnpm, yarn, or Bun,
and no Turborepo or Nx. The scope is `apps/api` only; this decision creates no root `package.json`
and makes no claim about how `apps/dashboard` or `packages/shared-types` will be wired later.

**Alternatives:** pnpm (faster, disk-efficient, strict about phantom dependencies, and the usual
choice for a monorepo); yarn; Bun; npm workspaces declared at the repository root now rather than
later.

**Why:** npm ships with Node, so it adds nothing to install, nothing to document, and no extra
step in any future CI job — and `apps/api/Dockerfile` already fixes Node 20 as the runtime, which
makes npm the zero-decision default rather than a preference. The advantages of pnpm and of
workspaces are real but they are *monorepo* advantages, and there is nothing to hoist yet:
`BUILD_ORDER.md` §4 Step 1 is explicitly a standalone parser with zero external dependencies, and
`packages/shared-types` is empty. Paying for a second package-manager toolchain before any code is
shared would buy tidiness at the cost of a lockfile format fewer readers recognise and an install
path a reviewer has to be told about. This project's value is the safety argument, so the build
system should be the least surprising thing in the repository. `.gitignore` already anticipated
this choice — it deliberately does not ignore lockfiles, and points at a package-manager question
it attributes to MASTERPLAN §37; that section contains OQ-01 … OQ-13 and no such question, so the
pointer is stale and **this entry is the answer it was pointing at**.

**Cost:** if `packages/shared-types` later needs to be consumed by both `apps/api` and
`apps/dashboard`, plain npm means relative `file:` dependencies or a migration to workspaces at
that point. Deliberately deferred until there is shared code to share. npm is also the slowest of
the candidates on cold installs, which is irrelevant at this size and would stop being irrelevant
only in CI on a much larger dependency tree.

---

## D-027 — `match_type` records the normalization a match actually required

**Date:** 2026-08-26
**Status:** Accepted

**Decision:** `match_type` is a per-match observation, and exactly one of the four values already
defined (dictionary §4) — no value is added. It names the normalization *this* match required:
`exact` when the text is a declared `match_forms` literal matched untouched; `case-insensitive`
when only case folding was needed; `punctuation-normalized` when a token-internal period was
stripped, with or without case folding; `regex` for rules that match by declared pattern rather
than by literal. Where two normalizations apply, the most-transforming one wins —
`punctuation-normalized` over `case-insensitive` over `exact`. Whitespace trimming never affects
the value. So for `FREQ-BD-001`: `BD` → `exact`, `bd` → `case-insensitive`, `B.D.` and `b.d.` →
`punctuation-normalized`. The per-entry `Match type` row in dictionary §7 lists the normalizations
a rule *may* apply and is not the recorded value.

**Alternatives:** (a) record the rule's declared set as an array; (b) always record the rule's
declared normalization, so every literal match of a case-insensitive rule reports
`case-insensitive` and `exact` is never used; (c) leave it unspecified until the parser is
written.

**Why:** the ambiguity surfaced while planning the first parser test and had to be settled before
a test could assert anything about the field. Dictionary §5 and `API_CONTRACTS.md` §5 both require
**exactly one** value per match, which rules out (a) — and an array would restate the rule rather
than observe the text, duplicating information the `rule_id` already carries. (b) was rejected
because it makes `BD` and `bd` indistinguishable in the one field whose stated purpose is to show
*how* the match was reached, and it leaves `exact` unreachable and therefore dead in a
four-value enum. (c) was rejected because it would let the implementation become the
specification, which is precisely what D-008 exists to prevent. The field earns its place by
answering a question a verifier and an auditor both care about: how much did the parser have to
change the text to reach this reading? `matched_literal` preserves what the prescription wrote;
`match_type` says what was done to it; neither substitutes for the other. The precedence ladder
exists because `b.d.` needs two normalizations at once and a single-valued field must still be
deterministic — period stripping is both the more transforming of the two and the one worth
surfacing, since §4's terminal-period hazard lives there.

**Cost:** a conforming matcher must track which normalization actually succeeded rather than
reporting its rule's declared set, which is real bookkeeping inside the matching loop. And the
dictionary's per-entry `Match type` rows now mean "permitted", clarified once in §4 and once in
the §7 preamble rather than by rewriting all 19 rows — so a reader who lands directly on a §7
entry can still misread that row. Renaming those rows to `Permitted normalizations` would remove
the ambiguity entirely and remains available as a later patch-level edit.

---

## D-028 — `docs/API_CONTRACTS.md` is authoritative for interface shape; `BUILD_ORDER.md` corrected

**Date:** 2026-08-26
**Status:** Accepted

**Decision:** the parser entry point is `parse(rawOcrText: string) → ParseResult`
(`API_CONTRACTS.md` §3.1). `BUILD_ORDER.md` §4 Step 1 previously specified
`parse(rawText) → MedicationCandidate[]`; that signature is superseded and has been corrected in
place. Generally: where `BUILD_ORDER.md` and `API_CONTRACTS.md`, `SCHEMA.md`, or
`SHORTHAND_DICTIONARY.md` disagree about an interface, payload, field name, or type, the latter
win. `BUILD_ORDER.md` retains authority over *sequence* only. `ParseResult` is not redesigned
here.

**Alternatives:** keep the bare array and delete the envelope from `API_CONTRACTS.md`; leave both
documents as they were and let the implementer pick.

**Why:** the envelope is load-bearing, not stylistic. Dictionary §10 requires that no OCR text is
ever silently dropped, and text belonging to no medication candidate has nowhere to go in an array
*of candidates* — a bare array forces the implementer to either discard that text or attach it to
an unrelated candidate, and both are the failure SI-06 exists to prevent
(`API_CONTRACTS.md` §4.1.1, §6.3). So the disagreement could only be resolved in the contract's
favour. Recording the precedence rule as well as the fix is what stops the same contradiction
recurring: `BUILD_ORDER.md` §4 was written on 2026-08-23, two days before the boundary was
specified, and `AGENTS.md` §4 tells an agent to read it *when choosing what to work on* — so a
stale signature there is not a harmless inconsistency, it is the number one way the wrong return
type gets implemented. `BUILD_ORDER.md`'s own authority block already limited it to sequence
against MASTERPLAN; this extends the same limit to the contract documents, which is what it
already meant in practice.

**Cost:** `BUILD_ORDER.md` is marked "stable — change rarely" (`AGENTS.md` §9) and this edits it.
The precedence rule also cuts both ways: a future contract change with sequencing consequences
still has to be reflected in `BUILD_ORDER.md` by hand, since nothing enforces the relationship
automatically.

---

## D-029 — `.` is a token boundary, except inside a declared dotted `match_form`

**Date:** 2026-08-27
**Status:** Accepted

**Decision:** `docs/SHORTHAND_DICTIONARY.md` §4's boundary set becomes `, ; : ( ) [ ] | .` —
`.` is a delimiter **except** where the period forms part of a candidate that matches a dotted
`match_forms` entry declared by the rule being evaluated, in which case the period belongs to the
token. §4 also now states that boundary checking is **edge validation on a candidate** — it
inspects only the characters immediately outside the candidate and never splits the input on the
boundary set. Amended in place at `0.1.0`; no rule's `match_forms`, writes, `Must remain null`
set, tier, or meaning changed. `/` remains deliberately excluded (`5/7`, `e/d`).

**Alternatives:** (a) implement the required behaviour and leave §4's enumeration as it was;
(b) declare `BD.` and friends as additional dotted `match_forms` on every literal rule;
(c) extend normalization 2 to strip a trailing period from any candidate; (d) bump to `0.1.1`.

**Why:** §4's delimiter list is written as the exhaustive validity condition for a match, and it
omitted `.`. Read literally, `BD` in `Give 1 tab BD.` has a right-hand neighbour that is not a
permitted delimiter, so the match must be **rejected** — the exact opposite of what three other
passages require: §4's own terminal-period hazard note ("must never treat a
sentence-terminating period as part of a token"), §11 case 21 ("`BD` matches; terminal period is
not part of the token"), and `API_CONTRACTS.md` §12.5 ("a terminal sentence period must not
prevent the `BD` match"). The contradiction is internal to the dictionary, so §1's precedence
clause — which yields only to MASTERPLAN §18.3/§26 and `SAFETY_INVARIANTS.md` — cannot arbitrate
it, and §12 does not list it as an open question. No existing mechanism closes the gap either:
`BD.` is not a declared dotted form, and normalization 2 licenses stripping only *token-internal*
periods in a candidate that already matches a declared dotted form, so `BD.` → `BD` was never
permitted. Adding `.` to the boundary set is the only change that makes all four passages
consistent while leaving every rule's meaning untouched, and it is verifiably regression-free:
every required negative in §4 and §12.5 (`ODT`, `BDS`, `statin`, `TDSx`, `Predmet`, `50 mcg`,
`8D`) is period-free.

Alternative (a) was rejected because a reader could not then distinguish an implementer following
the specification from one inventing a matching rule, which is the precise failure this dictionary
exists to prevent. (b) multiplies `match_forms` across every literal rule for a punctuation fact
that has nothing to do with any individual rule, and would make the period part of
`matched_literal` and of `source_span`, contradicting §11 case 21. (c) is a fourth normalization,
and §4's list of three is declared exhaustive — "anything not on this list is forbidden" — and it
would also silently absorb the period into the token. (d) would falsify the frozen test assertion
`dictionary_version === '0.1.0'`; the in-place amendment is justified in dictionary §14 and is
recorded there as the last one permitted.

**Cost:** the edge-validation requirement is now load-bearing and is easy to violate by writing
the obvious thing. An implementation that tokenises by splitting on the boundary set would break
`STR-MASS-001`'s decimals — `2.5 mg` would split into `2` and `5 mg` — so §4 states the constraint
explicitly and the parser's `text.ts` carries the same warning. This decision also settles only
the *terminal* period; multi-sentence input such as `BD.OD` is not addressed, because `.` is a
delimiter on both sides there and both tokens match, which is the correct outcome but has no test
and no corpus evidence behind it.

---

## D-030 — `reminders.payload` JSONB discriminated union (resolves OQ-02)

**Date:** 2026-08-29
**Status:** Accepted

**Decision:** the `reminders` table will define a single `payload jsonb NOT NULL` column holding a discriminated union of either:
1. Rendered text:
   ```json
   {
     "type": "rendered_text",
     "body": "<rendered message body>",
     "language": "mr"
   }
   ```
   Used by `ConsoleProvider` and `TwilioSandboxProvider` for development, integration testing, and sandbox/demo delivery.
2. Pre-approved template:
   ```json
   {
     "type": "template",
     "template_name": "<registered_template_name>",
     "language": "mr",
     "variables": ["<param1>", "<param2>"]
   }
   ```
   Used by `TwilioProductionProvider` for Meta-compliant business-initiated delivery.

**Alternatives:** (a) separate nullable relational columns (`body`, `template_name`, `template_variables`, `language`); (b) rigid `body TEXT NOT NULL` column deferring template support.

**Why:** `BUILD_ORDER.md` §4 Step 6 explicitly establishes a `MessageProvider` interface seam (`ConsoleProvider`, `TwilioSandboxProvider`, `TwilioProductionProvider`) specifically to keep external Meta business verification off the critical path. Twilio Sandbox and local console providers deliver session-based rendered text, while production Meta WhatsApp business-initiated delivery requires registered templates with ordered parameter arrays. A discriminated JSONB payload keeps the database schema provider-neutral, unblocks the `reminders` table migration, and guarantees that moving from Sandbox to production Meta templates requires zero database schema modifications.

**Cost:** payload validation is enforced at the TypeScript/application layer (and provider boundaries) rather than through column-level PostgreSQL constraints. BullMQ queue jobs should store only record identifiers (`reminder_id`, `medication_id`) rather than copying sensitive patient or payload text into Redis (SI-16).

---

## D-031 — DPDP Patient Erasure via PII Redaction, Delivery Halt & Audit Preservation

**Date:** 2026-08-30
**Status:** Accepted

**Decision:** The DPDP "delete my data" right-to-erasure request (`deletePatient()`, `DELETE /api/patients/:id`) is implemented as an atomic transactional PII redaction and delivery cancellation rather than a hard SQL row deletion:
1. `patients.deleted_at` is stamped with `now()`, `full_name` is redacted to `'[DELETED_PATIENT]'`, and `phone_number` and `meal_times` are set to `NULL`.
2. All `patient_caregivers` relationship links for the patient are unlinked.
3. All pending reminders across the patient's medications are atomically transitioned to `status = 'cancelled'`, `cancelled_at = now()`, immediately halting outbound message delivery (SI-10, SI-11).
4. Active medications transition to `lifecycle_state = 'stopped'`, `lifecycle_reason = 'PATIENT_ERASURE_REQUEST'`, and a consequential audit event is appended to `medication_audit_events` (SI-14).
5. `prescriptions.image_storage_key` is cleared/purged.
6. `prescriptions.raw_ocr_text` and `medications.parse_result` are preserved to keep `source_span` provenance offsets mathematically valid without retaining patient PII.

**Alternatives:** Hard cascading row deletion (`DELETE FROM patients WHERE id = ...`).

**Why:** Hard-deleting rows violates foreign key constraints (`onDelete('RESTRICT')`) designed to protect patient clinical safety records and destroys the append-only clinical audit trail mandated by **SAFETY_INVARIANTS.md SI-14**. In healthcare data governance under DPDP Act 2023, personal identifying data (names, phones, image blobs) is scrubbed and delivery is terminated immediately, while anonymized clinical lifecycle audit history is preserved.

**Cost:** Deletion queries must check `deleted_at IS NULL` when querying active patients. Provenance records retain OCR strings but contain zero links to identifiable live patient numbers or names.

---

## D-032 — Upload Rate Limiting via Sliding Window Counter & Configurable Defaults

**Date:** 2026-08-30
**Status:** Accepted

**Decision:** `POST /api/prescriptions/upload` is protected against ingestion abuse via a lightweight sliding-window in-memory rate limiter:
1. Default threshold: **10 upload requests per 60 seconds (1 minute)** per client identifier (`maxRequests = 10`, `windowMs = 60_000`), configurable via environment variables and application factory options.
2. Throttled requests return HTTP **429 Too Many Requests** with `Retry-After: <seconds>` header and standardized JSON payload `{ "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "Too many prescription upload requests. Please try again later." } }`.
3. In-memory sliding window counters evict expired timestamps on evaluation and automatically prune idle keys.
4. Blocked requests are halted at the HTTP middleware layer and never invoke OCR perception, shorthand parsing, or database queries.
5. In accordance with **SI-16**, throttling events log only `{ event: 'RATE_LIMIT_EXCEEDED', http_method: 'POST', path: '/api/prescriptions/upload', status_code: 429 }` with zero request bodies, filenames, or patient health information.

**Alternatives:** External `express-rate-limit` npm dependency; rigid Redis-only token bucket.

**Why:** Satisfies **BUILD_ORDER.md Step 8** and **MASTERPLAN §26** without pulling in unvetted third-party npm packages. Prevents computational abuse of the OCR perception engine and DB pool while ensuring zero PHI leaks into application logs.

---

## D-033 — Multi-Page Caregiver Operations Dashboard Topology & Design Token System

**Date:** 2026-08-30
**Status:** Accepted

**Decision:** The Caregiver Verification Dashboard (`apps/dashboard`) is expanded from a single-screen review tool into a modular, multi-page clinical operations platform covering 8 approved product areas:
1. **Overview Dashboard (`/`):** Summary KPI metrics, safety invariant status, and embedded pending queue preview.
2. **Prescription Queue (`/prescriptions`):** Dedicated full queue with confidence score filters.
3. **Prescription Review Workstation (`/prescriptions/[id]`):** Two-column OCR evidence and candidate review workstation enforcing the SI-01 atomic verification gate.
4. **Patients Directory (`/patients`):** Outpatient roster with adherence indicators and Marathi language badges.
5. **Patient Details (`/patients/[id]`):** Profile, IST meal-time reminder anchors, active medication regimens, live adherence summary (`GET /api/adherence/patient/:id`), and DPDP Act right-to-erasure trigger (`DELETE /api/patients/:id`).
6. **Reminders Monitor (`/reminders`):** Timeline of upcoming and delivered reminders with rendered Marathi WhatsApp message payloads.
7. **Clinical Audit Log (`/audit`):** SI-14 compliance log of all confirmations, corrections, stops, and DPDP erasures.
8. **Staff Directory (`/staff`):** Healthcare verifier profiles and activity metrics.

**Design Tokens:**
- **Canvas / Base:** `#121214`
- **Surface Elevation:** `#1E1E24` (Level 1 cards) and `#242429` (Level 2 nested containers).
---

## D-034 — Light Health-Tech Visual Direction and Stitch Design Alignment

**Date:** 2026-08-30
**Status:** Accepted

**Decision:** The Caregiver Verification Dashboard (`apps/dashboard`) is aligned to the approved **Light Health-Tech Visual Direction** across all 8 frozen product routes, matching the approved Stitch screens (`3c4ecaa20c8440e99b87d01810d200f5`, `ade351718e724c9c81a6e702db76a888`, `14d4344b8b2f4d9aab771c69c743faf9`, `58d1f59cb555402985372740d031afdd`, `0146bd5884df4e4a89d6648feaf04f3c`, `9de2d7f0d4e248eebfa0f6d07ba49f55`, `fdf9eb8cdbaf4a7bacd1c1e326e545ad`, `763c64eacc9b442d876f42c74f078f0c`):

1. **Light Health-Tech Palette & Elevation:**
   - Base canvas: `#F8FAFC` / `#FCF8FF`
   - Surfaces & Panels: `#FFFFFF` with low-opacity `#E2E8F0` borders and diffuse elevation (`shadow-xs` / `shadow-2xs`).
   - Primary Clinical Brand: `#4A40C1` (warm healthcare indigo/violet).
   - Status Tokens: Mint (`#059669` / `#10B981` confirmed/active/verified), Amber (`#D97706` / `#F59E0B` pending/alert), Rose (`#E11D48` / `#F43F5E` rejected/erased/urgent).
2. **Typography Hierarchy:**
   - UI copy and headings: `Avenir Next`, `Inter`, `Helvetica Neue`, with system sans fallback.
   - Code-point spans, IDs, and shorthand rules: `JetBrains Mono` / monospace.
3. **Prescription Review Workstation Enhancements (`/prescriptions/[id]`):**
   - 5-step clinical workflow tracker (`Upload → OCR → Parse → [Review] → Activate`).
   - Dedicated Shorthand Provenance Inspector card (SI-04).
   - Two-column OCR perception and candidate review grid.
   - Inviolable SI-01 atomic verification gate status bar.
4. **Operations & Reminders Usability:**
   - Time-of-day reminder groupings (Morning, Afternoon, Evening, Bedtime) with rendered WhatsApp Marathi message payload previews.
   - Clinical audit trail with mandatory justification logging for corrections and stops (SI-14).
   - DPDP right-to-erasure workflow with immediate delivery termination (SI-10, SI-11).

**Alternatives Considered:** Retaining dark-mode UI; introducing external UI component library.

**Why:** The Light Health-Tech direction provides high clinical clarity, spacious and trustworthy typography, and matches the approved Stitch UX prototypes while maintaining strict architectural compatibility with the Next.js App Router and backend API contracts.

**Cost:** None to backend or safety invariants; verified with zero type errors and 100% passing tests across all frontend and backend suites.

---

## D-035 — Deferral of Caregiver Association during Patient Registration (OQ-05 Boundary)

**Date:** 2026-09-05  
**Status:** Accepted  

**Decision:** The patient registration contract `POST /api/patients` registers strictly the patient record in the `patients` table. It does not accept `caregiver_id` and establishes zero automatic relationships in `patient_caregivers`.

**Alternatives Considered:**
1. Automatically assigning the creating or acting caregiver as a `verifier` in `patient_caregivers`.
2. Accepting an optional `caregiver_id` parameter in the request body or `x-caregiver-id` header to link the patient.

**Why:** `docs/SCHEMA.md` §10 and §2.3 explicitly document caregiver↔patient trust and authorization semantics as **unresolved (OQ-05)**. Under project rules, downstream implementers are forbidden from silently settling open architectural decisions or inventing unreviewed authorization models. Decoupling patient creation from caregiver linkage preserves the OQ-05 boundary cleanly until caregiver authorization workflows are formally specified.

**Cost:** Caregiver assignment cannot happen implicitly at patient creation and must be established through dedicated caregiver management workflows once OQ-05 is formally decided.





