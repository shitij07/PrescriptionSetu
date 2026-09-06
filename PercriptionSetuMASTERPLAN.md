# MASTER_PLAN.md

> **Version:** 1.1.0
> **Project Name:** PrescriptionSetu
> **Project Type:** AI-Assisted Prescription Translation & Medication Reminder Platform
> **Status:** Planning
> **Owner:** Kshitij Thopate
> **Repository:** PrescriptionSetu (GitHub)
> **Duration:** 6–9 Months (self-directed, phased)
> **Primary Languages:** TypeScript (Node.js), Python (FastAPI)
> **Backend Frameworks:** Express (Node.js), FastAPI (Python)
> **Frontend Framework:** Next.js + TypeScript
> **Database:** PostgreSQL
> **License:** MIT (Tentative)

---

# Table of Contents

1. Document Information
2. Reading Guide
3. Executive Summary
4. Vision
5. Mission
6. Problem Statement
7. Existing Solutions
8. Gap Analysis
9. Proposed Solution
10. Product Goals
11. Success Metrics
12. Stakeholders
13. Target Users
14. User Personas
15. User Journey
16. User Stories
17. Product Scope
18. Core Modules
19. Technology Stack
20. High-Level Architecture
21. Database Schema
22. AI & Automation Workflow
23. Development Roadmap
24. MVP Scope
25. Future Scope
26. Safety & Compliance Framework
27. Engineering Principles
28. AI Development Workflow
29. Code Quality Standards
30. Testing Strategy
31. Git Workflow
32. Performance Guidelines
33. Security Guidelines
34. Documentation Policy
35. Definition of Done
36. Guiding Principles
37. Open Questions
38. Closing Statement

---

# 1. Document Information

## Purpose

This document is the single source of truth for the PrescriptionSetu project.

It defines the product vision, problem space, requirements, architecture, database design, phased roadmap, safety framework, and engineering principles.

Every design decision, implementation task, and future enhancement should align with this document.

---

## Intended Audience

This document is written for:

- Project Developer
- AI Coding Agents
- Academic Supervisors / Evaluators
- Future Contributors
- Recruiters reviewing the project

---

## Relationship with Other Documentation

This repository maintains a small, deliberate documentation set.

**Stable — define intent and constraints, change rarely:**

| Document | Purpose |
|----------|----------|
| MASTER_PLAN.md | Product vision, requirements, architecture rationale, roadmap, safety framework |
| SAFETY_INVARIANTS.md | Standalone restatement of the non-negotiable safety rules (Section 26) |
| AGENTS.md | Canonical instructions for every AI coding agent. `CLAUDE.md`, `GEMINI.md`, and `.cursorrules` are pointer stubs to it |
| BUILD_ORDER.md | Execution sequence — supersedes Section 23 on *order* only, never on scope or safety |

**Living — track the code, updated as it changes:**

| Document | Purpose |
|----------|----------|
| ARCHITECTURE.md | Technical implementation details and component interaction |
| docs/SCHEMA.md | Column-level database schema, kept in sync with migrations |
| docs/SHORTHAND_DICTIONARY.md | Medical shorthand → plain-language mapping used by the parser |
| docs/API_CONTRACTS.md | The Node↔Python service boundary |
| docs/CORPUS.md | Provenance of every prescription sample used for testing |

**Volatile — updated every working session:**

| Document | Purpose |
|----------|----------|
| HANDOFF.md | Current state, work in progress, and the specific next task |
| docs/DECISIONS.md | Append-only log of non-obvious decisions and what they cost |

MASTER_PLAN.md is the highest-level planning document.

---

## Revision History

**v1.1.0 — 2026-08-23.** Review pass. Substantive changes:

- **Section 18.5** — added Design Principle 2: verification must be *comprehensible*. The
  previous revision made an untrained caregiver the safety gate without asking whether they
  could evaluate what they were confirming. Added an explicit acknowledged-limitation note.
- **Section 18.10 (new)** — medication lifecycle. Nothing previously handled dose changes,
  stop orders, or superseding prescriptions, so reminders could keep firing for a
  discontinued drug. Stop/supersede promoted into MVP scope (Section 24).
- **Section 18.9** — added a `needs_attention` escalation outcome. A three-way
  taken/missed/unclear classification silently discarded the most safety-relevant replies a
  patient can send.
- **Section 26** — added "what this rule does and does not guarantee," distinguishing *no
  unverified reading reaches a patient* (true, testable) from *no misreading reaches a
  patient* (not guaranteed). Narrowed the DPDP claim to "designed with DPDP principles in
  mind," and named the obligations not implemented.
- **Section 11** — separated invariants from measured hypotheses, and added a measurement
  plan. The accuracy targets were previously unmeasurable and had no defined corpus.
- **Section 19** — resolved the open parser-language decision to TypeScript in `apps/api`.
- **Section 37 (new)** — Open Questions. `HANDOFF.md` already referenced this section before
  it existed.
- **Sections 1, 2, 28, 34, 35** — document set updated: `AI_CONTEXT.md` folded into
  `AGENTS.md`, `PROJECT_STATE.md` folded into `HANDOFF.md`.
- **Sections 29, 31, 32** — condensed to project-specific content; generic advice removed.

**v1.0.0** — initial plan. It owns **intent and
constraints** — why PostgreSQL, why the verification gate exists. It deliberately does
*not* duplicate the living documents' specifics; where this document sketches a schema or
a folder layout, the living document is authoritative and this one is illustrative.

There is exactly **one** volatile state file. An earlier revision of this plan specified
both `PROJECT_STATE.md` and `HANDOFF.md`; they overlapped, and two progress trackers
reliably diverge. `HANDOFF.md` absorbed the role. See `docs/DECISIONS.md` D-004.

Similarly, the previously planned `AI_CONTEXT.md` is folded into `AGENTS.md`, which is
auto-loaded by several agent tools and therefore does the same job with less drift risk.
See D-003.

---

# 2. Reading Guide

All AI coding agents read repository documents in the following order:

1. **AGENTS.md** — always, in full. It is short by design.
2. **HANDOFF.md** — always. Current state and the specific next task.
3. **SAFETY_INVARIANTS.md** — always.
4. **BUILD_ORDER.md** — when choosing what to work on.
5. **MASTER_PLAN.md** — for requirements and rationale. Read the *relevant sections*, not
   the whole file; it is long, and the table of contents above exists so you can navigate
   it selectively.
6. **ARCHITECTURE.md** (if available).
7. **docs/SCHEMA.md**, **docs/SHORTHAND_DICTIONARY.md**, **docs/API_CONTRACTS.md** — when
   working on data, parsing, or cross-service tasks.
8. **docs/DECISIONS.md** — before revisiting anything that looks already settled.

During development:

- AGENTS defines **how to work here**, including the session protocol.
- MASTER_PLAN defines **what** to build and **why**.
- SAFETY_INVARIANTS defines **what must never happen**.
- BUILD_ORDER defines **what order** to build in.
- HANDOFF defines **where we are right now**.
- ARCHITECTURE defines **how components interact**.
- DECISIONS defines **why we chose what we chose**.

Before any of the above, run the resume check in `AGENTS.md` section 3. Git history is
the authoritative record of what happened; every document here can go stale, and after a
session that ended abruptly at a token limit, some of them will have.

If a conflict exists:

SAFETY_INVARIANTS.md overrides everything, including a direct request from the project
owner, where the human-verification gate in Section 26 is concerned. Otherwise
MASTER_PLAN.md takes precedence — except on *build sequence*, where BUILD_ORDER.md wins,
since MASTER_PLAN Section 23 states dependency order rather than execution order.

---

# 3. Executive Summary

Elderly and rural patients across India routinely misdose or miss medication, not because they are careless, but because the prescription itself is unreadable to them. Prescriptions mix English medical terminology with dense shorthand (BD, TDS, OD, HS, ac, pc, SOS) that even literate, English-fluent adults frequently misread — and the patients most affected are often elderly, have limited English fluency, and may have vision or literacy constraints as well.

Existing digital health tools largely target hospitals, insurers, or tech-comfortable urban patients. Very few tools address the specific, narrow, high-stakes translation problem: turning a photographed prescription into something an elderly Marathi-speaking patient can actually understand and act on safely, delivered through a channel they already use.

PrescriptionSetu addresses this gap directly.

It is not a general health app, a doctor-facing e-prescription system, or a drug-interaction engine. It is a focused pipeline: photograph a prescription, extract and parse it, have a human confirm the reading, translate it into plain-language Marathi, and deliver scheduled WhatsApp reminders (text and voice) that a patient or their caregiver can act on with confidence.

The platform's core engineering discipline is that **no unverified reading of a dosage, frequency, or timing instruction is ever delivered to a patient.** Every architectural decision in this document exists in service of that one rule.

---

# 4. Vision

To make every prescription understandable to the person who has to follow it, regardless of language, literacy, or age — by combining OCR, deterministic medical-shorthand parsing, human verification, and accessible delivery into a single trustworthy pipeline.

---

# 5. Mission

PrescriptionSetu aims to reduce medication errors caused by prescription illegibility and language/literacy barriers by providing:

- Accurate extraction of prescription text from printed and handwritten sources
- Deterministic, auditable translation of medical shorthand into plain language
- A mandatory human verification step before any instruction reaches a patient
- Delivery through a channel patients already use and trust (WhatsApp), in their own language, with voice support
- Adherence tracking that gives caregivers visibility without adding burden

Rather than replacing the doctor-patient relationship or attempting automated clinical decision-making, PrescriptionSetu focuses narrowly and rigorously on the *translation and delivery* problem — a problem that is currently solved, if at all, by an overworked family member reading a doctor's handwriting aloud and hoping they got it right.

---

# 6. Problem Statement

Prescriptions in India are frequently:

- handwritten, in doctor-specific shorthand and inconsistent legibility
- written in English, regardless of the patient's actual fluency
- dense with abbreviations (BD, TDS, OD, HS, ac, pc, SOS) that have precise, non-obvious meanings
- unaccompanied by any plain-language restatement for the patient to take home

Elderly and rural patients are disproportionately affected because they are more likely to:

- have limited English fluency, even if literate in their own language
- have reduced eyesight, making handwriting harder to parse
- live far from a pharmacist who could clarify the reading
- rely on a caregiver who is also not medically trained

The consequence is a well-documented, real harm pathway: missed doses, doubled doses, wrong timing relative to meals, and medications stopped early or continued too long.

Current digital health tools do not solve this specific problem. Pharmacy apps assume a legible input and a literate, app-comfortable user. Hospital e-prescription systems solve it only within a single hospital's ecosystem and only at the point of prescribing, not at the point of home use, days later, when the actual dosing decision is made.

This creates a clear, narrow, solvable gap: a *translation and delivery* layer that sits between "prescription as written" and "patient's actual daily medication routine."

---

# 7. Existing Solutions

Related tools and approaches include:

- Hospital/pharmacy e-prescription systems (e.g., integrated EMR modules)
- General medication reminder apps (e.g., Medisafe, generic pill-reminder apps)
- OCR-based document scanner apps (e.g., generic mobile scanning apps)
- Government digital health initiatives (e.g., ABDM-linked systems)
- General-purpose translation apps (e.g., Google Translate camera mode)

These tools address isolated fragments of the problem:

- E-prescription systems solve *creation* and *storage*, not patient-side comprehension.
- Reminder apps solve *scheduling*, but assume the user already correctly understood the dosage and entered it themselves.
- OCR scanner apps solve *digitization*, not medical-shorthand interpretation or safety verification.
- General translation apps solve *language*, not domain-specific shorthand, and provide no verification or delivery workflow.

None combine OCR + medical-shorthand parsing + mandatory human verification + plain-language regional translation + accessible delivery into a single safety-conscious pipeline aimed specifically at elderly/rural patients.

---

# 8. Gap Analysis

The following gaps exist in current solutions:

- No tool specifically targets medical-shorthand comprehension for the *patient*, as opposed to clinical staff
- No verified translation pipeline exists between "photographed prescription" and "trusted, actionable, plain-language instruction"
- Reminder apps assume correct manual data entry rather than deriving the schedule from the prescription itself
- No mainstream tool defaults to WhatsApp + voice note delivery, despite this being the most realistic channel for the target demographic
- Data-governance and medication-safety concerns are rarely treated as first-class design constraints in consumer health-adjacent tools built quickly for portfolio purposes

PrescriptionSetu is designed to bridge these gaps by treating verification, accessibility, and auditability as core architecture, not afterthoughts.

---

# 9. Proposed Solution

PrescriptionSetu is an AI-assisted prescription translation and reminder platform.

The platform:

- Accepts a photographed prescription (via WhatsApp or web upload)
- Extracts text via OCR, with a handwriting-capable engine and a low-confidence fallback path
- Parses medical shorthand deterministically into structured dosage/frequency/timing data
- Cross-checks drug names against a known drug list to catch OCR misreads
- Requires a human (caregiver, volunteer, or eventually a pharmacist) to confirm or correct every parsed medication before anything is finalized
- Translates the confirmed instructions into the patient's preferred language (Marathi first) via Bhashini
- Delivers scheduled WhatsApp reminders as text and voice notes
- Logs adherence based on simple patient/caregiver replies

Developers and human verifiers remain in control of every safety-relevant decision. The platform assists and accelerates; it does not autonomously deliver unverified medical instructions.

---

# 10. Product Goals

## Primary Goals

### PG-01 — Eliminate Misreadings of Dosage Instructions

Ensure every dosage, frequency, and timing instruction reaching a patient has passed a mandatory human verification step.

---

### PG-02 — Make Prescriptions Understandable Regardless of Language or Literacy

Translate confirmed instructions into plain-language Marathi (and eventually other Indian languages), with voice-note support for low-literacy users.

---

### PG-03 — Meet Patients Where They Already Are

Deliver everything through WhatsApp — no new app to install, no new account to learn.

---

### PG-04 — Support Caregivers Without Adding Burden

Give caregivers a fast, simple verification and adherence-monitoring experience rather than a second full-time job.

---

### PG-05 — Build a Safety-First, Auditable Pipeline

Every parsing decision, correction, and delivery must be traceable — this is a medication-safety system, and auditability is a core requirement, not a nice-to-have.

---

### PG-06 — Demonstrate Practical, Responsible AI Engineering

Serve as a portfolio-quality demonstration of applying AI/OCR/LLM tooling to a genuinely safety-constrained, real-world problem — showing engineering judgment about *where* to trust automation and where not to.

---

# 11. Success Metrics

## Product Metrics

Two different kinds of number appear below and they must not be confused.

**Invariants** are properties the system either has or is broken. They are not targets and
are not negotiable:

| Invariant | Value |
|---|---|
| Medications reaching `confirmed`/`corrected` before any reminder is generated | **100%** — enforced by guard clause, asserted by test |
| Unmatched drug names silently accepted | **0** — always flagged to the verifier |
| Raw OCR text / drug names in plaintext logs | **0** — asserted by test |

**Measured hypotheses** are the accuracy numbers. The figures below are *initial
hypotheses, not validated results*, and they are worth nothing until measured against a
defined corpus:

| Metric | Initial hypothesis |
|---------|---------|
| Field-level parsing accuracy (printed prescriptions) | >90% |
| Drug-name validation match rate | >85% |
| Adherence-reply classification accuracy | >90% |
| Reminder delivery success rate | >95% on schedule, including retries |

### Measurement plan

A target with no measurement plan gets quietly dropped, after which the project has no
evidence it works. So, concretely:

- **Corpus.** Accuracy is measured against the labelled sample set tracked in
  `docs/CORPUS.md` — target ~25–30 printed prescriptions. Ground-truth labels are authored
  alongside each sample.
- **Unit of measurement.** "Field-level accuracy" means: for each medication, the four
  fields *drug name, dose, frequency, timing* are scored independently, exact-match after
  normalisation. A medication with three of four correct scores 0.75, not 0.
- **Reporting.** Report the number actually obtained, with an error breakdown by category
  (OCR misread vs. unknown shorthand token vs. parser rule gap vs. layout failure). The
  breakdown is more informative than the headline figure.
- **Honesty rule.** If the measured result falls short of the hypothesis, the recorded
  outcome is the measured result and an analysis of why — not a revised hypothesis.
  "72% on 28 samples, with 60% of errors traced to unhandled compound frequency tokens"
  is a more valuable finding than an unmeasured claim of 90%.

---

## Technical Metrics

- Clear separation of concerns across the three services (API, OCR service, dashboard)
- No safety-gate bypass possible without an explicit, logged override
- Maintainable, modular codebase with low coupling between services
- Comprehensive error handling, especially around third-party API failures (Cloud Vision, Bhashini, Twilio)
- Consistent, auditable data model for every parsing and verification decision

---

## Research / Learning Metrics

The project will be considered successful if it demonstrates:

- Practical, responsible integration of OCR + LLM fallback for a safety-sensitive task
- A working human-in-the-loop verification pattern that could generalize to other high-stakes AI-assisted domains
- Real-world applicability validated against actual (or realistic) prescription samples
- Sound judgment about where automation is appropriate and where it is deliberately constrained

---

# 12. Stakeholders

## Primary Stakeholders

### Project Developer

Responsible for designing, implementing, testing, documenting, and maintaining the platform.

---

### Patients

The end beneficiaries — elderly/rural individuals who receive plain-language, translated medication instructions.

---

### Caregivers / Verifiers

Family members or volunteers who upload prescriptions, confirm/correct parsed data, and monitor adherence.

---

## Secondary Stakeholders

- Academic evaluators (if used as an MCA project)
- Future pharmacist collaborators (for Phase 6+ drug-interaction work)
- Technical recruiters reviewing the project
- Local community health volunteers who could pilot the tool

---

# 13. Target Users

## Primary Users

### Patients

Elderly, rural, limited English fluency, possibly limited literacy or eyesight.

Needs:

- Understand what medication to take, how much, and when
- Receive reminders in a familiar, low-friction channel
- Not be required to learn a new app or interface

---

### Caregivers

Family members or community volunteers supporting a patient.

Needs:

- Quickly verify/correct a machine-parsed prescription
- Trust that what gets sent to the patient is accurate
- See adherence at a glance without manual tracking

---

## Secondary Users

- Community health volunteers piloting the tool in a village/ward setting
- Future pharmacist reviewers (post-MVP)

---

# 14. User Personas

## Persona 1 — Elderly Patient

### Background

68-year-old resident of a coastal Maharashtra village, fluent in Marathi, limited English, uses a basic smartphone primarily for WhatsApp with family.

### Pain Points

- Cannot read the English/shorthand-heavy prescription handed to them at the clinic
- Relies on a family member's interpretation, which is sometimes wrong or forgotten
- Struggles to remember exact timing relative to meals for multiple medications

### Goals

- Understand clearly what to take, how much, and when
- Receive a simple reminder without needing to operate a new app

---

## Persona 2 — Caregiver Daughter/Son

### Background

Adult child living with or near an elderly parent, works full-time, manages the parent's medication logistics remotely or in the evenings.

### Pain Points

- Cannot always be present when a dose is due
- Worried about misreading the doctor's handwriting themselves
- Wants reassurance the parent is actually taking medication correctly

### Goals

- Confirm the prescription reading is correct, quickly, from a phone
- Get visibility into whether doses are being taken
- Trust the system enough to not have to double-check everything manually

---

## Persona 3 — Community Health Volunteer

### Background

Local volunteer supporting several elderly residents in a coastal village who lack close family nearby.

### Goals

- Verify and manage prescriptions for multiple patients efficiently
- Extend the reach of limited local healthcare support

---

# 15. User Journey

## Step 1

Caregiver photographs the prescription and sends it via WhatsApp (or uploads via web form as a v1 fallback).

↓

## Step 2

The platform receives the image, stores it securely, and begins OCR processing.

↓

## Step 3

OCR + preprocessing extracts raw text; low-confidence cases are flagged for extra scrutiny.

↓

## Step 4

The shorthand parser converts raw text into structured medication candidates (drug, dosage, frequency, timing).

↓

## Step 5

Drug names are cross-checked against a known drug list.

↓

## Step 6

Caregiver reviews the parsed data on the verification dashboard against the original image, confirming or correcting each field.

↓

## Step 7

Once every medication is confirmed/corrected, the reminder schedule is generated automatically.

↓

## Step 8

Instructions are translated into the patient's preferred language and converted to a voice note.

↓

## Step 9

WhatsApp reminders (text + voice) are delivered at the scheduled times.

↓

## Step 10

Patient or caregiver replies confirming the dose was taken; adherence is logged and summarized for the caregiver.

---

# 16. User Stories

## Prescription Upload

### US-001

As a caregiver, I want to send a photo of a prescription via WhatsApp, so that I don't need to install a new app.

---

### US-002

As a caregiver, I want to upload a prescription via a simple web form as a fallback, so that I have a working option even before WhatsApp media handling is ready.

---

## Verification

### US-003

As a caregiver, I want to see the parsed medication details next to the original image, so that I can quickly confirm or correct them.

---

### US-004

As a caregiver, I want to be clearly warned when a drug name couldn't be matched against a known drug list, so that I pay extra attention to that field.

---

### US-005

As a caregiver, I want my corrections to be recorded, so that there is a clear audit trail of what was changed and why.

---

## Delivery & Reminders

### US-006

As a patient, I want to receive medication reminders in Marathi, so that I can understand exactly what to take and when.

---

### US-007

As a patient with limited literacy, I want a voice note version of the reminder, so that I don't have to rely on reading text.

---

### US-008

As a caregiver, I want reminders to respect meal-timing notes (before/after food), so that the schedule is practically useful, not just technically correct.

---

## Adherence

### US-009

As a patient or caregiver, I want to reply to a reminder confirming the dose was taken, so that adherence is tracked automatically.

---

### US-010

As a caregiver, I want a simple weekly adherence summary, so that I can monitor my parent's medication routine without manual tracking.

---

# 17. Product Scope

## In Scope (MVP through Phase 5)

- WhatsApp-based and web-form prescription upload
- OCR for printed prescriptions (Phase 1), extended to handwriting (Phase 4)
- Deterministic medical-shorthand parsing
- Drug-name validation against a known drug list
- Mandatory human verification dashboard, presenting shorthand as plain-language meaning (Section 18.5)
- Medication lifecycle: stopping and superseding medications so schedules stay truthful (Section 18.10)
- Marathi translation and voice-note generation via Bhashini
- Scheduled WhatsApp reminder delivery with retries
- Basic adherence logging, with escalation of possible-harm replies to a caregiver (Section 18.9)
- Data retention and deletion handling, designed with DPDP Act 2023 principles in mind (see Section 26 for the limits of this claim)

---

## Out of Scope (Current Version)

- Drug-interaction checking (requires licensed pharmacist involvement — explicitly deferred to Phase 6+)
- Direct hospital/clinic e-prescription system integration
- Automated clinical decision-making of any kind
- Multi-organization/enterprise pharmacist-as-a-service model
- Non-WhatsApp native mobile app (not needed for the target demographic)
- Support for languages beyond Marathi in the MVP (planned for Phase 5, not before)

These features may be considered in future versions, several with explicit domain-expert involvement required before development begins.

---

# 18. Core Modules

PrescriptionSetu follows a modular, three-service architecture where each service has a clearly bounded responsibility.

## Module Overview

| Module | Purpose | MVP |
|---------|---------|-----|
| Prescription Intake | Receive images via WhatsApp/web, store securely | ✅ |
| OCR & Preprocessing | Deskew/denoise images, extract raw text | ✅ |
| Shorthand Parsing | Convert raw text into structured medication data | ✅ |
| Drug Validation | Cross-check parsed drug names against a known list | ✅ |
| Verification Dashboard | Human confirmation/correction gate | ✅ |
| Reminder Scheduling | Generate and queue scheduled reminders | ✅ |
| Translation & TTS | Convert confirmed instructions to Marathi text + voice | ✅ |
| WhatsApp Delivery | Send reminders, receive replies | ✅ |
| Adherence Tracking | Classify and log replies; escalate possible-harm replies | ✅ |
| Medication Lifecycle | Stop/supersede/revise medications; keep schedules truthful | ✅ |
| Multi-language Support | Extend beyond Marathi | ❌ Future (Phase 5) |
| Drug-Interaction Checking | Flag dangerous combinations | ❌ Future (Phase 6+, pharmacist-reviewed only) |

---

## 18.1 Prescription Intake Module

### Purpose

Receive a prescription photo and create a trackable record of it.

### Responsibilities

- Accept image via Twilio WhatsApp webhook or web upload endpoint
- Validate file type/size
- Store image in encrypted object storage (not a public bucket)
- Create a `prescriptions` row with initial status

### Inputs

- Image file
- Patient/caregiver identifiers

### Outputs

- `prescriptions` record with `status = pending_ocr`
- Secure storage reference

---

## 18.2 OCR & Preprocessing Module

### Purpose

Convert a prescription image into raw extracted text as reliably as possible.

### Responsibilities

- Deskew, denoise, and enhance contrast (OpenCV)
- Call Google Cloud Vision Document Text Detection
- Compute a confidence score
- Route low-confidence results to an LLM vision fallback for a second reading

### Inputs

- Stored prescription image

### Outputs

- Raw OCR text
- Confidence score
- Flag indicating whether the fallback path was used

---

## 18.3 Shorthand Parsing Module

### Purpose

Deterministically convert raw OCR text into structured medication data.

### Responsibilities

- Match known shorthand tokens (BD, TDS, OD, HS, ac, pc, SOS, etc.) via a maintained dictionary
- Extract drug name, dosage, frequency, timing, duration as separate structured fields
- Preserve the exact raw text fragment each parse decision came from, for auditability

### Design Principle

This module SHALL be rule-based and deterministic wherever possible.

This module SHALL NOT rely on an LLM as the primary parsing mechanism for safety-relevant fields — LLM assistance is permitted only as a documented, clearly-flagged fallback for genuinely ambiguous fragments, never as the silent default.

---

## 18.4 Drug Validation Module

### Purpose

Reduce the risk of OCR misreads being accepted as valid drug names.

### Responsibilities

- Cross-check each parsed drug name against a known Indian drug list (e.g., CDSCO-derived dataset)
- Flag unmatched names clearly for the verifier, rather than silently accepting them

---

## 18.5 Verification Dashboard Module

### Purpose

Provide the mandatory human confirmation gate.

### Responsibilities

- Display original image alongside parsed structured fields
- **Display the plain-language meaning of every shorthand token beside the parsed value,
  together with the dictionary rule that produced it** (see Design Principle 2 below)
- Allow confirm/correct/reject actions per medication
- Surface OCR confidence, and both readings when the LLM vision fallback was used
- Flag unmatched drug names prominently, not subtly
- Log every correction with old/new values, verifier identity, and timestamp
- Block reminder generation until every medication on a prescription is confirmed or corrected

### Design Principle 1 — The gate is enforced in code

No prescription may reach `verified` status while any medication remains in `pending` or `rejected` verification status. This is enforced in code, not only by UI convention.

### Design Principle 2 — Verification must be comprehensible, not just present

**The gate is only as good as the verifier's ability to evaluate what they are confirming,
and this document must not treat human confirmation as equivalent to ground truth.**

Section 13 defines verifiers as family members or community volunteers with no medical
training, and Persona 2 in Section 14 explicitly names their fear of misreading the
doctor's handwriting. A design that asks that person to confirm a transcription they
cannot independently read has produced a rubber stamp, not a safety gate — and would leave
this project claiming "no unverified reading reaches a patient" while the stronger claim it
implies, "no misreading reaches a patient," remains false.

Therefore the dashboard SHALL present each parsed field as an *interpretation to be
judged*, not a string to be approved:

- Shorthand is shown expanded into plain language — `BD` is displayed as
  "BD → twice daily", not as `BD`. The verifier confirms a meaning they can reason about
  rather than a token they may not know.
- The matched dictionary rule is shown alongside the expansion, so a wrong rule is
  visible rather than invisible.
- Fields derived from low-confidence OCR are visually distinct and ordered first, so
  scarce attention lands where error is most likely.
- The reconstructed schedule is restated in full natural language before final
  confirmation ("1 tablet, twice a day, after food, for 5 days"), because an error in a
  reassembled whole is often obvious when the individual fields did not look wrong.

### Acknowledged limitation

This reduces verifier error; it does not eliminate it. An untrained verifier confirming a
plausible-but-wrong reading remains the system's weakest link, and no amount of interface
design fully closes that. Pharmacist review (Section 25, Phase 6+) is the real answer and
is deliberately out of current scope. This limitation SHALL be stated plainly in the
README rather than left implicit — overstating the strength of the gate is itself a safety
problem, because it invites the reliance the gate cannot support.

---

## 18.6 Reminder Scheduling Module

### Purpose

Convert confirmed medication data into concrete, timed reminder instances.

### Responsibilities

- Compute reminder timestamps from frequency, duration, and timing notes
- Respect per-patient configurable meal-time defaults
- Queue reminders via Redis/BullMQ with retry/backoff

---

## 18.7 Translation & TTS Module

### Purpose

Make confirmed instructions understandable in the patient's own language and format.

### Responsibilities

- Translate plain-language reminder text via Bhashini (Google Translate as fallback)
- Generate a TTS voice note via Bhashini for low-literacy patients

---

## 18.8 WhatsApp Delivery Module

### Purpose

Deliver reminders and receive patient/caregiver responses.

### Responsibilities

- Send scheduled text + voice-note messages via Twilio WhatsApp Business API
- Receive and route inbound replies to the Adherence Tracking module
- Handle delivery failures with retries and eventual caregiver alerting

---

## 18.9 Adherence Tracking Module

### Purpose

Turn patient/caregiver replies into a usable adherence record.

### Responsibilities

- Classify replies (keyword-based first, LLM fallback only for genuinely ambiguous replies) as taken/missed/unclear
- Log to `adherence_logs`
- Generate periodic caregiver-facing adherence summaries
- **Detect and escalate replies that indicate possible harm**, rather than forcing every
  reply into taken/missed/unclear

### Escalation path

A three-way classification silently discards the most safety-relevant replies a patient can
send. "I took 4 tablets," "I have been feeling dizzy since starting this," or "I stopped
taking it" are not adherence data points — they are signals that something has gone wrong,
and classifying them as `taken`, `missed`, or `unclear` loses them.

Therefore the classifier SHALL support a fourth outcome, `needs_attention`, triggered by:

- Any reported dose quantity exceeding the confirmed dose
- Reported cessation of a medication
- Free-text replies matching a maintained list of symptom/adverse-reaction keywords

A `needs_attention` reply SHALL notify the linked caregiver promptly rather than waiting
for the periodic summary, and SHALL be excluded from adherence-rate statistics so it cannot
be averaged away.

**Boundary:** this is escalation to a human, not triage. The system SHALL NOT assess
severity, offer clinical advice, or suggest a course of action — doing so would be exactly
the automated clinical decision-making that Section 17 places out of scope. Its only job is
to make sure a human sees the message.

---

## 18.10 Medication Lifecycle Module

### Purpose

Keep the reminder schedule truthful when the prescription changes.

### Rationale

An earlier revision of this plan derived reminders from confirmed medications and then had
no mechanism to ever change them. That is a live harm pathway rather than a missing
convenience: prescriptions are revised constantly — a dose is adjusted, a drug is stopped
because of a reaction, a course is extended, a new prescription supersedes an old one — and
a system that keeps instructing a patient to take a discontinued medication is actively
dangerous. Deriving the schedule once at verification time and treating it as permanent
means the system's confidence in its instructions grows stale at exactly the same rate as
its accuracy.

### Responsibilities

- Allow a caregiver to **stop** an active medication, immediately cancelling its pending
  reminders
- Allow a caregiver to **supersede** a prescription with a newer one, stopping the old
  schedule as a single atomic operation so no window exists in which both are live
- Support **dose or frequency revision**, which re-enters verification rather than editing
  a confirmed record in place
- Record a reason and timestamp for every lifecycle transition
- Distinguish a *completed* course (duration elapsed as prescribed) from an *interrupted*
  one (stopped early), since the two mean different things to a caregiver

### Design Principle — revisions are re-verified, never edited through

A revised dose is new safety-relevant data and SHALL pass through the full verification gate
in Section 26. It SHALL NOT be editable directly on a `confirmed` record, because that would
create a path by which a value reaches a patient without confirmation — the precise failure
this project exists to prevent. The pending revision and the currently active schedule are
held separately, and the switch happens only on confirmation.

**Corollary:** stopping a medication is always permitted without verification. The gate
exists to prevent unverified instructions reaching a patient, and stopping removes
instructions rather than adding them. Making a caregiver wait for verification to halt a
reminder would be a safety failure dressed as rigour.

### MVP status

Stop and supersede are **in MVP scope** — without them the system cannot be safely used
even once. Dose revision may follow in Phase 3 alongside scheduling work.

---

# 19. Technology Stack

| Layer | Technology | Justification |
|---|---|---|
| Backend orchestration | Node.js 20 LTS, Express, TypeScript | Existing team expertise, direct reuse of prior project patterns |
| Database access | Knex.js (query builder) | Explicit SQL control matters for auditability of medical data queries |
| Database | PostgreSQL 15+ | ACID guarantees for medication data; JSON columns for flexible OCR metadata |
| Cache / job queue | Redis 7+ with BullMQ | Reliable retry semantics for reminder delivery |
| OCR microservice | Python 3.11, FastAPI | Best-fit ecosystem for OCR/CV tooling, isolated from the main API |
| Image preprocessing | OpenCV (Python) | Deskew/denoise/contrast correction before OCR |
| Primary OCR engine | Google Cloud Vision API — Document Text Detection | Best available handwriting OCR accuracy at this budget tier |
| Fallback OCR reader | Vision-capable LLM (used only for low-confidence cases) | Second opinion on hard cases; never the primary decision-maker |
| Shorthand parser | Deterministic rule-based module in **TypeScript**, inside `apps/api`, unit-tested | Auditability — every decision traceable to an explicit rule. Kept in Node because its output feeds the verification gate and the database writes, avoiding a network hop on the safety-critical path. See `docs/DECISIONS.md` D-001 |
| Drug validation | CDSCO-derived or equivalent maintained Indian drug list | Reduces risk of accepting OCR-misread drug names |
| Translation | Bhashini API (primary), Google Cloud Translation API (fallback) | Purpose-built for Indian languages, government-backed |
| Voice notes | Bhashini TTS | Accessibility for low-literacy patients |
| Messaging | Twilio WhatsApp Business API | Matches the target demographic's existing channel |
| Verification dashboard | Next.js 14, TypeScript, Tailwind CSS | Direct reuse of existing frontend skillset |
| Auth (dashboard only) | Simple session-based auth | Internal tool for a small number of caregivers/volunteers; no need for complex OAuth in v1 |
| Containerization | Docker + Docker Compose | Matches existing deployment pattern |
| Deployment target | Single cloud VM running Docker Compose (MVP) | Avoid premature infra complexity |
| Testing | Jest (Node/TS), pytest (Python) | Standard, familiar tooling |
| Logging | Structured JSON logs (pino / structlog) | Enough for MVP debugging without overbuilding observability |

---

# 20. High-Level Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐     ┌────────────────────┐     ┌─────────────────┐
│  WhatsApp   │────▶│  Node.js API │────▶│ Python OCR Service │────▶│ Verification Web    │────▶│ WhatsApp Delivery │
│  (Twilio)   │◀────│  (Express/TS)│◀────│ (FastAPI)          │◀────│ Dashboard (Next.js) │     │ + Reminder Engine │
└─────────────┘     └──────┬───────┘     └────────────────────┘     └────────────────────┘     └────────┬─────────┘
                            │                                                                            │
                            ▼                                                                            ▼
                    ┌───────────────┐                                                            ┌───────────────┐
                    │  PostgreSQL   │                                                            │ Redis + BullMQ │
                    │  (all state)  │                                                            │ (scheduling)   │
                    └───────────────┘                                                            └───────────────┘

Service boundary:
  Python OCR Service  →  image perception only: preprocessing, OCR, per-field confidence.
                         Returns raw text + confidence scores. Performs no interpretation.
  Node.js API         →  owns the deterministic shorthand parser (TypeScript, in `apps/api`),
                         the verification gate, and all safety logic. Raw OCR text is
                         interpreted into dosage/frequency/timing here, never in Python.
```

**Design rationale:** OCR is isolated in its own Python service because that ecosystem is materially better suited to CV/OCR work — but that service does *perception only*: pixels in, raw text plus confidence scores out. Shorthand interpretation is deliberately not part of it. The deterministic shorthand parser is TypeScript and lives inside `apps/api`, alongside the verification gate and the database writes it feeds; keeping interpretation and safety logic in a single process avoids a network hop on the safety-critical path and lets the parser share types with the gate through `packages/shared-types`. The resulting boundary is: **Python does perception; Node/TypeScript does interpretation, verification, and safety.** Recorded as `docs/DECISIONS.md` D-001. The verification dashboard is deliberately minimal, since it is an internal tool for a small number of trusted users, not a consumer-facing product.

Repository structure, exact folder layout, and module boundaries are maintained in `ARCHITECTURE.md` as the codebase develops.

---

# 21. Database Schema

Full column-level schema is maintained in `SCHEMA.md` and as Knex migrations. Core tables:

| Table | Purpose |
|---|---|
| `patients` | The person taking medication |
| `caregivers` | Uploaders/verifiers/adherence recipients |
| `patient_caregivers` | Many-to-many linking table |
| `prescriptions` | One row per uploaded prescription image/session, with lifecycle status |
| `medications` | One row per drug parsed from a prescription, with verification status and audit fields |
| `reminders` | Scheduled reminder instances derived from confirmed medications |
| `adherence_logs` | Patient/caregiver replies confirming doses taken or missed |

The column-level schema in `docs/SCHEMA.md` is authoritative; the list above is a map, not
a specification.

**Non-negotiable schema rule:** a `prescriptions` row may only reach `status = 'verified'` when every associated `medications` row has `verification_status IN ('confirmed', 'corrected')`. This must be enforced at the application logic layer with an explicit guard, not left to convention.

**Lifecycle requirements (Section 18.10).** The schema must support a medication being
stopped or superseded, not only created and confirmed. At minimum this means a lifecycle
state on `medications` (active / completed / stopped / superseded), a nullable
`superseded_by` self-reference, and a reason plus timestamp for each transition. Cancelling
pending `reminders` when a medication is stopped must happen in the same transaction as the
state change, so no window exists in which a stopped medication still has live reminders.

**Open dependency on delivery format (Section 37, OQ-02).** If WhatsApp requires
pre-approved templates for business-initiated messages, the `reminders` table cannot store a
single rendered message body — it needs a template identifier plus an ordered set of
substitution variables. **Resolve OQ-02 before writing the `reminders` migration**, as
retrofitting this is more disruptive than getting it right once.

---

# 22. AI & Automation Workflow

AI/automation is used deliberately and only where it is appropriate:

| Task | Automation Approach | Human Oversight |
|---|---|---|
| Text extraction from image | Cloud Vision OCR (primary), LLM vision (fallback for low confidence) | Verifier sees confidence flags and both readings when fallback was used |
| Shorthand → structured data | Deterministic rule-based dictionary | Every parse decision is auditable and correctable |
| Drug name matching | Deterministic list lookup | Unmatched names are flagged, never silently accepted |
| Ambiguous reply classification | Keyword rules first, LLM fallback for genuinely unclear replies | Logged as `unclear_reply` when confidence is low, surfaced to caregiver |
| Translation | Bhashini API (rule/model-based translation service, not a general LLM) | N/A — translation of already-verified text is lower risk than parsing unverified text |

**Design Principle:** AI SHALL assist extraction and translation. AI SHALL NOT make the final, unverified decision on what a patient is told to take, in what amount, or when.

---

# 23. Development Roadmap

## Phase 1 — Printed-Prescription OCR & Parsing Pipeline
Prove image → raw text → structured medication JSON works reliably for printed/typed prescriptions, with no delivery yet.

## Phase 2 — Verification Dashboard & WhatsApp Delivery (MVP)
Build the human verification gate and wire up end-to-end WhatsApp intake and confirmation delivery.

## Phase 3 — Reminders & Adherence Tracking
Generate schedules from confirmed data, translate and voice-note them, deliver via WhatsApp, and log adherence replies.

## Phase 4 — Handwriting OCR
Extend to handwritten prescriptions, with confidence-threshold routing to mandatory review for uncertain reads.

## Phase 5 — Polish & Hardening
Data retention/deletion automation, multi-language support, adherence digests, rate limiting, structured logging.

## Phase 6+ (Explicitly Future)
Drug-interaction checking (pharmacist-reviewed only), direct hospital/clinic integration, pharmacist-facing verification-as-a-service.

Detailed per-phase task breakdowns and Definition-of-Done checklists are maintained in
`HANDOFF.md` as they are executed. Open questions are in Section 37.

**Sequence note.** The phases above are stated in *dependency* order — what must exist before
what. They are not an execution order, because Phase 1 as written presumes API credentials and
a test corpus that do not exist yet. `BUILD_ORDER.md` holds the execution sequence and
supersedes this section on ordering only; it has no authority over scope or safety.

---

# 24. MVP Scope

The MVP is considered complete when:

- A caregiver can send a printed prescription photo via WhatsApp
- The system extracts and parses it into structured medication data
- A caregiver can verify/correct that data via the dashboard, seeing each shorthand token's plain-language meaning alongside it
- Confirmed data automatically generates a reminder schedule
- Reminders are delivered in Marathi (text) via WhatsApp on schedule
- **A caregiver can stop a medication, immediately cancelling its pending reminders**
- Basic "taken" replies are logged

Stop/cancel is included deliberately: a system that can start a medication schedule but never
end one cannot be safely used even once, so it is not a post-MVP refinement.

Voice notes, handwriting OCR, and multi-language support are valuable but not required for MVP completion — they are Phase 3/4/5 additions layered onto a working core loop.

---

# 25. Future Scope

- Multi-language support beyond Marathi (Phase 5)
- Drug-interaction checking, built and validated with licensed pharmacist involvement (Phase 6+)
- Direct integration with clinic/hospital e-prescription systems
- Pharmacist-facing verification tooling, potentially as a paid service for community health programs
- Expansion beyond coastal Maharashtra to other regions/languages, contingent on Bhashini language coverage

---

# 26. Safety & Compliance Framework

## The Non-Negotiable Rule

**No dosage, frequency, or timing instruction may reach a patient or caregiver without explicit human confirmation first.**

This rule:

- Is enforced at the application logic layer (a guard clause in the reminder-generation function, not just a UI convention)
- Overrides any request — including from the project owner — to skip verification for convenience or speed
- Applies to every phase, every future feature, and every AI agent working on this codebase

Any proposed change that would weaken this gate must be flagged explicitly and require separate, deliberate, written sign-off — it must never be implemented as a silent side effect of an unrelated request.

## What this rule does and does not guarantee

Precision here matters, because the two claims below are easy to conflate and only one of
them is true.

**Guaranteed:** no dosage, frequency, or timing instruction reaches a patient without a
human having confirmed it. This is a property of the code and is testable.

**Not guaranteed:** that no *misreading* reaches a patient. The gate ensures a human looked;
it cannot ensure the human was right. Verifiers are untrained family members and volunteers
(Section 13), and Persona 2 (Section 14) is explicitly worried about misreading the
handwriting themselves.

The gap between those two statements is this project's residual risk, and it is narrowed —
not closed — by Section 18.5 Design Principle 2, which requires that verification present
interpretations a layperson can actually judge rather than transcriptions they can only
approve. Pharmacist review (Section 25) is the real closure and is out of current scope.

This distinction SHALL be stated plainly in user-facing and portfolio-facing material.
Describing the gate as guaranteeing correctness would invite exactly the unearned reliance
that makes medication-safety systems dangerous.

## Data Governance (India DPDP Act 2023)

**Scope of this claim.** This project is *designed with DPDP principles in mind*. It has not
undergone a compliance review, and this document does not claim it is DPDP-compliant.
Claiming unaudited compliance is worse than making no claim, because it invites reliance the
project cannot support. The obligations below are the ones deliberately designed for; others
that would attach to a real deployment — publishing a privacy notice, obtaining and recording
consent, appointing a grievance contact, breach notification — are **not** implemented and
would be prerequisites for any real-patient use.

Designed-for measures:

- Prescription images are sensitive personal health data. They are never served from a public
  bucket, and are accessed only through short-expiry signed URLs.
- **Encryption at rest depends on the deployment target and is stated honestly rather than
  assumed.** Section 19 specifies a single cloud VM running Docker Compose for the MVP;
  volume-level encryption on that VM is not equivalent to managed object-storage encryption,
  and whichever is actually in use SHALL be named in `ARCHITECTURE.md` rather than left to a
  blanket claim of "encrypted storage."
- A data retention policy is defined from Phase 1: raw images are deleted after a defined
  period post-verification unless explicitly retained.
- A "delete my data" request path exists from the start, even if manual/admin-driven in the MVP.
- Raw OCR text and drug names are never written to plaintext application logs — logs reference
  record IDs only. This is asserted by test, not by convention.

## Auditability

- Every parsing decision traces back to the exact raw OCR fragment it came from
- Every human correction is logged with old value, new value, verifier identity, and timestamp
- Every reminder delivery attempt and adherence reply is logged

---

# 27. Engineering Principles

## Principle 1 — Verification Before Delivery

No safety-relevant data reaches a patient without human confirmation. This is the project's defining constraint.

---

## Principle 2 — Determinism Where It Matters

Medical shorthand parsing and drug-name matching are rule-based and auditable. AI/LLM assistance is reserved for genuinely ambiguous, clearly-flagged fallback cases only.

---

## Principle 3 — Accessibility by Design

Every delivery decision defaults to the lowest-friction option for the target user: WhatsApp over a new app, voice notes over text-only, plain language over clinical terminology.

---

## Principle 4 — Small, Complete Features Over Large, Unfinished Ones

Each module and each phase should be genuinely complete and verified before the next begins.

---

## Principle 5 — Explainability

Every parsed field should be traceable to the raw text it came from; every correction should be traceable to who made it and why.

---

## Principle 6 — Human-in-the-Loop, Always

AI assists; it does not autonomously decide what a patient is told to take.

---

## Principle 7 — Security and Privacy by Default

Sensitive health data is encrypted at rest, retained only as long as necessary, and never logged in plaintext.

---

# 28. AI Development Workflow

AI coding agents are development assistants. They are expected to accelerate implementation while strictly respecting the safety framework and architecture defined in this document.

## Responsibilities of AI Agents

AI agents SHALL:

- Follow the requirements defined in MASTER_PLAN.md and the rule defined in Section 26.
- Respect the current implementation recorded in HANDOFF.md, and the git history over it where the two disagree.
- Build in small, single-responsibility steps — one migration, one function, one endpoint at a time.
- Write or confirm test cases before implementing pure logic (parsers, schedulers, matchers).
- Actually run/build/test code after every change rather than assuming correctness.
- Reference SCHEMA.md, SHORTHAND_DICTIONARY.md, and API contract docs instead of inventing field names or payload shapes.
- Explain non-trivial or safety-relevant implementation decisions clearly.

## AI Agents SHALL NOT

- Bypass, weaken, or silently remove the human-verification gate under any framing.
- Rewrite completed modules without justification.
- Introduce unnecessary dependencies.
- Implement features outside the current phase's defined scope without explicit approval.
- Log raw OCR text, drug names, or other sensitive health data in plaintext.

## AI Session Workflow

The authoritative session protocol lives in `AGENTS.md` sections 3 and 5, because that is the
file every agent tool loads. It is summarised here, not duplicated in detail:

1. Run the resume check — `git log`, `git status`. A dirty tree means a previous session died
   mid-task; reconcile before starting anything new.
2. Read `AGENTS.md`, then `HANDOFF.md`, then `SAFETY_INVARIANTS.md`.
3. Read the relevant MASTER_PLAN sections — not the whole file.
4. Write the task you are about to start into `HANDOFF.md` under "In Progress," with your
   intended approach.
5. Implement it in a small, isolated step.
6. Verify it — actually run the build and tests.
7. Update `HANDOFF.md` as you go, not only at the end, and append any non-obvious decision to
   `docs/DECISIONS.md`.

**Why step 7 is phrased that way:** this project is worked across several AI agent tools
specifically so that exhausting one tool's context is not blocking. Sessions therefore end
*abruptly*, without warning, at token limits — which is precisely when an
update deferred to "the end" never gets written. A protocol that only works when the session
closes gracefully fails in the exact situation it exists for.

---

# 29. Code Quality Standards

General good practice is assumed rather than restated here. The standards below are the ones
specific to *this* project, where getting them wrong has consequences beyond untidiness.

- **Purity where correctness is load-bearing.** The shorthand parser and the reminder
  scheduler SHALL be pure functions with no side effects, because they are the two components
  whose correctness is tested exhaustively and whose failure is a safety failure.
- **Preserve medical shorthand verbatim.** Do not "clean up" abbreviations. Shorthand codes
  are retained exactly as written in `frequency_code`, since the raw token is the audit trail
  back to the prescription.
- **Errors never carry patient data.** Error messages and stack traces SHALL reference record
  IDs only. This applies to responses, logs, and third-party error reporting.
- **Transactions around multi-row safety operations.** Verifying all medications on a
  prescription, and cancelling reminders when a medication is stopped, SHALL each be a single
  transaction. A partial write in either case leaves the system in a state where the
  verification gate's invariant does not hold.
- **No string-interpolated SQL, ever.** Parameterised queries or Knex builder methods
  exclusively.
- **Validate every input at the boundary** with Zod, including webhook payloads from Twilio,
  which are external input and not to be trusted.

---

# 30. Testing Strategy

## Minimum Testing Requirements

The following must be verified before marking a feature complete:

- Shorthand parser (unit tests against a representative set of real shorthand strings)
- Drug-name validation logic
- Reminder-schedule computation (including timezone/IST handling — test this explicitly and early)
- The verification-gate guard clause (a test confirming reminders cannot be generated for unconfirmed medications)
- **Stopping a medication cancels its pending reminders in the same transaction** — assert that no state exists in which a stopped medication still has live reminders (Section 18.10)
- **A revised dose re-enters verification** rather than updating a confirmed record in place (Section 18.10)
- **Log redaction** — assert that no drug name, raw OCR text, or patient identifier appears in log output (Section 33)
- **`needs_attention` escalation** — assert that an over-dose or cessation reply notifies a caregiver and is excluded from adherence statistics (Section 18.9)
- WhatsApp webhook handling (inbound image, inbound reply)
- End-to-end flow for at least one full prescription, from upload to delivered reminder

## Testing Philosophy

Focus on correctness, reliability, and safety-gate integrity rather than exhaustive coverage. The parser, scheduler, and verification-gate guard are the highest-priority test targets in the entire codebase.

---

# 31. Git Workflow

Primary branch: `main`. Feature branches follow `feature/<module>` — e.g.
`feature/shorthand-parser`, `feature/verification-dashboard`.

Commit conventions, including the `wip:` prefix used when a session ends mid-task, are
defined in `AGENTS.md` section 7 and are not duplicated here.

**Why commit hygiene matters more than usual on this project:** work is split across several
AI agent tools, and sessions end abruptly when they hit token limits. Git history is the only
record guaranteed to survive that, so small frequent commits are the primary handoff
mechanism, not a stylistic preference. See `docs/DECISIONS.md` D-005.

---

# 32. Performance Guidelines

Correctness and safety take priority over performance for the MVP. Three constraints are
worth stating because they are about cost or reliability rather than speed:

- **Never call OCR twice on the same image.** Cloud Vision is billed per call, and a retry
  loop that re-OCRs is a budget incident.
- **Reminder delivery and OCR processing run asynchronously via BullMQ**, never on the request
  thread. A reminder that fails to fire because an HTTP request timed out is a safety failure,
  not a latency problem.
- **Cache validated drug-name lookups.** The drug list is large and static.

---

# 33. Security Guidelines

- Serve prescription images only via short-expiry signed URLs, never from public buckets. Encrypt at rest, and name the actual mechanism in `ARCHITECTURE.md` rather than claiming "encrypted storage" generically (see Section 26).
- Store all API keys/secrets in environment variables, never hardcoded or committed.
- Validate and size-limit all uploads.
- Never log raw OCR text, drug names, or patient identifiers in plaintext logs.
- Enforce the verification gate at the code level (Section 26), not only in the UI.
- Implement the data retention/deletion path from Phase 1 onward, not as a later addition.

---

# 34. Documentation Policy

Documentation should remain concise, accurate, and synchronized with the codebase.

The full document set, grouped by how often each file changes, is in Section 1. In summary:
`PercriptionSetuMASTERPLAN.md`, `SAFETY_INVARIANTS.md`, `AGENTS.md`, and `BUILD_ORDER.md`
are stable; `ARCHITECTURE.md`, `docs/SCHEMA.md`, `docs/SHORTHAND_DICTIONARY.md`,
`docs/API_CONTRACTS.md`, and `docs/CORPUS.md` track the code; `HANDOFF.md` and
`docs/DECISIONS.md` change every session.

Additional documentation should only be introduced if it provides clear, ongoing value — this project intentionally maintains a small, high-signal documentation set rather than sprawling files.

**Corollary that matters more than the rule:** an unmaintained document is worse than a
missing one, because a fresh agent cannot tell stale from current and will act on it. If a
document stops being updated, delete it rather than leaving it to rot.

---

# 35. Definition of Done

A feature is considered complete only when all of the following conditions are satisfied:

- Requirements from MASTER_PLAN.md have been implemented for the current phase.
- The verification gate (Section 26) is not weakened or bypassed by the change.
- Code is functional and has been actually run/tested, not just reviewed by reading.
- Relevant unit tests exist and pass, especially for parser/scheduler/gate logic.
- Code is readable, maintainable, and follows the standards in Section 29.
- `HANDOFF.md` has been updated, and any non-obvious decision appended to `docs/DECISIONS.md`.
- The feature integrates correctly with the rest of the application (verified with a real end-to-end check where applicable, not just an isolated unit test).

Completion means more than "it works." It means the feature is safe, auditable, and maintainable.

---

# 36. Guiding Principles

PrescriptionSetu is built upon the following principles:

- A patient's safety is worth more than a developer's convenience.
- AI should assist verification and translation, never replace human judgment on unverified medical instructions.
- Determinism and auditability are preferred over opaque automation wherever the stakes are high.
- Accessibility is not an add-on — it is designed in from the first line of code.
- Small, complete, verified features are better than large, unfinished ones.
- Good architecture and a clear safety framework outlive any single feature.
- Quality is measured by whether a real elderly patient in a real village could trust and use this, not by feature count.

---

# 37. Open Questions

Decisions not yet made. `HANDOFF.md` previously referenced this section before it existed,
which meant the real decision list was floating unowned — this is its home. Resolved items
move to `docs/DECISIONS.md` with their reasoning; they are not deleted.

| ID | Question | Blocks | Status |
|---|---|---|---|
| OQ-01 | What is Bhashini/ULCA onboarding lead time, and is individual (non-institutional) access granted at all? | Phase 3 translation + TTS | Open — submit application early to start the clock |
| OQ-02 | Do business-initiated WhatsApp messages require pre-approved per-language templates with bounded variables? | **`reminders` schema** (Section 21) and all of Phase 3 | Open — **resolve before the `reminders` migration** |
| OQ-03 | What OCR confidence threshold should route to the LLM vision fallback? | Phase 1 tuning | Provisional: 0.70. Tune against the corpus, record the measured basis |
| OQ-04 | Which Indian drug list, and under what licence for redistribution in a public repo? | Drug validation module | Open — CDSCO-derived assumed; licence unverified |
| OQ-05 | How is the caregiver↔patient link established and trusted? Anyone who knows a phone number must not be able to register as a patient's caregiver and start sending them instructions. | Auth model, `patient_caregivers` | Open — a real safety question, not just an auth detail |
| OQ-06 | What are the default meal times, and how does a patient with an irregular schedule express that? | Reminder scheduler | Open — needs a sensible default plus per-patient override |
| OQ-07 | What is the actual encryption-at-rest mechanism on a single-VM Docker Compose deployment? | Section 26 data-governance claim | Open — must be named in `ARCHITECTURE.md`, not claimed generically |
| OQ-08 | What happens when a `needs_attention` reply is escalated and no caregiver responds? | Section 18.9 escalation | Open — a dead-end escalation is worse than none, because it creates false assurance |
| OQ-09 | Is this document's audience the academic evaluator or the technical reviewer? Sections 12, 14, and 16 serve the former; their length costs the latter. | Document structure | Open — currently serving both, optimally serving neither |
| OQ-10 | Should a `stat` dose ever generate a reminder, given that verification happens after the dose was already due? Who determines whether it was administered at the clinic? | `DOSE-STAT-001`, adherence workflow | Open — parser records one-time/immediate intent only and asserts nothing about administration |
| OQ-11 | Is letter case semantically meaningful in local prescribing (`HS` vs `hs`)? `BUILD_ORDER.md` §4 lists both separately. | Every `match_forms` list in `docs/SHORTHAND_DICTIONARY.md` | Open — currently assumed a listing artifact, so case folding is permitted. Cheap to confirm, expensive to discover late |
| OQ-12 | Who reviews and signs off Marathi medical phrasing, and does the dictionary hold fixed phrasing or does Bhashini translate at delivery? | Dictionary Marathi fields, Section 18.7 | Open — all entries marked `pending-native-review`; no Marathi authored |
| OQ-13 | Should `dictionary_version` be persisted alongside stored parse results, so a historical interpretation can be re-evaluated after a rule changes? | `medications` schema (Section 21) | Open — required in the in-memory parse result; storage deferred to the schema task |

---

# Closing Statement

PrescriptionSetu is more than a portfolio project.

It is an exercise in building AI-assisted software for a genuinely high-stakes, real-world problem — one where the correct engineering answer is often *not* "automate more," but "automate the parts that are safe to automate, and build an unbreakable human checkpoint around the parts that aren't."

The objective is not to build a fully autonomous prescription-reading system. The objective is to build a trustworthy translation and delivery pipeline that a real caregiver, in a real village in coastal Maharashtra, could use to help a real elderly parent take their medication correctly.

Success will be measured not only by whether the pipeline works, but by whether its safety framework holds under pressure, whether its architecture stays clear as it grows, and whether it would genuinely help the people it's meant for.

This document serves as the project's guiding reference and should remain the primary source of truth throughout the development lifecycle.
