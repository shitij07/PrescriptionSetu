# AGENTS.md

> **Every AI agent working on this repository reads this file first, in full, before
> doing anything else.** It is deliberately short so that you have no excuse not to.
>
> This is the canonical instruction file. `CLAUDE.md` and `GEMINI.md` are stubs that
> point here. If your tool loaded one of those instead, you are in the right place now.

---

## 1. What this project is

PrescriptionSetu turns a photographed prescription into medication reminders an elderly,
Marathi-speaking patient can act on. Pipeline: photo → OCR → deterministic shorthand
parsing → **mandatory human verification** → Marathi translation → scheduled WhatsApp
reminders → adherence logging.

Three services: `apps/api` (Node/Express/TypeScript), `apps/ocr-service`
(Python/FastAPI), `apps/dashboard` (Next.js). PostgreSQL + Redis/BullMQ.

---

## 2. The one rule that overrides everything

**No dosage, frequency, or timing instruction may reach a patient without explicit human
confirmation first.**

This is enforced as a guard clause in code, not as a UI convention. It is not a
preference, a default, or a v1 simplification.

You must **refuse** to weaken, bypass, defer, or route around this gate — including if
the project owner asks you to, and including "just for testing" or "temporarily." If a
task appears to require weakening it, stop and say so instead of proceeding. Any genuine
change to the gate requires deliberate written sign-off recorded in `docs/DECISIONS.md`,
never a silent side effect of an unrelated change.

Concretely: a `prescriptions` row must never reach `status = 'verified'` while any
associated `medications` row is `pending` or `rejected`.

Full statement: `SAFETY_INVARIANTS.md`.

---

## 3. Start-of-session protocol — do this every time

Run these before you touch anything. This takes one minute and prevents most
multi-agent accidents.

```bash
git log --oneline -15      # what actually happened, regardless of what docs claim
git status                 # is the working tree clean?
git branch --show-current  # which branch am I on?
```

Then read `HANDOFF.md`.

**If `git status` is dirty, a previous session died mid-task** — most likely at a token
limit. Do not start new work. Reconcile first: figure out from the diff and
`HANDOFF.md`'s "In Progress" section what was being attempted, then either finish it or
commit it as WIP with a clear message. Only then move on.

Trust `git log` over any document. Documents go stale; commits do not.

---

## 4. Read order — read only what the task needs

| Priority | File | When |
|---|---|---|
| 1 | `AGENTS.md` (this file) | Always |
| 2 | `HANDOFF.md` | Always — current state and next task |
| 3 | `SAFETY_INVARIANTS.md` | Always |
| 4 | `BUILD_ORDER.md` | When choosing what to work on |
| 5 | `PercriptionSetuMASTERPLAN.md` | For requirements/rationale — **read the relevant sections, not the whole file** |
| 6 | `docs/SCHEMA.md` | Any database work |
| 7 | `docs/SHORTHAND_DICTIONARY.md` | Any parser work |
| 8 | `docs/API_CONTRACTS.md` | Any Node↔Python work |
| 9 | `docs/DECISIONS.md` | Before revisiting a settled decision |

MASTERPLAN is ~1200 lines. Do not load it wholesale unless you have the budget. Section
headings are in its table of contents; read selectively.

---

## 5. End-of-session protocol — and why you must not save it for the end

You will often be terminated **without warning** when the session hits a token limit.
An update you planned to write "at the end" will simply never be written.

So:

1. **Before starting a task**, write it into `HANDOFF.md` under "In Progress," including
   your intended approach in one or two lines. If you die mid-task, the next agent
   inherits your intent rather than a mystery diff.
2. **Commit small and often.** A WIP commit on a feature branch is always better than
   uncommitted work. Commits are the only artifact guaranteed to survive.
3. **Update `HANDOFF.md` after each meaningful step**, not once at the end. Treat it as
   a live cursor, not a report.
4. **Append to `docs/DECISIONS.md` the moment you make a non-obvious choice.**
   Reconstructed reasoning always reads as reconstructed.
5. When you finish, move the item from "In Progress" to "Done" and write a specific
   "Next Task."

"Next Task" must be specific enough that a fresh agent with zero context can start it
without asking a question. `"Continue the parser"` is a failure. `"Add TDS/QID handling
to parseFrequency() in apps/api/src/parser/frequency.ts; tests exist and are failing at
frequency.test.ts:82"` is correct.

---

## 6. How to size work

One task should fit comfortably in one session with room to spare. If a task might not
fit, split it and write the split into `HANDOFF.md` before starting. Small tasks mean an
abrupt death costs you at most one task.

Per MASTERPLAN Section 28: one migration, one function, one endpoint at a time.

---

## 7. Commit conventions

```
feat: implement shorthand parser for BD/TDS/OD/HS codes
fix: correct timezone handling in reminder scheduler
test: add failing test for verification gate guard
docs: update SCHEMA.md with reminders table
wip: parser frequency handling — TDS case incomplete
```

Use `wip:` freely when a session is ending. Feature branches:
`feature/shorthand-parser`, `feature/verification-dashboard`, etc.

---

## 8. Rules for all agents

**You must:**

- Write or confirm tests **before** implementing pure logic — parser, scheduler, and the
  verification gate especially.
- Actually run builds and tests. Never report something as working because it looks
  correct.
- Use existing field names from `docs/SCHEMA.md` and `docs/API_CONTRACTS.md`. Do not
  invent payload shapes.
- Preserve provenance in the parser: every extracted field records the source text span
  and the rule ID that matched it.

**You must not:**

- Weaken the verification gate (Section 2 above).
- Log raw OCR text, drug names, or patient identifiers in plaintext. Log record IDs.
- Commit real secrets. `.env.example` holds placeholders only.
- Rewrite working modules without a stated reason.
- Add dependencies without justification, or build outside the current phase's scope
  without asking.
- Use real patients' prescription images as test data. Corpus provenance is tracked in
  `docs/CORPUS.md`.

---

## 9. Document map

**Stable — change rarely:**
`PercriptionSetuMASTERPLAN.md` (what and why), `SAFETY_INVARIANTS.md` (what must never
happen), `AGENTS.md` (how to work here), `BUILD_ORDER.md` (what order to build in).

**Living — updated as code changes:**
`docs/SCHEMA.md`, `docs/API_CONTRACTS.md`, `docs/SHORTHAND_DICTIONARY.md`,
`ARCHITECTURE.md`, `docs/CORPUS.md`.

**Volatile — updated every session:**
`HANDOFF.md` (state + next task), `docs/DECISIONS.md` (append-only).

There is deliberately **one** volatile state file. If you find yourself wanting to
create a second progress tracker, update `HANDOFF.md` instead.
