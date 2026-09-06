# SCHEMA.md

> Database schema specification for PrescriptionSetu (PostgreSQL 15+).
>
> **This is documentation, not a migration.** It states *what* the schema must be — tables,
> columns, types, nullability, defaults, keys, value domains, and the safety-relevant
> integrity properties each column carries. It deliberately does **not** contain migration
> SQL, DDL statements, Knex code, ORM models, or TypeScript types. Those are downstream
> tasks that must conform to this document.
>
> **Authority order.** Where this file appears to conflict with `SAFETY_INVARIANTS.md`,
> `docs/SHORTHAND_DICTIONARY.md`, or MASTERPLAN §21/§26, those files win and this file is
> wrong and must be corrected. This file *realises* their behavioural requirements as a
> concrete representation; it does not get to soften them.

**Version:** 0.1.0 (DRAFT)
**Date:** 2026-08-24
**Status:** Draft for review. No migrations exist yet. `reminders` is **not finalised** — see OQ-02.

---

## 0. What this schema does and does not guarantee

The schema is built around one non-negotiable rule (MASTERPLAN §21/§26, `AGENTS.md` §2,
`SAFETY_INVARIANTS.md` SI-01):

> No dosage, frequency, or timing instruction may reach a patient or caregiver without
> explicit human confirmation first.

The schema **supports** the enforcement of that rule by carrying the two independent status
axes and the provenance the guard clause reads. It does **not**, on its own, enforce it —
enforcement is an application-layer guard (SI-01), asserted by test, not left to a database
constraint or to convention.

**Guaranteed** (a testable property the schema + guard support): no *unverified*
interpretation is delivered to a patient. Every deliverable row carries an explicit human
confirmation.

**Not guaranteed** (must never be implied): that the confirmed interpretation is
*medically correct*, or that no *misreading* was confirmed. A verifier can confirm a wrong
reading; the schema records that this happened and who did it, but the presence of a
`confirmed` row is **not** a correctness guarantee. This file must not be read, cited, or
extended as if `verification_status = 'confirmed'` meant "medically correct" (MASTERPLAN
§26, "Guaranteed vs. not guaranteed").

---

## 1. Conventions

**Primary keys.** Every table uses a `uuid` primary key named `id`, default
`gen_random_uuid()` (PostgreSQL 13+ `pgcrypto`/built-in). The one exception is
`patient_caregivers`, which uses a composite natural key (see §2.3). Choice of UUID over
bigserial is recorded in Open Decisions (§10) but treated as settled for this draft.

**Timestamps.** All timestamps are `timestamptz` and stored in UTC. `created_at` /
`updated_at` where present default to `now()`. A timestamp column is only added where a
distinct event time is actually needed — tables are not given a reflexive `updated_at` if
nothing mutates the row (e.g. append-only tables have only `created_at`).

**State / enumerated columns.** Enumerated states are represented as `text` with a `CHECK`
constraint restricting the value domain — **not** as native PostgreSQL `ENUM` types and
**not** as foreign keys to lookup tables. Rationale in §10 and D-014: `text` + `CHECK`
keeps states readable in queries and logs, and altering the permitted set is a plain
constraint change rather than an `ALTER TYPE`/data-migration exercise. Value domains below
are written as `∈ { … }`.

**Defaults on parser-derived clinical fields.** Per `SHORTHAND_DICTIONARY.md` §2 ("No
defaults, ever. A field no rule wrote is `null` … `null` means 'the prescription did not
say,' which is information"), **no column that stores parser-derived clinical data carries
a database default.** A missing value is `NULL`, and `NULL` is meaningful. This applies to
every effective clinical field on `medications` (frequency, dose, strength, duration,
timing, conditional-use, single-dose, and control fields), and most pointedly to the two
SI-08 fields (§2.5). Workflow-state columns that are not parser data (e.g. `status`,
`verification_status`) *do* carry defaults, because a row's initial workflow state is a
schema fact, not an inference about the prescription.

**Foreign keys.** FK on-delete behaviour is `RESTRICT` unless a column note says otherwise.
Hard deletion is expected to be rare because the DPDP erasure path (§10) is not yet
designed; nothing in this schema should be read as authorising cascade deletion of
medication history.

**Sensitivity legend.** Columns are marked:

- **[S] Sensitive** — personal data or clinical free text (names, phone numbers, raw OCR
  text, drug names, patient replies). Never written to plaintext application logs; logs
  reference record `id`s only (SI-16, MASTERPLAN §26). This marking constrains *logging and
  handling*, not storage: the column still stores the value.
- **[R] Retention-controlled** — subject to a data-retention/erasure policy that is only
  partially defined (§10). Flagged so the erasure design does not miss it.

**Column classification legend** (used in the per-column notes):

- **[A]** Required by a named safety invariant or MASTERPLAN clause — load-bearing.
- **[B]** Required to realise documented behaviour (lifecycle, provenance, adherence).
- **[C]** Operational/metadata (timestamps, keys) — conventional, low-risk.
- **[D]** Carries an unresolved open decision — see §10.

---

## 2. Core domain tables

These seven tables hold the product's domain data. `medication_audit_events` (§3) is
**not** in this group — it is safety infrastructure.

Migration ordering (documented for the future migration task, not built here): `patients` →
`caregivers` → `patient_caregivers` → `prescriptions` → `medications` (has a self-FK) →
`medication_audit_events` → `adherence_logs` → **`reminders` last** (blocked on OQ-02; its
migration also adds the deferred `adherence_logs.reminder_id` FK). Note `patients` is first
in *dependency* order only; `BUILD_ORDER.md` §8 deliberately does not make the `patients`
migration the first *coding* task.

### 2.1 `patients`

The person the medication is for.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK. [C] |
| `full_name` | text | no | — | **[S]** Patient name. [C] |
| `phone_number` | text | yes | — | **[S]** WhatsApp/contact number; nullable because a patient may be reached only via a caregiver. [C] |
| `preferred_language` | text | no | `'mr'` | Delivery language; Marathi is the MVP target. Not a parser field, so a default is appropriate. [C] |
| `meal_times` | jsonb | yes | — | Per-patient meal anchor times, used to resolve `BEFORE_MEAL`/`AFTER_MEAL`/`BEDTIME` timing anchors into clock times at scheduling. **Exact shape is unresolved — OQ-06.** [D] |
| `deleted_at` | timestamptz | yes | — | **[R]** DPDP "delete my data" marker. Whether erasure is soft (this column) or hard is unresolved — §10. [D] |
| `created_at` | timestamptz | no | `now()` | [C] |
| `updated_at` | timestamptz | no | `now()` | [C] |

### 2.2 `caregivers`

A person who uploads prescriptions, verifies them, and/or receives adherence updates.
`caregivers.id` is the **actor identity** referenced by every audit event (SI-14) and by
every verification/lifecycle action.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK; the SI-14 actor identity. [A] |
| `full_name` | text | no | — | **[S]** [C] |
| `phone_number` | text | yes | — | **[S]** [C] |
| `deleted_at` | timestamptz | yes | — | **[R]** DPDP erasure marker; soft-vs-hard unresolved (§10). [D] |
| `created_at` | timestamptz | no | `now()` | [C] |
| `updated_at` | timestamptz | no | `now()` | [C] |

No `preferred_language` — language is a property of the patient who receives messages, not
of the caregiver.

### 2.3 `patient_caregivers`

Associates caregivers to patients with a role. Composite key; no surrogate `id`.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `patient_id` | uuid | no | — | FK → `patients.id`. Part of PK. [B] |
| `caregiver_id` | uuid | no | — | FK → `caregivers.id`. Part of PK. [B] |
| `role` | text | no | — | Part of PK. `∈ { 'uploader','verifier','adherence_recipient' }`. [D] |
| `created_at` | timestamptz | no | `now()` | [C] |

**Primary key:** composite `(patient_id, caregiver_id, role)` — one caregiver may hold more
than one role for a patient, so role is part of the key.

**Deliberately absent:** no surrogate `id`, no `relationship` descriptor, and no
`link_verification_status`. Whether holding the `verifier` role is *sufficient
authorization* to verify a prescription or to stop a medication — i.e. the trust model
behind this link — is **unresolved (OQ-05)** and bears on SI-10 (stop authorization vs.
clinical verification). This table records *that* a role exists; it does not by itself
decide what that role is permitted to do.

### 2.4 `prescriptions`

One uploaded prescription image and its OCR output. Carries the **prescription-level
verification gate** (SI-01). Per MASTERPLAN §21, a prescription reaches `status = 'verified'`
only when every associated `medications` row is `confirmed` or `corrected` — enforced by an
application guard (SI-01), not by a constraint on this table.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK. [C] |
| `patient_id` | uuid | no | — | FK → `patients.id`. [B] |
| `uploaded_by` | uuid | yes | — | FK → `caregivers.id`. The uploading caregiver. [B] |
| `image_storage_key` | text | yes | — | **[S][R]** Opaque key to the stored image. Image is accessed only via short-expiry signed URLs; the URL mechanism and encryption-at-rest belong to `ARCHITECTURE.md` — **OQ-07**, not designed here. [D] |
| `raw_ocr_text` | text | yes | — | **[S][R]** Full raw OCR text. **`medications.parse_result` `source_span` offsets resolve against this exact string** (§8). Required for the §26 auditability guarantee that every parse decision traces to its raw fragment. Retention dependency is unresolved — §8, §10. [A][D] |
| `ocr_confidence` | numeric | yes | — | Overall OCR confidence (0–1). Fallback threshold starts at 0.70, tuned once a corpus exists. [C] |
| `ocr_metadata` | jsonb | yes | — | Flexible perception metadata (engine, per-block confidences, bounding boxes). MASTERPLAN §19 "JSON columns for flexible OCR metadata." [C] |
| `status` | text | no | `'pending_verification'` | **Prescription-level gate.** `∈ { 'pending_verification','verified' }`. §21 keys the non-negotiable rule on `status = 'verified'`. [A] |
| `verified_at` | timestamptz | yes | — | Set when the gate is passed. [B] |
| `verified_by` | uuid | yes | — | FK → `caregivers.id`. The verifying human. [A] |
| `created_at` | timestamptz | no | `now()` | [C] |
| `updated_at` | timestamptz | no | `now()` | [C] |

**Deliberately absent:** there is **no `superseded_by_prescription_id`** column. MASTERPLAN
§21 names a `superseded_by` self-reference on `medications` only; supersession is a
medication-level clinical event (§2.5, §9). Adding a prescription-level supersession pointer
would invent a second, competing supersession axis that §21 does not describe (D-018).

### 2.5 `medications`

One medication line item parsed from a prescription. This is the safety-critical table. It
carries **two orthogonal status axes** that must never be conflated (D-013):

1. **`verification_status`** — the *gate* axis: has a human confirmed the interpretation?
2. **`lifecycle_state`** — the *clinical* axis: where is this medication in its treatment
   lifecycle (not yet live / active / completed / stopped / superseded)?

A medication is **deliverable to a patient** — eligible to have reminders generated or any
patient-facing message sent — **only when both axes are satisfied** (SI-02, SI-03, SI-15):

> **Deliverable predicate:** `verification_status ∈ ('confirmed','corrected')
> AND lifecycle_state = 'active'`.

Both conjuncts are required. This single predicate is the shared read path for every
patient-facing channel; it must not be re-derived ad hoc per feature (SI-15). Reminder
*generation* additionally requires `schedule_derivable = true` (§9) — an `active` PRN/SOS
medication is deliverable in principle but produces no scheduled reminders.

#### Identity and drug fields

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK. [C] |
| `prescription_id` | uuid | no | — | FK → `prescriptions.id`. [B] |
| `drug_name` | text | yes | — | **[S]** Drug name as read. Nullable — OCR may fail to yield one. [B] |
| `drug_name_validation` | text | yes | — | `∈ { 'matched','unmatched' }`. Whether the name matched a known-drug reference. Advisory only; never gates delivery on its own. [B] |

#### Effective clinical fields (parser-derived — **no defaults**)

Every column in this group stores the parser's *effective* interpretation and carries **no
database default** (see §1). `NULL` means "the prescription did not say / no rule wrote
this," which is information the verifier needs. None of these is derived from another
(notably: `dose_amount` is never derived from `dose_strength_value` — SI-07, D-010).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `frequency_code` | text | yes | — | `∈ { 'ONCE_DAILY','TWICE_DAILY','THRICE_DAILY','FOUR_TIMES_DAILY' }`. [B] |
| `times_per_day` | integer | yes | — | `CHECK` between 1 and 4 when present. [B] |
| `timing_anchors` | text[] | yes | — | Array; each element `∈ { 'BEDTIME','BEFORE_MEAL','AFTER_MEAL' }`. Resolved to clock times using `patients.meal_times` (OQ-06) at scheduling. [B][D] |
| `dose_amount` | *(see note)* | yes | — | Quantity per administration, e.g. `1`, `2`, `½`. **Must preserve the exact fraction, never a floating-point decimal** (dictionary §7.6 AMT-FRAC-001). **Never derived from strength** (SI-07, D-010). Exact storage representation is an open item — see §10 and note below. [A][D] |
| `dose_unit` | text | yes | — | `∈ { 'tablet','ml' }`. [B] |
| `dose_strength_value` | numeric | yes | — | e.g. `500`. May be recorded but **must not** be used to synthesise `dose_amount` (SI-07). [A] |
| `dose_strength_unit` | text | yes | — | `∈ { 'mg','mcg','g' }`. [B] |
| `duration_value` | integer | yes | — | Number of `duration_unit`s. [B] |
| `duration_unit` | text | yes | — | `∈ { 'day','week' }`. [B] |
| `duration_indefinite` | boolean | yes | — | `true` = ongoing/no stop date stated. `NULL` = not stated. [B] |
| `as_needed` | boolean | yes | — | `true` for SOS/PRN conditional-use. Pairs with `schedule_derivable = false` (D-011). `NULL` unless a conditional-use rule matched. [A] |
| `total_doses` | integer | yes | — | For single-course / STAT counts where applicable. [B] |
| `recurring` | boolean | yes | — | Whether the medication repeats on a schedule. [B] |
| `immediate` | boolean | yes | — | STAT / administer-now semantics. STAT administration ownership is unresolved (OQ-10). [B][D] |
| `schedule_derivable` | boolean | yes | — | `false` when no schedule can be computed (e.g. PRN/SOS, D-011). A reminder may be generated **only** when this is `true`. [A] |
| `verifier_action_required` | boolean | yes | — | Sticky flag: `true` if any rule flagged the line for a verifier decision. [B] |

**Note on `dose_amount` representation [D].** The dictionary preserves dose amounts as
*exact fractions* (`½`, `¼`, `1`, `2`), explicitly to keep doses out of floating-point
arithmetic (dictionary §7.6). Storing this as a decimal `numeric` would render `½` as `0.5`
and reintroduce exactly the decimal representation the dictionary avoids. The recommended
representation is therefore a fraction-preserving one (e.g. `text` holding the exact token
`'1/2'`, or a numerator/denominator pair), **not** a float. The exact encoding is left as an
open decision (§10); whichever is chosen, the byte-exact original is independently preserved
in `parse_result` as `matched_literal` (§8), and verifier display uses the fraction form.

#### SI-08 fields — parser-unwritable, human-confirmable, no DB default

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `max_doses_per_day` | integer | yes | **none** | See SI-08 rules below. [A][D] |
| `min_interval_hours` | numeric | yes | **none** | See SI-08 rules below. [A][D] |

These two fields have a special ownership rule that the schema must document precisely
(SI-08; dictionary §2, §7.4, §11 invariant 5; D-011, D-020). **Presence of a column here is
not permission for the parser to write it.**

- **The parser MUST NOT populate or derive these fields.** No dictionary rule is capable of
  writing them; they appear in no category's permitted-writes list. This guarantee is
  enforced in the parser and the shared types (they are structurally unwritable there) —
  **not** by any database constraint. (SI-08, D-011.)
- **They may legitimately remain `NULL`.** For a conditional-use (SOS/PRN) medication they
  are expected to be `NULL`, and the parser records them in
  `parse_result.missing_fields` with reason `requires_verifier_entry` (dictionary §9).
- **A human verifier MAY explicitly enter and confirm a value** when the prescription itself
  states a ceiling or minimum interval (e.g. "max 3/day", "min 4 h apart"). Such a value is
  *human-verified data*, not parser output. This is the crucial distinction:
  **PARSER OUTPUT cannot contain these values; HUMAN-VERIFIED DATA may.**
- **The database invents no default and applies no origin-gating constraint.** There is no
  `DEFAULT`. There is **no** constraint that attempts to enforce "only a human wrote this"
  — such a constraint cannot distinguish origin and would risk **preventing a legitimate
  human-confirmed value**, which is forbidden. The only permissible constraint is ordinary
  *value validity* (e.g. must be positive **when present**, `NULL` always allowed).
- The origin guarantee lives in the parser/shared-types layer; the database is
  provenance-neutral for these fields by design.

#### Provenance

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `parse_result` | jsonb | yes | — | **Immutable** full parser output for this line. Holds `candidate_readings`, `missing_fields`, `unparsed_fragments`, and per-field five-field provenance. The system of record for *how* every effective field was derived (SI-04; dictionary §5). See §8. [A] |

`parse_result` is written once when the line is parsed and is **never mutated** — a revision
produces a *new* `medications` row with its own `parse_result` (§9), it does not overwrite
this one. There is **no separate `dictionary_version` column**; the dictionary version lives
only inside the provenance objects within `parse_result`. Whether `dictionary_version`
should additionally be persisted as a relied-upon top-level field is **unresolved (OQ-13)**
and is deliberately left open here (§8, §10).

#### Verification axis (the gate)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `verification_status` | text | no | `'pending'` | `∈ { 'pending','confirmed','corrected','rejected' }`. The SI-01 gate axis. A new line starts `pending`. [A] |
| `verified_by` | uuid | yes | — | FK → `caregivers.id`. The human who confirmed/corrected/rejected. [A] |
| `verified_at` | timestamptz | yes | — | When the verification action occurred. [B] |

`confirmed` = human confirmed the parser's reading as-is. `corrected` = human changed the
values and confirmed the corrected reading. Both are deliverable-eligible (they are the two
values in the deliverable predicate). `rejected` = human rejected the line; it is never
deliverable and never activates.

#### Lifecycle axis (clinical state)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `lifecycle_state` | text | yes | **none (`NULL`)** | `∈ { 'active','completed','stopped','superseded' }` **when non-NULL**. `NULL` = has not yet entered the clinical lifecycle (not live). See §9 for full semantics. [A] |
| `superseded_by` | uuid | yes | — | FK → `medications.id` (self-reference). Points to the row that replaced this one. MASTERPLAN §21 names this column verbatim. [A] |
| `lifecycle_reason` | text | yes | — | Human-supplied reason for the most recent lifecycle transition (§18.10 requires a reason per transition). [B] |
| `lifecycle_changed_at` | timestamptz | yes | — | Timestamp of the most recent lifecycle transition (§18.10 requires a timestamp per transition). [B] |
| `created_at` | timestamptz | no | `now()` | Row creation (parse time). [C] |

**Deliberately absent:** no top-level `dictionary_version` (OQ-13; lives in `parse_result`
only), and no `updated_at` — effective clinical values are **never edited in place**
(revisions create new rows, §9), so a general row-mutation timestamp would misrepresent the
model. Lifecycle changes are timestamped by `lifecycle_changed_at`; verification by
`verified_at`.

### 2.6 `reminders` — **NOT FINALISED (blocked on OQ-02)**

A scheduled patient-facing message derived from a **deliverable** medication (deliverable
predicate, §2.5; SI-03). A reminder must never exist for a non-deliverable medication.

**This table cannot be finalised in this document.** Whether WhatsApp business-initiated
messages require pre-approved, per-language message *templates* (with bounded, ordered
variables) versus a single freely-rendered message body directly determines the shape of
the message-payload columns. That is **OQ-02**, and it is unresolved. This document does
**not** choose between a `body`-style payload and a `template_name` + ordered
`template_variables` payload, and it does not invent any Meta/WhatsApp platform rule. Per
MASTERPLAN §21, OQ-02 must be resolved **before** the `reminders` migration is written.

The non-payload columns are documented to the approved extent:

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK. [C] |
| `medication_id` | uuid | no | — | FK → `medications.id`. Only deliverable medications (SI-03). [A] |
| `scheduled_time` | timestamptz | no | — | When the reminder is due (UTC). [B] |
| `status` | text | no | `'pending'` | `∈ { 'pending','sent','failed','cancelled' }`. `cancelled` is how SI-11 halts a pending send. [A] |
| `sent_at` | timestamptz | yes | — | When actually sent. [B] |
| `attempt_count` | integer | no | `0` | Delivery attempts. Workflow counter, so a default is appropriate. [C] |
| `last_error_code` | text | yes | — | **Error code only — never message content or payload** (SI-16). [A] |
| `cancelled_at` | timestamptz | yes | — | When cancelled (SI-11). [B] |
| `created_at` | timestamptz | no | `now()` | [C] |
| **message payload** | **— BLOCKED —** | | | **OQ-02: `body` vs `template_name` + `template_variables` not chosen. Do not implement until resolved.** [D] |

**Atomic cancellation (SI-11).** When a medication is stopped or superseded, its pending
reminders must be moved to `cancelled` **in the same transaction** as the lifecycle change,
with no observable window in which the medication is stopped/superseded yet a `pending`
reminder for it can still fire. This is a required behavioural property; the transactional
*mechanism* is an implementation concern, not specified here.

### 2.7 `adherence_logs`

A record of a patient/caregiver response to a reminder, classified for adherence tracking
(MASTERPLAN §18.9 four-way classification).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK. [C] |
| `medication_id` | uuid | yes | — | FK → `medications.id`. [B] |
| `reminder_id` | uuid | yes | — | FK → `reminders.id`. **FK added when the `reminders` table lands** (OQ-02); nullable because a response may arrive unsolicited. [B][D] |
| `responder_caregiver_id` | uuid | yes | — | FK → `caregivers.id`. Who responded, if identifiable. [B] |
| `classification` | text | no | — | `∈ { 'taken','missed','unclear','needs_attention' }` (§18.9). [B] |
| `raw_reply_text` | text | yes | — | **[S]** The raw inbound reply. [B] |
| `excluded_from_stats` | boolean | no | `false` | `needs_attention` responses are excluded from adherence statistics. Workflow flag, so a default is appropriate. [B] |
| `escalated_at` | timestamptz | yes | — | When a `needs_attention` case was escalated. The escalation path itself is a dead end today — **OQ-08**. [B][D] |
| `received_at` | timestamptz | no | `now()` | When the reply was received; this *is* the row's event timestamp (no separate `created_at`). [C] |

---

## 3. Safety infrastructure

Not a domain table. Exists solely to satisfy an auditability invariant.

### 3.1 `medication_audit_events` (SI-14)

An append-only audit trail of every consequential event on a medication: parsing,
verification actions, and lifecycle transitions. Required because SI-14 demands an
append-only record of *old value, new value, actor identity, and timestamp* for corrections
and transitions, and the `medications` row alone (which holds only current state) cannot
carry that history (D-016).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK. [C] |
| `medication_id` | uuid | no | — | FK → `medications.id`. [A] |
| `event_type` | text | no | — | `∈ { 'parsed','confirmed','corrected','rejected','stopped','superseded','completed','revised' }`. [A] |
| `field_name` | text | yes | — | Which field changed, for field-level corrections; `NULL` for whole-row events. [B] |
| `old_value` | jsonb | yes | — | Prior value (SI-14). `NULL` for creation events. **[S]** may contain clinical values. [A] |
| `new_value` | jsonb | yes | — | New value (SI-14). **[S]** may contain clinical values. [A] |
| `actor_caregiver_id` | uuid | yes | — | FK → `caregivers.id`. The actor identity (SI-14). Nullable only for system-generated `parsed` events with no human actor. [A] |
| `reason` | text | yes | — | Human-supplied reason (required for lifecycle transitions per §18.10). [B] |
| `created_at` | timestamptz | no | `now()` | Event time. [C] |

**Required property: AUDIT EVENTS ARE APPEND-ONLY.** Rows are inserted and thereafter
never updated or deleted. This is a required *property* of the table. **The mechanism that
enforces it is deliberately left unspecified here** — this document does not decide whether
append-only is enforced by triggers, by `REVOKE` of `UPDATE`/`DELETE`, by database roles, or
by application-layer discipline. That choice belongs to the migration/implementation task.
There is no `updated_at` (an append-only row is never updated).

---

## 4. Relationships summary

- `patients` 1—N `prescriptions` (a patient has many prescriptions).
- `caregivers` N—M `patients` via `patient_caregivers` (role-bearing link; authz = OQ-05).
- `caregivers` 1—N `prescriptions` via `uploaded_by` and `verified_by`.
- `prescriptions` 1—N `medications`.
- `medications` 1—N `reminders` (only for deliverable medications; OQ-02 for payload).
- `medications` 1—N `adherence_logs`; `reminders` 1—N `adherence_logs` (FK deferred).
- `medications` 1—N `medication_audit_events`.
- `medications` self-reference via `superseded_by` (a superseding row points back to the
  superseded one).
- `caregivers` 1—N `medication_audit_events` via `actor_caregiver_id`.

---

## 5. Safety-invariant → schema realisation

| Invariant | How the schema realises it |
|---|---|
| **SI-01** gate | `prescriptions.status` and `medications.verification_status`; the gate is an application guard, not a DB constraint. |
| **SI-02 / SI-03 / SI-15** verified-only delivery | Single shared **deliverable predicate** `verification_status ∈ ('confirmed','corrected') AND lifecycle_state = 'active'`; `reminders`/`adherence` reference only medications satisfying it. |
| **SI-04** provenance | `medications.parse_result` JSONB holds the five provenance fields per field (§8). |
| **SI-07** dose ≠ strength | `dose_amount` and `dose_strength_value` are independent columns; note forbids deriving one from the other (D-010). |
| **SI-08** unwritable ceilings | `max_doses_per_day` / `min_interval_hours`: no default, no origin-gating constraint, parser-unwritable (enforced in code/types), human-confirmable (§2.5). |
| **SI-10** stop separated from verification | `lifecycle_state` is independent of `verification_status`; stopping needs no re-verification. Stop *authorization* = OQ-05. |
| **SI-11** atomic cancel | `reminders.status = 'cancelled'` + `cancelled_at`; cancellation shares the transaction with the lifecycle change (property, not mechanism). |
| **SI-12** transitions explicit; revisions re-verify | Lifecycle columns + `medication_audit_events`; a revision is a **new** `medications` row (§9), never an in-place edit. |
| **SI-14** append-only audit | `medication_audit_events` with old/new/actor/timestamp; append-only property, mechanism deferred (§3.1). |
| **SI-16** no sensitive data in logs | Sensitivity **[S]** markings; `reminders.last_error_code` is a code, never payload. Constrains logging, not storage. |

---

## 6. Sensitive & retention-controlled columns (index)

**[S] Sensitive** (never in plaintext logs; SI-16): `patients.full_name`,
`patients.phone_number`, `caregivers.full_name`, `caregivers.phone_number`,
`prescriptions.image_storage_key`, `prescriptions.raw_ocr_text`, `medications.drug_name`,
`adherence_logs.raw_reply_text`, `medication_audit_events.old_value`/`new_value`.

**[R] Retention-controlled** (erasure policy incomplete; §10): `prescriptions.image_storage_key`,
`prescriptions.raw_ocr_text`, `patients.deleted_at`, `caregivers.deleted_at`.

---

## 7. What this schema deliberately does not do

- It does not enforce the verification gate with a database constraint — the gate is an
  application guard (SI-01), asserted by test.
- It does not use a database constraint to enforce who may write the SI-08 fields (§2.5).
- It does not implement, encrypt, or design storage for images — encryption at rest and the
  signed-URL mechanism are `ARCHITECTURE.md` concerns (OQ-07).
- It does not finalise the `reminders` message payload (OQ-02).
- It does not specify the append-only enforcement mechanism for the audit table (§3.1).
- It does not claim DPDP compliance, and it does not resolve soft- vs hard-deletion (§10).
- It contains no migration SQL, DDL, Knex, ORM, or type definitions.

---

## 8. Provenance representation (detail)

Every effective field on a `medications` row must trace to how it was derived (SI-04;
dictionary §5; MASTERPLAN §26 auditability). Provenance is stored inside
`medications.parse_result` (JSONB), not as scalar columns, because it is per-field and
structurally rich.

**`parse_result` contains, at minimum:** the parser's `candidate_readings`, its
`missing_fields` (with reason codes such as `requires_verifier_entry`), its
`unparsed_fragments`, and, for each effective field it wrote, the **five mandatory
provenance fields** (dictionary §5):

1. `rule_id` — the dictionary rule that fired.
2. `dictionary_version` — the dictionary version in force at parse time. **Stored only here,
   inside the provenance object — there is no separate top-level column** (OQ-13, below).
3. `matched_literal` — the byte-for-byte source substring. **Never overwritten with the
   canonical/expanded form** (dictionary §5).
4. `source_span` — `{ start, end }` character offsets **into `prescriptions.raw_ocr_text`**.
5. `match_type` — the kind of match.

`parse_result` is **immutable** once written; corrections and revisions create new rows and
new audit events rather than mutating it (§9).

**OQ-13 stays open.** Placing `dictionary_version` inside provenance satisfies the parser's
in-memory requirement without committing to it as a separately-indexed, relied-upon storage
field. Whether it also needs first-class persistence (e.g. for querying "all rows parsed
under dictionary vX") is **unresolved** and is not decided here (D-015).

**`source_span` → `raw_ocr_text` retention dependency (unresolved).** `source_span` offsets
are only meaningful against the exact `prescriptions.raw_ocr_text` they were computed from.
MASTERPLAN §26 defines a retention policy that deletes **raw images** after a defined period
post-verification, but is **silent on raw OCR text**. If `raw_ocr_text` were later deleted or
altered under an erasure/retention policy, every `source_span` offset into it would dangle
and the §26 guarantee that "every parsing decision traces back to the exact raw OCR fragment"
would break. `matched_literal` survives such deletion (it is copied into provenance), but the
offsets do not. **This retention dependency is unresolved and must be settled when the
retention/erasure policy is designed** (§10). No encryption or deletion mechanism is designed
here.

---

## 9. Lifecycle semantics (detail)

`lifecycle_state` is the clinical axis, orthogonal to `verification_status`. Its permitted
non-NULL values are `active`, `completed`, `stopped`, `superseded` (MASTERPLAN §18.10, §21;
SI-12).

**`NULL` means "not yet entered the clinical lifecycle" — the medication is not live.** This
was chosen over inventing an explicit `pending_activation` state (D-019): the documented
state set (§18.10, SI-12) does not include such a state, and a synthetic one would duplicate
information already carried by `verification_status` and create a drift hazard between the
two axes. `NULL` correctly models "not applicable yet."

**A `NULL`-lifecycle medication is never deliverable and never reminder-generating**, because
the deliverable predicate (§2.5) requires `lifecycle_state = 'active'`. This is the primary
safety property of the lifecycle axis: **`lifecycle_state IS NULL` ⇒ not deliverable ⇒ no
reminders**, unconditionally.

**The only transition out of `NULL` is activation: `NULL → active`.** Activation occurs only
when the prescription passes the SI-01 gate — i.e. when `prescriptions.status` becomes
`'verified'`, which itself requires every medication on that prescription to be `confirmed`
or `corrected` (MASTERPLAN §21). A `rejected` medication never activates; it remains `NULL`
(terminal for that row).

**A valid interim state exists:** `verification_status = 'confirmed'` **and**
`lifecycle_state = NULL`. This is a medication a human has approved, on a prescription that
is not yet fully verified (another line is still pending). It is correctly **not** deliverable
until the whole prescription clears the gate and the medication activates. This interim state
is the reason the two axes are separate.

**Transitions among non-NULL states** (each requires a `lifecycle_reason` and
`lifecycle_changed_at`, and emits a `medication_audit_events` row — §18.10, SI-12):

- `active → completed` — course finished as intended.
- `active → stopped` — stopped early (interrupted). Stopping is always permitted and needs
  no clinical re-verification (SI-10; §18.10 corollary). Its pending reminders are cancelled
  atomically (SI-11).
- `active → superseded` — replaced by a revised medication; `superseded_by` points to the
  replacing row. Supersession is a single atomic operation with no window in which both the
  old and new rows are simultaneously live (§18.10). Pending reminders on the superseded row
  are cancelled atomically (SI-11).

**Revisions create a NEW row (SI-12; §18.10 "revisions are re-verified, never edited
through").** A dose/frequency/timing revision is **not** an in-place edit of an existing
`medications` row. It is a *new* `medications` row that re-enters the verification gate
(`verification_status = 'pending'`, `lifecycle_state = NULL`), while the prior row moves to
`superseded` with `superseded_by` pointing at the new row. Approved effective values are
therefore **never silently edited in place**; the history is preserved across rows and in the
audit trail. (`completed` vs `stopped` are kept distinct precisely so an interrupted course is
never mislabelled as a finished one — §18.10.)

A data-layer "no medication may be `active` unless its prescription is `verified`" check could
be added as defense-in-depth; if adopted it is a redundant backstop to the application guard,
and its mechanism is deferred.

---

## 10. Open decisions & blockers

Unresolved items this schema surfaces but does not settle. None may be silently closed by a
downstream implementer.

- **OQ-02 — `reminders` message payload (BLOCKING).** `body` vs `template_name` +
  `template_variables`, driven by unverified WhatsApp business-initiated-message rules. The
  `reminders` table is **not finalised** and its migration must not be written until this is
  resolved (MASTERPLAN §21, §37). Not chosen here.
- **OQ-13 — persist `dictionary_version`?** Currently only inside `parse_result` provenance;
  no top-level column. Whether it needs first-class persistence is open (§8). Not resolved.
- **OQ-05 — caregiver↔patient trust/authorization.** `patient_caregivers.role` records a
  role but not what it authorizes (e.g. whether `verifier` may pass the gate or stop a
  medication). Bears on SI-10. Open.
- **OQ-06 — `patients.meal_times` shape.** The JSONB shape for meal anchors used to resolve
  `BEFORE_MEAL`/`AFTER_MEAL`/`BEDTIME`. Open.
- **OQ-07 — image storage & encryption at rest.** `image_storage_key` access mechanism
  (signed URLs) and encryption at rest belong to `ARCHITECTURE.md`. Not designed here.
- **OQ-08 — `needs_attention` escalation.** `adherence_logs.escalated_at` exists but the
  escalation path is a dead end today. Open.
- **OQ-10 — STAT administration ownership.** `medications.immediate` captures STAT semantics,
  but who administers/acknowledges a STAT dose is unresolved. Open.
- **Raw-OCR retention dependency (unresolved).** `source_span` offsets depend on
  `prescriptions.raw_ocr_text` surviving; §26 defines deletion for raw *images* only and is
  silent on raw OCR text. Must be settled with the retention/erasure design (§8).
- **DPDP erasure: soft vs hard.** `deleted_at` markers exist on `patients`/`caregivers`, but
  whether "delete my data" is soft-delete or hard-delete — and how it interacts with the
  append-only audit trail and medication history — is undesigned. This schema does **not**
  claim DPDP compliance.
- **`dose_amount` exact representation (§2.5).** Must preserve exact fractions, never a float;
  exact encoding (`text` token vs numerator/denominator) not finalised.

**Settled for this draft (recorded in DECISIONS.md):** UUID PKs via `gen_random_uuid()`;
`timestamptz`/UTC; `verification_status` and `lifecycle_state` as two orthogonal axes (D-013);
enumerated states as `text` + `CHECK` (not native ENUM, not lookup tables — D-014); provenance
in immutable `parse_result` JSONB, no `dictionary_version` column, OQ-13 open (D-015);
`medication_audit_events` as required append-only safety infrastructure (D-016); reminder
payload deferred (D-017); no prescription-level supersession column (D-018); `lifecycle_state`
`NULL` rather than a `pending_activation` state (D-019); SI-08 fields parser-unwritable /
human-confirmable / no DB default (D-020).
