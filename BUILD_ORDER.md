# BUILD_ORDER.md

> **Purpose:** Execution sequence for PrescriptionSetu. MASTERPLAN defines *what* to
> build and *why*; this document defines *what order to build it in* and *what to cut*.
>
> **Optimized for:** portfolio depth for technical recruiters, at ~6–12 hrs/week.
>
> **Authority:** This document does NOT override MASTERPLAN Section 26 or
> SAFETY_INVARIANTS. Where this document and MASTERPLAN disagree on *sequence*, this
> document wins. Where they disagree on *safety*, MASTERPLAN wins. Where this document and
> `docs/API_CONTRACTS.md`, `docs/SCHEMA.md`, or `docs/SHORTHAND_DICTIONARY.md` disagree on an
> *interface, payload, field name, or type*, those documents win — this one owns order, not
> shape (D-028).
>
> **Last updated:** 2026-08-23 (Step 1 parser signature corrected 2026-08-26 — D-028)

---

## 1. The core reframe

MASTERPLAN Section 23 lists Phases 1–6 in **dependency order**. That is not the same as
optimal **execution order**, because the phase list implicitly assumes you already have
Google Cloud, Twilio, Bhashini, and a corpus of test prescriptions. You have none of
those yet. Following Phase 1 literally means your first task is blocked on your
slowest-to-acquire dependency.

Split the work into two tracks and run them in parallel:

- **Track A — calendar-bound.** Low effort, long lead time. Account approvals, API
  onboarding, sourcing test data. A few hours of work, potentially weeks of waiting.
  Every day you delay starting Track A is a day added to the end of the project.
- **Track B — effort-bound.** The actual engineering. Should never be blocked waiting
  on Track A, which is why interfaces-and-fakes appear so early below.

Start Track A this week, before writing any code.

---

## 2. Track A — start immediately

| # | Item | Effort | Lead time | Notes |
|---|------|--------|-----------|-------|
| A1 | Google Cloud project, enable Vision API, attach billing | ~1 hr | Same day | Vision Document Text Detection. Set a budget alert; OCR calls are cheap but not free. |
| A2 | Twilio account + WhatsApp Sandbox | ~1 hr | Same day | Sandbox needs no Meta business verification. A **production** WhatsApp sender does. |
| A3 | Bhashini / ULCA onboarding | ~2 hrs | **Unknown — could be weeks** | MASTERPLAN already flags this as a Phase 3 gate. Submit in week 1 so the clock starts. |
| A4 | Sample prescription corpus | ~10 hrs | Ongoing | See 2.1. This is the most underestimated item in the project. |
| A5 | Confirm WhatsApp notification rules | ~1 hr | Same day | See section 3. Do this before designing delivery. |

### 2.1 The sample corpus is on your critical path

HANDOFF.md lists "no sample prescription images sourced yet" as a known issue. It is
more than an issue — Phase 1 cannot be tested, tuned, or demonstrated without it, and
it is the one item on this list that money and patience cannot shortcut.

Target roughly 25–30 printed/typed prescriptions with realistic shorthand density.
Reasonable sources:

- **Synthetic, self-authored.** Write prescriptions in the format actually used by
  clinics near you, print them, photograph them under varied lighting, angles, and
  crumple. Fastest, fully legal, and gives you ground-truth labels for free — which you
  need anyway to measure parser accuracy.
- **Anonymised donations** from a cooperative local pharmacy or clinic, with
  identifiers removed before the image ever reaches your machine.
- **Your own family's prescriptions**, with consent, identifiers removed.

Do not scrape prescription images off the internet. They are real health data
belonging to real people, and building your compliance narrative on top of a corpus you
had no right to use will not survive a single interview question about it.

Record provenance for every sample in `docs/CORPUS.md`. Ground-truth labels for each
sample double as your parser test fixtures, so this work is not overhead — it *is*
Step 1's test data.

---

## 3. Resolve the WhatsApp delivery constraint before you design delivery

⚠️ **Verify this yourself — the details below reflect my understanding as of early 2025
and WhatsApp's policies change frequently. Confirm against current Twilio and Meta
documentation before acting on it.**

A scheduled medication reminder is a **business-initiated** message. My understanding is
that business-initiated messages sent outside a 24-hour window following the user's last
message require a **pre-approved message template**, that templates are approved
**per language**, and that templates permit only bounded variable substitution rather
than arbitrary free text.

If that is still accurate, it has a real design consequence that MASTERPLAN does not
currently account for: your reminder payload cannot be a free-text translated Marathi
string. It has to be a template name plus an ordered list of short variables. That in
turn affects the `reminders` table — you may need `template_name` and an ordered
`template_variables` column rather than a single rendered `body` field.

Three options, in order of preference for your goal:

1. **Design to bounded templates.** Get one Marathi reminder template approved with
   variables like `{{drug}}`, `{{dose}}`, `{{time}}`. Constrains the copy, but it is the
   honest production-shaped answer and worth more in an interview.
2. **Demo on the sandbox** and document the limitation explicitly in the README.
   Perfectly acceptable for a portfolio project as long as you name the constraint
   rather than pretending it doesn't exist.
3. **Rely on patient-initiated 24-hour windows.** Fragile and wrong for reminders that
   must fire at a fixed time. Avoid.

Settle this in the first two weeks. Discovering it during Step 6 means reworking schema.

---

## 4. Track B — build sequence

### Step 0 — Close the documentation gaps (~1 week)

Already done as of 2026-08-23: `AGENTS.md` (canonical agent instructions, absorbing the role
MASTERPLAN had assigned to `AI_CONTEXT.md`), `HANDOFF.md` (rewritten, absorbing
`PROJECT_STATE.md`), and `docs/DECISIONS.md`. Neither `AI_CONTEXT.md` nor `PROJECT_STATE.md`
will be created — see `docs/DECISIONS.md` D-003 and D-004.

Still to write, in this order, because each feeds the next:

1. **`docs/SHORTHAND_DICTIONARY.md`** — first, because it is the specification the Step 1
   parser is built against. BD, TDS, OD, HS, QID, ac, pc, hs, SOS, stat, and the local
   variants you actually see in your corpus.
2. **`SAFETY_INVARIANTS.md`** — short. Restate MASTERPLAN Section 26 standalone, including
   the "what this rule does and does not guarantee" distinction.
3. **`docs/SCHEMA.md`** — the seven tables from Section 21, column level, plus the lifecycle
   columns Section 18.10 requires. Resolve OQ-02 before the `reminders` table.
4. **`docs/API_CONTRACTS.md`** — the Node↔Python boundary. Defining this early is what
   lets you fake the OCR service in Step 3.
5. **`docs/CORPUS.md`** — created alongside the first samples, not after.

**On adding documents at all.** MASTERPLAN Section 34 deliberately caps the doc set and
says new documents need to justify themselves. This build order adds three:
`BUILD_ORDER.md` (execution sequence, which no existing doc covers — MASTERPLAN gives
dependency order, HANDOFF gives only the next single task), `docs/DECISIONS.md`
(reasoning, which nothing currently captures), and `docs/CORPUS.md` (sample provenance,
which you need for DPDP defensibility). It also *removes* two, by folding `AI_CONTEXT.md`
and `PROJECT_STATE.md` into `AGENTS.md` and `HANDOFF.md` — so the net doc count is roughly
flat. If any document stops being maintained, delete it rather than letting it rot; a stale
doc is worse than a missing one, and Section 34's instinct is correct.

### Step 1 — The shorthand parser, standalone and test-first (~2–3 weeks)

Build this before infrastructure. It has zero external dependencies, needs no
credentials, no database, and no Docker; it is pure, fully testable logic; and it is the
intellectual core of the project. It is also the part a reviewing engineer will actually
read.

**Resolves an open MASTERPLAN decision.** Section 19 leaves the parser as "TypeScript or
Python." Put it in **TypeScript, inside `apps/api`**, and keep the Python service
strictly pixels→text. Rationale: parser output feeds the verification gate and the
database writes, both of which live in Node, so keeping it in Node avoids a network hop
on the safety-critical path and lets the parser and gate share types through
`packages/shared-types`. The resulting boundary is clean and easy to defend —
**Python does perception, Node does interpretation and safety.** Record this in
`DECISIONS.md`.

Deliverable: a pure function

```
parse(rawOcrText: string) → ParseResult
```

exactly as specified in `docs/API_CONTRACTS.md` §3.1 — one required argument, no options
object — where every extracted field carries provenance: the source text span it came from and
the ID of the rule that matched it (five mandatory fields, dictionary §5 and
`API_CONTRACTS.md` §5). Provenance is what makes Section 26 auditability real rather than
aspirational, and it is nearly free if you build it in from the start and expensive to
retrofit.

`ParseResult` is an **envelope** — `{ candidates, unparsed_fragments? }` — not a bare
`MedicationCandidate[]`. An earlier draft of this step specified the bare array; it was written
before the boundary was specified and is superseded (D-028). The envelope exists because
dictionary §10 forbids silently dropping OCR text, and text belonging to no medication
candidate has nowhere to live in an array of candidates. Do not redesign it here —
`API_CONTRACTS.md` owns its shape.

Tests before implementation, per Section 28. Your corpus ground-truth labels are the
fixtures.

### Step 2 — Data layer and the safety gate (~1–2 weeks)

Knex migrations for the seven tables. Correction audit fields (old value, new value,
verifier identity, timestamp) go in now, not later.

Then, before anything consumes it: write the **failing test** asserting that reminder
generation is impossible while any medication on a prescription is `pending` or
`rejected` — and then implement the guard clause that makes it pass. Doing this at Step 2
rather than Step 5 means the gate is load-bearing from the first day the schema exists,
instead of being bolted on once there is already code that works around it.

That test is also a genuinely good interview artifact. "Here is the test that proves the
system cannot deliver an unverified dose" is a strong thing to be able to point at.

### Step 3 — OCR service behind an interface (~2 weeks)

Define the `OcrProvider` interface from `API_CONTRACTS.md` first, then implement three:

- **`FixtureOcrProvider`** — returns canned text for corpus samples. This is what keeps
  Steps 4–7 buildable and testable offline, with no API spend and no credentials.
- **`CloudVisionOcrProvider`** — OpenCV preprocessing (deskew, denoise, contrast) then
  Document Text Detection.
- **`LlmVisionOcrProvider`** — the low-confidence fallback. Flagged, never silent, per
  Section 22.

HANDOFF.md says start the confidence threshold at 70%. Do that, then once the corpus
exists, **actually measure it and tune**, and write the before/after and your reasoning
into `DECISIONS.md`. "I started at 0.70, measured against 28 samples, moved to 0.62
because the false-confident band sat there" is worth more than any amount of
architecture diagram.

### Step 4 — Verification dashboard (~2–3 weeks)

This is your visual centrepiece and the screenshot that goes at the top of the README.
Original image pane beside parsed fields, per-medication confirm/correct/reject,
unmatched drug names warned about prominently rather than subtly, every correction
logged.

Keep the scope deliberately narrow — it is an internal tool for a handful of trusted
users, per Section 19 — but make the one screen that matters genuinely polished. This is
the single place where visual effort pays back.

### Step 5 — Reminder scheduler, pure function first (~1–2 weeks)

Pure function: confirmed medications plus per-patient meal-time config → concrete
reminder timestamps. Test IST handling explicitly and early, exactly as Section 30
instructs; timezone bugs in a medication reminder system are the kind of bug that
quietly invalidates the whole product.

Only after the pure function is tested, wire up BullMQ with retry and backoff.

### Step 6 — Delivery and translation, both behind interfaces (~2 weeks)

`MessageProvider`: `ConsoleProvider` for dev and tests, `TwilioSandboxProvider` for the
demo, `TwilioProductionProvider` if business verification ever lands.
`TranslationProvider`: `PassthroughProvider`, `BhashiniProvider`,
`GoogleTranslateProvider` as documented fallback.

This is not speculative over-engineering, and you should say so explicitly in the
README: the provider seam is what keeps Bhashini onboarding and Meta business
verification — both entirely outside your control — off your critical path. That is a
scheduling argument, not an architecture-astronaut one.

### Step 7 — Adherence tracking (~1 week)

Keyword classifier first, tested. LLM fallback only for genuinely ambiguous replies
(Section 18.9), logged as `unclear_reply` and surfaced to the caregiver (Section 22).

### Step 8 — Hardening and the README (~2 weeks)

Retention job, deletion path, upload rate limiting, structured logging with PHI
redaction. Write a test asserting that no drug name or raw OCR text appears in log
output — Section 33 states the rule, and a test is how you show you meant it.

Then budget real, protected time for the README. For your stated goal it is the
highest-leverage file in the repository, because it is the only one most reviewers will
read. It needs an architecture diagram, a short GIF of the verification flow, and a
section explaining **why the parser is deterministic rather than an LLM call.** That
last section is the strongest signal the project contains: it demonstrates judgment
about where automation is appropriate, which is a rarer and more valuable thing to show
than the ability to call an API.

---

## 5. Recommended scope cuts

Your constraint is time, and MASTERPLAN is scoped for 6–9 months. These cuts protect the
parts that carry signal.

| Item | Verdict | Reasoning |
|---|---|---|
| Handwriting OCR (Phase 4) | **Cut** | High effort, and OCR on Indian clinical handwriting will likely perform badly enough to make the demo look worse rather than better. Write it up as future scope *with the accuracy reasoning*. Declining to ship something because it isn't good enough is itself a positive signal. |
| Multi-language beyond Marathi (Phase 5) | **Cut** | Adds no engineering signal — it is a config value once the pipeline is language-parameterised. |
| Voice notes / TTS | **Keep if A3 lands** | Genuine accessibility signal, low effort once Bhashini access exists. Cut without regret if onboarding stalls. |
| Production WhatsApp sender | **Cut** | Use the sandbox, document the limitation honestly in the README. |
| Drug-interaction checking (Phase 6+) | **Stay deferred** | Already correctly out of scope. Keep it out and state why — the restraint is the signal. |

**None of these cuts break MASTERPLAN's own MVP definition.** Section 24 explicitly states
that voice notes, handwriting OCR, and multi-language support "are valuable but not
required for MVP completion," and Section 17 already lists non-Marathi languages as out of
scope. The one cut worth watching is the production WhatsApp sender: Section 24 requires
that reminders be "delivered in Marathi (text) via WhatsApp on schedule," and the sandbox
does send real WhatsApp messages — but only to opted-in numbers, and possibly only via
approved templates (see section 3). If the template constraint turns out to block scheduled
delivery of your translated text, that is the one place where sandbox-only genuinely falls
short of MVP, which is why section 3 asks you to resolve it early.

---

## 6. Realistic timeline at ~8 hrs/week

| Step | Weeks | Cumulative |
|---|---|---|
| 0 — Documentation gaps | 1 | 1 |
| 1 — Shorthand parser | 3 | 4 |
| 2 — Data layer + safety gate | 2 | 6 |
| 3 — OCR service + providers | 2 | 8 |
| 4 — Verification dashboard | 3 | 11 |
| 5 — Reminder scheduler | 2 | 13 |
| 6 — Delivery + translation | 2 | 15 |
| 7 — Adherence | 1 | 16 |
| 8 — Hardening + README | 2 | 18 |

**~18 weeks (≈4 months)** to a complete, tested, demoable core loop. Faster than
MASTERPLAN's 6–9 months because of the Section 5 cuts.

Three honest caveats: the table takes the **upper** end of each step's range above, so
there is no slack built in beyond that; Steps 1 and 4 overrun more often than they come
in early; and Track A delays land on top of this total, not inside it.

---

## 7. Sequencing rules to hold to

- **Never build a feature that depends on a credential you don't have yet.** Build its
  interface and a fake, and move on. This single rule is what keeps Track A off your
  critical path.
- **Test-first for the parser, the scheduler, and the verification gate.** Everything
  else can be test-after. Those three are where correctness is load-bearing.
- **Update `HANDOFF.md` at the end of every session.** It is already the rule; it is also
  the thing that makes resuming after a two-week gap take five minutes instead of an
  hour.
- **One `DECISIONS.md` entry per non-obvious choice, written when you make it.**
  Reconstructed reasoning always reads as reconstructed.

---

## 8. Immediate next actions

1. **Tonight, Track A:** create the Google Cloud project, set up the Twilio WhatsApp
   sandbox, submit Bhashini onboarding. Roughly one evening for all three.
2. **This week, Track A:** start the corpus. Ten samples by end of week 1.
3. **This week, Track B:** write `docs/SHORTHAND_DICTIONARY.md`, then the parser test
   file, then the parser.

### Note on overriding HANDOFF.md

HANDOFF.md currently names the `patients` Knex migration as the next real coding task.
Recommend overriding that: do the shorthand dictionary and parser first, migration
second.

Reasoning — the parser is blocked by nothing and is the core of the project, whereas the
migration is quick work you can do at any point and gains you nothing by being first.
Starting with the parser also means your first three weeks produce the artifact most
worth showing, rather than infrastructure.

Update HANDOFF.md to match once you've decided.
