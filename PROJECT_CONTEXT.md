# PROJECT_CONTEXT.md

> **Canonical Context File for AI Assistants & Human Collaborators.**  
> This file allows any AI agent (Antigravity, Claude Code, ChatGPT, OpenCode, or any future assistant) or engineer picking up this project — even after months away — to fully reconstruct the exact operational state, architectural decisions, and daily workflow without needing re-explanation.  
> **Rule:** Always read this file alongside [`AGENTS.md`](file:///c:/Users/thopa/PerscriptionSetu/AGENTS.md) and [`HANDOFF.md`](file:///c:/Users/thopa/PerscriptionSetu/HANDOFF.md) at the start of every session.

---

## 1. Project Overview

PrescriptionSetu is an open-source, safety-critical digital healthcare pipeline that converts photographed outpatient doctor prescriptions into reliable, culturally tailored medication reminders delivered in Marathi via WhatsApp to elderly chronic care patients in Maharashtra, India. Designed specifically for low-literacy or regional-language-speaking elders managing conditions like hypertension and type-2 diabetes, the system bridges the communication chasm between rapid doctor handwriting / Latin clinical shorthand and daily patient comprehension.

### Core Problem It Solves
Prescription non-adherence causes severe avoidable morbidity across India. Outpatient prescriptions are scribbled in Latin/English shorthand (`OD`, `BD`, `TDS`, `HS`, `AC`, `PC`), which patients and family caregivers frequently misunderstand, mistime, or abandon. Purely generative AI (LLMs reading prescriptions directly) poses unacceptable hallucination risks (inventing dosages or omitting contraindications). PrescriptionSetu solves this by enforcing an **inviolable, application-level human-in-the-loop verification gate (SI-01)**: photographed prescriptions undergo perception and deterministic shorthand parsing, but **zero reminders or instructions may reach a patient without explicit human confirmation or correction by a family caregiver or healthcare staff first**.

---

## 2. Tech Stack

### Frontend
- **Framework:** Next.js 14 (App Router, `v14.2.24`), React 18 (`v18.3.1`), React DOM (`v18.3.1`)
- **Language:** TypeScript (`v5.7.3`)
- **Styling:** Tailwind CSS (`v3.4.17`), PostCSS (`v8.5.2`), Autoprefixer (`v10.4.20`), `clsx` (`v2.1.1`), `tailwind-merge` (`v2.6.0`)
- **Icons:** `lucide-react` (`v0.475.0`)
- **Testing:** Jest (`v29.7.0`), `ts-jest` (`v29.2.5`), `@testing-library/react` (`v16.2.0`), `@testing-library/jest-dom` (`v6.6.3`)
- **Location:** [`apps/dashboard`](file:///c:/Users/thopa/PerscriptionSetu/apps/dashboard)

### Backend
- **Runtime & Framework:** Node.js (`>=20`), Express (`v5.2.1`)
- **Language:** TypeScript (pinned to `~5.9.3` due to `ts-jest 29` compiler API compatibility)
- **Database Access & Migrations:** Knex (`v3.3.0`), `pg` (`v8.23.0`)
- **Task Queue & Caching:** BullMQ (`v6.3.2`), `ioredis` (`v6.0.0`)
- **Testing:** Jest (`v30.4.2`), `ts-jest` (`v29.4.12`), Supertest (`v7.2.2`), `ts-node` (`v10.9.2`)
- **Location:** [`apps/api`](file:///c:/Users/thopa/PerscriptionSetu/apps/api)

### Perception Microservice (OCR)
- **Language & Runtime:** Python 3.11 (`python:3.11-alpine` container stub)
- **Planned Stack:** FastAPI + EasyOCR / Google Cloud Vision API
- **Current Phase 1 State:** Express API uses [`FixtureOcrProvider`](file:///c:/Users/thopa/PerscriptionSetu/apps/api/src/ocr/fixture-provider.ts) with 28 synthetic outpatient prescriptions across 4 cohorts (no live patient PII).
- **Location:** [`apps/ocr-service`](file:///c:/Users/thopa/PerscriptionSetu/apps/ocr-service)

### Databases & Stores
- **Primary Database:** PostgreSQL 15 (`postgres:15-alpine`), port `5432` (relational storage with strict foreign keys and `CHECK` constraints).
- **Queue / Cache Store:** Redis 7 (`redis:7-alpine`), port `6379` (BullMQ delayed reminder delivery queue).

### Hosting & Deployment Target
- **Local Dev / Testing:** Multi-container orchestration via [`docker-compose.yml`](file:///c:/Users/thopa/PerscriptionSetu/docker-compose.yml) (`api:3000`, `dashboard:3001`, `ocr-service:8000`, `postgres:5432`, `redis:6379`).
- **Target Production:** Cloud container runtime (GCP Cloud Run / GKE or equivalent Docker container platform), managed PostgreSQL (Cloud SQL or Supabase), managed Redis, and Meta WhatsApp Business Cloud API / Twilio Messaging.

---

## 3. Agents & Tools In Use

### AI Agents & Assistants
1. **Google Antigravity (Gemini 3.8 Flash):**
   - Primary active pair programming agent operating on the Windows host.
   - Responsibilities: End-to-end implementation across Node.js backend, Next.js dashboard, Knex migrations, deterministic parser slices, BullMQ queues, adherence classification, DPDP compliance, and Jest test suites.
2. **Claude / Claude Code (Anthropic Opus 5 / Sonnet):**
   - Architectural and contract authoring.
   - Authored the formal v0.1.0 specification of [`docs/API_CONTRACTS.md`](file:///c:/Users/thopa/PerscriptionSetu/docs/API_CONTRACTS.md) and early safety invariant formulations.
3. **ChatGPT / Cursor / OpenCode:**
   - Multi-agent collaboration stubs configured via [`.cursorrules`](file:///c:/Users/thopa/PerscriptionSetu/.cursorrules), [`CLAUDE.md`](file:///c:/Users/thopa/PerscriptionSetu/CLAUDE.md), and [`GEMINI.md`](file:///c:/Users/thopa/PerscriptionSetu/GEMINI.md), all redirecting unconditionally to canonical [`AGENTS.md`](file:///c:/Users/thopa/PerscriptionSetu/AGENTS.md).

### Connected MCP Servers
1. **StitchMCP:**
   - **Purpose:** Google Stitch UI prototype integration; lists, inspects, and manages design screens, design systems, and visual specifications.
   - **Connection:** Antigravity native MCP runner (`C:\Users\thopa\.gemini\antigravity\mcp\StitchMCP`).
   - **Status:** **Active & connected**.
2. **firebase-mcp-server:**
   - **Purpose:** Firebase developer tools, documentation search, security rules, and project deployment capabilities.
   - **Connection:** Antigravity native MCP runner (`C:\Users\thopa\.gemini\antigravity\mcp\firebase-mcp-server`).
   - **Status:** **Active & connected**.
3. **supabase:**
   - **Purpose:** Supabase documentation, project inspection, database migrations, SQL execution, and advisors.
   - **Connection:** Antigravity native MCP runner (`C:\Users\thopa\.gemini\antigravity\mcp\supabase`).
   - **Status:** **Active & connected**.

### Stitch Design Tool Integration
- **Stitch Project ID:** `projects/7482253828292669249`
- **Project Title:** `PrescriptionSetu Dashboard`
- **Connection Status:** **Connected and synced**.
- **Approved Stitch Screen Instances:**
  - `3c4ecaa20c8440e99b87d01810d200f5` (Prescription Review Workstation)
  - `ade351718e724c9c81a6e702db76a888` (Candidate Card & Provenance Inspector)
  - `14d4344b8b2f4d9aab771c69c743faf9` (Verification Action Modals)
  - `58d1f59cb555402985372740d031afdd` (Prescription Queue)
  - `0146bd5884df4e4a89d6648feaf04f3c` (Patient Directory)
  - `9de2d7f0d4e248eebfa0f6d07ba49f55` (Patient Profile & DPDP Erasure)
  - `fdf9eb8cdbaf4a7bacd1c1e326e545ad` (Reminders Timeline)
  - `763c64eacc9b442d876f42c74f078f0c` (Clinical Audit Trail)

---

## 4. Installed Plugins, Skills & Extensions

### Installed Antigravity Skills
- **Workflow & Superpowers Skills:**
  - `using-superpowers`: Protocol router for skill invocation.
  - `brainstorming`: Requirements exploration and interactive design before implementation.
  - `writing-plans`: Structural implementation plan authoring.
  - `executing-plans`: Review checkpoint execution of approved plans.
  - `subagent-driven-development`: Concurrent subagent dispatching for isolated tasks.
  - `test-driven-development`: Red-Green-Refactor test-first enforcement.
  - `systematic-debugging`: Root-cause diagnosis before modifying code.
  - `verification-before-completion`: Evidence verification before asserting completion.
  - `requesting-code-review` / `receiving-code-review`: Rigorous peer review protocols.
  - `using-git-worktrees` & `finishing-a-development-branch`: Git branch and worktree isolation.
- **Environment, Safety & Data Skills:**
  - `accidental-data-loss-prevention`: Mandatory safety stop before destructive SQL (`DROP`, `TRUNCATE`, bulk `DELETE`) or cloud resource deletion.
  - `generative_ui`: Dynamic rendering of interactive UI widgets and dashboards.
  - `antigravity-guide` & `agy-customizations`: CLI, configuration, and customization reference.
  - `managing-python-dependencies`: Virtual environment and dependency safety.
  - `google-cloud-storage-basics`, `bigquery-*`, `dataform-bigquery`, `dbt-bigquery`, `gcp-*`: Google Cloud Platform data and infrastructure management skills.

### IDE Extensions & Editor Rules
- **Configuration:** [`.cursorrules`](file:///c:/Users/thopa/PerscriptionSetu/.cursorrules), [`CLAUDE.md`](file:///c:/Users/thopa/PerscriptionSetu/CLAUDE.md), and [`GEMINI.md`](file:///c:/Users/thopa/PerscriptionSetu/GEMINI.md) bind IDEs to [`AGENTS.md`](file:///c:/Users/thopa/PerscriptionSetu/AGENTS.md).
- **Editor Tooling:** Tailwind CSS IntelliSense, Prettier, TypeScript and JavaScript Language Features, ESLint.

### CLI Tools & Helper Scripts
- **Backend (`apps/api`):**
  - `npm run dev`: Starts Express server via `ts-node src/server.ts`
  - `npm run typecheck`: Runs strict TypeScript check (`tsc --noEmit`)
  - `npm test`: Runs Jest test suite
  - `npm run migrate:latest`: Executes Knex migrations
  - `npm run migrate:rollback`: Rolls back Knex migrations
- **Frontend (`apps/dashboard`):**
  - `npm run dev`: Runs Next.js dev server on port `3001` (`next dev -p 3001`)
  - `npm run build`: Compiles production Next.js build
  - `npm run typecheck`: Runs TypeScript compiler check (`tsc --noEmit`)
  - `npm test`: Runs React Testing Library / Jest tests

---

## 5. Design System Reference

### Design Token Foundation
- **Design System Documentation:**
  - Design Tokens & Specifications: [`.stitch/DESIGN.md`](file:///c:/Users/thopa/PerscriptionSetu/.stitch/DESIGN.md)
  - Screen Catalog & Route Registry (All 43 Screens): [`.stitch/SCREENS.md`](file:///c:/Users/thopa/PerscriptionSetu/.stitch/SCREENS.md)
- **Design Tokens Location in Code:**
  - Tailwind Configuration: [`apps/dashboard/tailwind.config.js`](file:///c:/Users/thopa/PerscriptionSetu/apps/dashboard/tailwind.config.js)
  - Global CSS & Root Variables: [`apps/dashboard/src/app/globals.css`](file:///c:/Users/thopa/PerscriptionSetu/apps/dashboard/src/app/globals.css)
- **Approved Visual Direction:** **Light Health-Tech Visual Direction** (formally ratified in [`docs/DECISIONS.md` D-034](file:///c:/Users/thopa/PerscriptionSetu/docs/DECISIONS.md#L882-L913)). Provides high clinical clarity, spacious typography, and minimal visual fatigue.

### Color Palette & Semantic Tokens
- **Canvas / Background:** `#F8FAFC` (`canvas`, `--background`)
- **Surfaces & Cards:** `#FFFFFF` (`surface.card`, `surface.1`), with subtle border `#E2E8F0` (`border.DEFAULT`) and diffuse elevation (`shadow-xs`).
- **Primary Clinical Brand:** `#4A40C1` (`brand.500` - Warm Healthcare Indigo)
  - Shades: `brand.50` (`#F5F3FF`) through `brand.900` (`#1D1752`)
- **Semantic Status Tokens:**
  - **Mint / Emerald:** `#059669` (`mint.DEFAULT` / `mint.600`) — Confirmed candidates, active regimens, verified status, and live `SI-01 Gate Active` safety pill.
  - **Amber / Gold:** `#D97706` (`amber.600` / `amber.500`) — Pending review, unverified candidates, warning banners, rate limit notices.
  - **Rose / Crimson:** `#E11D48` (`rose.600` / `rose.500`) — Rejected candidates, stopped medications, DPDP erased data, errors.
- **Typography:**
  - **Sans (Headings & Body):** `Avenir Next`, `Inter`, system-sans (`font-sans`)
  - **Monospace (Code-Point Spans, IDs, Rule IDs):** `JetBrains Mono`, monospace (`font-mono`)

---

## 6. Current Architecture Snapshot

### Directory Tree & Purpose
```text
c:\Users\thopa\PerscriptionSetu
├── AGENTS.md                  # Canonical agent instruction file; read first every session
├── BUILD_ORDER.md             # Authoritative step-by-step implementation order (supersedes MASTERPLAN)
├── CLAUDE.md / GEMINI.md      # Auto-loader stubs redirecting agents to AGENTS.md
├── HANDOFF.md                 # Single volatile live-state file updated continuously every session
├── PercriptionSetuMASTERPLAN.md # Comprehensive 1200-line architectural design and rationale
├── README.md                  # Public project documentation and overview
├── SAFETY_INVARIANTS.md       # 16 inviolable safety properties (SI-01 to SI-16)
├── docker-compose.yml         # Dev environment container definition (api, dashboard, postgres, redis)
├── .env.example               # Template environment variables (zero secrets)
│
├── .stitch/                   # Canonical Stitch design integration specifications
│   ├── DESIGN.md              # Light Health-Tech design system tokens, components, and rules
│   └── SCREENS.md             # Complete 43-screen inventory, route mappings, and states
│
├── docs/                      # Authoritative architectural documentation
│   ├── API_CONTRACTS.md       # Pure parser contracts, REST API envelopes, and data types
│   ├── CORPUS.md              # Provenance & definitions for 28 synthetic test prescriptions
│   ├── DECISIONS.md           # Append-only architectural decision log (D-001 through D-034)
│   ├── SCHEMA.md              # PostgreSQL schema, column constraints, and relational rules
│   └── SHORTHAND_DICTIONARY.md # Exact-match shorthand token rules, boundaries, and provenance
│
├── apps/
│   ├── api/                   # Node.js + Express + Knex + BullMQ API service
│   │   ├── src/
│   │   │   ├── adherence/     # Marathi/English reply classifier and adherence logging service
│   │   │   ├── db/            # Knex connection, migrations (001 core, 002 reminders), repository
│   │   │   ├── delivery/      # MessageProvider seam (Console, TwilioSandbox, TwilioProduction)
│   │   │   ├── domain/        # Core domain types and database entity schemas
│   │   │   ├── logging/       # Structured JSON logger enforcing SI-16 PHI/OCR redaction
│   │   │   ├── middleware/    # Native CORS and sliding-window prescription upload rate limiter
│   │   │   ├── ocr/           # OCR provider abstraction and FixtureOcrProvider
│   │   │   ├── parser/        # Pure deterministic shorthand parser with exact-match rules
│   │   │   ├── reminders/     # Reminder scheduler (IST math), generator, BullMQ worker
│   │   │   ├── retention/     # DPDP Act right-to-erasure and image cleanup service
│   │   │   ├── routes/        # Express routers (/prescriptions, /medications, /adherence, /patients, /audit)
│   │   │   ├── translation/   # Bhashini / Google Translate / Passthrough translation providers
│   │   │   ├── verification/  # Inviolable SI-01 gate, guards, and candidate display formatters
│   │   │   ├── app.ts         # Express application factory with SI-16 sanitized error handler
│   │   │   └── server.ts      # Server entry point
│   │   └── tests/             # 52 Jest suites (634 tests, 100% passing)
│   │
│   ├── dashboard/             # Caregiver Operations Dashboard (Next.js 14 App Router)
│   │   ├── src/
│   │   │   ├── app/           # 8 product routes (/, /prescriptions, /prescriptions/[id],
│   │   │   │                  # /patients, /patients/[id], /reminders, /audit, /staff)
│   │   │   ├── components/    # Workstation UI components (OcrViewer, CandidateCard, GateStatusBar, modals)
│   │   │   ├── lib/           # Typed API client (api.ts) and span highlighter (span-highlighter.ts)
│   │   │   └── tests/         # 10 Jest / RTL suites (44 tests, 100% passing)
│   │   └── tailwind.config.js # Light Health-Tech design tokens
│   │
│   └── ocr-service/           # Python 3.11 microservice stub (Dockerfile, planned FastAPI EasyOCR)
│
└── packages/
    └── shared-types/          # Monorepo shared TypeScript types placeholder
```

### Key API Routes & Endpoints
| HTTP Method | Route | Description | Safety & Invariant Notes |
|---|---|---|---|
| `POST` | `/api/prescriptions/upload` | Ingests prescription image/fixture key, runs OCR & deterministic parser, persists draft. | Rate limited (10 req/min per D-032). Redacts PHI from logs (SI-16). |
| `GET` | `/api/prescriptions/pending` | Lists unverified prescriptions awaiting caregiver review. | Filterable by OCR confidence. |
| `GET` | `/api/prescriptions/:id` | Returns prescription OCR text, image key, and medication candidates with display expansions. | Resolves `source_span` offsets for bi-directional UI highlighting (SI-04). |
| `POST` | `/api/prescriptions/:id/verify` | **Atomic Verification Gate:** Transitions prescription to `verified`. | **SI-01 Gate:** Fails if any medication is `pending` or `rejected`. Generates reminders and enqueues to BullMQ. |
| `POST` | `/api/medications/:id/confirm` | Caregiver confirms candidate without edits. | Sets `verification_status = 'confirmed'`, creates audit record (SI-14). |
| `POST` | `/api/medications/:id/correct` | Caregiver edits dosage, frequency, timing, or duration. | Requires human justification reason, logs old/new values to audit log (SI-14). |
| `POST` | `/api/medications/:id/reject` | Caregiver rejects candidate. | Requires human justification reason; blocks prescription verification (SI-01). |
| `POST` | `/api/medications/:id/stop` | Transactional medication stop. | Sets `lifecycle_state = 'stopped'`, cancels pending reminders (SI-10, SI-11), logs audit (SI-14). |
| `POST` | `/api/adherence/reply` | Webhook/endpoint for patient WhatsApp replies. | Trilingual reply classifier (English, Marathi Devanagari, Romanized). Escalates alerts. |
| `GET` | `/api/adherence/patient/:id` | Calculates adherence percentage and event count. | Excludes `needs_attention` replies from negative statistics. |
| `GET` | `/api/patients` | Outpatient directory listing. | Only active (non-deleted) patients returned. |
| `GET` | `/api/patients/:id` | Patient clinical profile, meal times, and active regimens. | Returns custom meal times for reminder calculation. |
| `DELETE` | `/api/patients/:id` | **DPDP Right-to-Erasure:** Redacts PII, deletes image keys, cancels reminders. | Halts all reminders (SI-10, SI-11), stops active medications, preserves audit trail (SI-14, D-031). |
| `GET` | `/api/audit` | Clinical audit trail query with joins, filters, and summary metrics. | Read-only (SI-14). Parameterized queries. Zero-PHI logging (SI-16). |
| `GET` | `/api/audit/:id` | Single clinical audit record with enriched context. | Read-only (SI-14). Returns 404 for unknown IDs. |
| `GET` | `/health` | Basic service health probe. | Returns `{ status: 'ok' }`. |

### Auth & Safety-Critical Invariants (Never Change Casually)
1. **SI-01 (Verification Gate):** A prescription cannot reach `status = 'verified'` while any associated medication remains `pending` or `rejected`.
2. **SI-02 / SI-03 / SI-15 (Deliverable Predicate):** Only medications with `verification_status IN ('confirmed', 'corrected') AND lifecycle_state = 'active'` may generate reminders or reach a patient.
3. **SI-04 (Provenance):** Every parsed field must record `rule_id`, `dictionary_version`, `matched_literal`, `source_span` (Unicode code points), and `match_type` in immutable `parse_result` JSONB.
4. **SI-07 / SI-08 (Dose vs. Strength):** Parsed tablet strength (e.g. `500 mg`) must never be written to `dose_amount`. Ceiling fields (`max_doses_per_day`, `min_interval_hours`) are parser-unwritable and require explicit human input.
5. **SI-10 / SI-11 (Atomic Cancellation):** Medication stops and DPDP patient deletions atomically cancel all pending reminders. The BullMQ reminder worker double-checks PostgreSQL immediately prior to outbound message delivery.
6. **SI-14 (Append-Only Audit Trail):** Every consequential state change (parse, confirmation, correction with reason, stop, erasure) is recorded in `medication_audit_events`.
7. **SI-16 (Privacy & Redaction):** Raw OCR text, prescription contents, drug names, patient names, and phone numbers must never appear in application logs. Only IDs, counts, error codes, and durations are logged.

---

## 7. Daily Workflow / How We Build

### Step-by-Step Working Loop
1. **Start of Session:**
   - Execute git inspection: `git log --oneline -15`, `git status`, `git branch --show-current`.
   - Read [`HANDOFF.md`](file:///c:/Users/thopa/PerscriptionSetu/HANDOFF.md), [`AGENTS.md`](file:///c:/Users/thopa/PerscriptionSetu/AGENTS.md), and [`SAFETY_INVARIANTS.md`](file:///c:/Users/thopa/PerscriptionSetu/SAFETY_INVARIANTS.md).
   - If `git status` is dirty from a prior interrupted session, reconcile WIP before touching anything new.
2. **Record Intent Before Code:**
   - Add the target task to `HANDOFF.md` under `## In Progress` with a 1–2 line implementation approach.
3. **Frontend Workstation Flow:**
   - Check approved Stitch screens in StitchMCP (`projects/7482253828292669249`).
   - Scaffold components in `apps/dashboard/src/components` adhering to the Light Health-Tech design tokens (`tailwind.config.js`).
   - Verify layout and bi-directional span highlighting in Next.js (`npm run build`, `npm run typecheck`, RTL tests).
4. **Backend / Pure Logic Flow (Strict TDD):**
   - Write failing unit/integration tests first named after the rule or invariant (e.g., `FREQ-BD-001.test.ts`, `SI-01-gate.test.ts`).
   - Run tests to confirm genuine failure (`RED`).
   - Implement minimal required logic in `apps/api/src/`.
   - Run `npm run typecheck` and `npm test` to confirm clean pass (`GREEN`).
5. **Decisions & Invariants Gate:**
   - Never bypass or weaken any safety invariant.
   - Append any non-obvious architecture choice immediately to [`docs/DECISIONS.md`](file:///c:/Users/thopa/PerscriptionSetu/docs/DECISIONS.md) (`D-xxx`).
6. **Documentation & Context Update:**
   - Execute the **Required .md Files Updation Protocol** detailed below before completing the task.
7. **End of Session Protocol:**
   - Run full repository checks:
     - `apps/api`: `npm run typecheck && npm test`
     - `apps/dashboard`: `npm run typecheck && npm test && npm run build`
   - Move completed items in `HANDOFF.md` to `## Done` and write a concrete, self-contained `## Next Task`.
   - Commit changes small and often using conventional commit messages.

### Required .md Files Updation Protocol (Feature Implementation Checklist)

> [!IMPORTANT]
> **Mandatory Rule for All AI Agents and Engineers:** Never conclude a feature implementation or bug fix by editing source code alone. Documentation in this repository is active architectural infrastructure, not an afterthought. Every time a new feature, endpoint, schema modification, or parser rule lands, you **MUST** review and update the relevant `.md` files listed in this checklist.

| Markdown File | When It Must Be Updated | Required Updation Action |
|---|---|---|
| [`HANDOFF.md`](file:///c:/Users/thopa/PerscriptionSetu/HANDOFF.md) | **Every single task / session** | • **Before starting:** Write task name & implementation plan into `## In Progress`.<br>• **Continuously / On completion:** Move completed task to `## Done` with date, concise summary, and exact test pass metrics.<br>• **Set next cursor:** Write a highly specific, immediately actionable `## Next Task` so a new session starts without ambiguity.<br>• Update `## Last Updated` line with timestamp and summary. |
| [`PROJECT_CONTEXT.md`](file:///c:/Users/thopa/PerscriptionSetu/PROJECT_CONTEXT.md) | **Every feature, UI change, or API addition** | • **§6 Architecture Snapshot:** Add any newly created directories, source files, or Express/Next.js routes to the directory tree and route table.<br>• **§6 Invariants:** If lifecycle states or delivery gating were modified, re-verify compliance against the invariant summary.<br>• **§8 Known Issues:** Remove blockers resolved by the feature; record any newly discovered edge cases, technical debt, or operational limitations.<br>• **§9 Last Updated:** Update the date and one-line summary of what was accomplished in the session. |
| [`docs/DECISIONS.md`](file:///c:/Users/thopa/PerscriptionSetu/docs/DECISIONS.md) | **Whenever a non-obvious architecture, library, or design choice is made** | • Append a numbered entry (`D-xxx`) the moment a decision is made.<br>• Must document: Date, Status, Decision, Alternatives Considered, Why, and Cost.<br>• Never reconstruct decisions retroactively; record them in real time. |
| [`docs/API_CONTRACTS.md`](file:///c:/Users/thopa/PerscriptionSetu/docs/API_CONTRACTS.md) | **Whenever an API route, payload shape, status code, or parser signature changes** | • Document request body schemas, response envelopes, query parameters, HTTP status codes, and error formats.<br>• Update parser interface signatures or type contracts (`apps/api` ↔ `apps/dashboard` ↔ `apps/ocr-service`). |
| [`docs/SCHEMA.md`](file:///c:/Users/thopa/PerscriptionSetu/docs/SCHEMA.md) | **Whenever a database migration or schema modification occurs** | • Update table definitions, column types, nullability, foreign key constraints (`ON DELETE RESTRICT`), and `CHECK` value sets.<br>• Clearly state which safety invariants (`SI-01`, `SI-14`, etc.) the database constraints realize. |
| [`docs/SHORTHAND_DICTIONARY.md`](file:///c:/Users/thopa/PerscriptionSetu/docs/SHORTHAND_DICTIONARY.md) | **Whenever prescription shorthand parsing rules or tokens change** | • Document rule IDs (e.g. `FREQ-xxx`, `AMT-xxx`, `COND-xxx`), regex/exact patterns, canonical expansions, tier rankings, and 5-field provenance expectations.<br>• Update boundary definitions and conflict resolution matrices if new token interactions emerge. |
| [`SAFETY_INVARIANTS.md`](file:///c:/Users/thopa/PerscriptionSetu/SAFETY_INVARIANTS.md) | **Whenever clinical safety, delivery gating, or audit logic is touched** | • Audit implementation against `SI-01` through `SI-16`. Verify zero gates are bypassed, weakened, or routed around.<br>• Refuse any request to weaken safety invariants without formal written sign-off in `docs/DECISIONS.md`. |
| [`BUILD_ORDER.md`](file:///c:/Users/thopa/PerscriptionSetu/BUILD_ORDER.md) | **Whenever completing or advancing phase milestones** | • Check off completed phase steps; ensure prerequisite dependencies for upcoming steps are satisfied. |
| [`docs/CORPUS.md`](file:///c:/Users/thopa/PerscriptionSetu/docs/CORPUS.md) | **Whenever test fixtures, synthetic prescriptions, or benchmark cases are added** | • Register new synthetic prescription fixtures, cohort identifiers, and expected parsed outputs (ensuring 0% real patient data). |

### Git & Commit Conventions
- **Prefixes:**
  - `feat:` — New functionality (e.g., `feat: implement DPDP patient right-to-erasure endpoint`)
  - `fix:` — Bug fixes (e.g., `fix: correct IST timezone offset calculation in scheduler`)
  - `test:` — Test suites or synthetic fixtures (e.g., `test: add corpus benchmark verification suite`)
  - `docs:` — Documentation or contract updates (e.g., `docs: record D-034 light health-tech direction`)
  - `wip:` — Work-in-progress checkpoint before session termination or token limit

#### Testing Approach
- **Total Test Baseline:** **62 test suites, 678 tests (100% passing)** across the repository.
- **Backend (`apps/api`):** 52 suites, 634 tests. Tests run via Jest with real Knex/PostgreSQL transactions, BullMQ mocks, and synthetic OCR providers.
- **Corpus Benchmark (`apps/api/tests/corpus/`):** 61 automated tests validating 28 synthetic outpatient prescriptions across 4 cohorts with zero real patient data.
- **Frontend (`apps/dashboard`):** 10 suites, 44 tests covering UI components (`CandidateCard`, `GateStatusBar`, `PendingQueue`, `span-highlighter`, `CreatePatientModal`, `UploadPrescriptionModal`, `ActiveMedications`, `AuditPage`, `NavigationEntryPoints`, `AppSidebar`).

---

## 8. Known Issues / In-Progress Work

### Toolchain Constraints (Read Carefully)
1. **Jest Runs on Windows Host Only:**
   - `npm test` in `apps/api` runs on the Windows host only, never in an agent's Linux sandbox.
   - *Cause:* `jest-resolve@30.4.x` relies on native NAPI bindings (`@unrs/resolver-binding-win32-x64-msvc`). Regenerating lockfiles inside Linux will break Windows builds.
   - *Workaround:* Run `npm run typecheck` (`tsc --noEmit`) inside sandbox (pure JS), and execute `npm test` via Windows PowerShell.
2. **TypeScript Pinned to `~5.9.3`:**
   - Do not upgrade TypeScript to `7.x`. `ts-jest 29` requires the classic `require('typescript')` compiler API which was removed in TS 7.0.

### Operational Limitations & Accepted Risks
- **PostgreSQL → Redis Non-Atomic Delivery Window:**
   - In `verifyPrescription()`, reminders are committed to PostgreSQL first and then enqueued into Redis BullMQ. If the server crashes in the exact millisecond between PostgreSQL commit and Redis enqueue, the reminder row remains in PostgreSQL with `status = 'pending'` but without a corresponding BullMQ job. An outbox pattern was intentionally deferred to avoid overbuilding in Phase 1 (accepted risk).

### Open Safety Questions (OQ) Still To Be Addressed
- **OQ-03:** OCR confidence threshold tuning (starting at 0.70; to be calibrated on expanded corpus).
- **OQ-05:** Patient-caregiver authorization and role-based permissions model.
- **OQ-06:** Precision and validation format for custom patient `meal_times`.
- **OQ-07:** Image encryption at rest and pre-signed URL expiration for prescription scans.
- **OQ-08:** Caregiver escalation protocol when adherence replies return ambiguous `needs_attention`.
- **OQ-10:** Ownership and administration confirmation for immediate `stat` doses.
- **OQ-12:** Native Marathi speaker linguistic review of generated WhatsApp reminder messages.

### External Dependencies / Blockers
- **Bhashini ULCA API Key:** Key request submission to Government of India Bhashini portal pending (gates Phase 3 translation).
- **WhatsApp Business Account (WABA):** Meta/Twilio business-initiated message template registration pending (Sandbox provider is used in the interim).
- **OCR Service Containerization:** `apps/ocr-service` FastAPI EasyOCR containerization planned to replace `FixtureOcrProvider` for live image ingestion.

### Previously Resolved Issues (Do Not Repeat)
- **OQ-02 Reminders Payload Dilemma:** Resolved by D-030 via polymorphic JSONB (`rendered_text` vs `template`), allowing zero-migration transition between Twilio Sandbox and Meta production templates.
- **Dark vs. Light Theme Inconsistency:** Resolved by D-034 aligning all 8 dashboard routes to the Light Health-Tech visual direction matching approved Stitch prototypes.
- **CORS Configuration:** Implemented native Express CORS middleware allowing dashboard origin `http://localhost:3001` without using an unsafe wildcard `*`.
- **DPDP Act Patient Erasure:** Resolved by D-031 via transactional PII redaction, delivery cancellation, and audit preservation, avoiding foreign key constraint violations and retaining compliance audit logs.

---

## 9. Last Updated

- **Date:** 2026-09-06
- **Summary:** Step 8 — Clinical Audit Trail Integration COMPLETE. Implemented read-only `GET /api/audit` and `GET /api/audit/:id` with parameterized Knex joins on `medication_audit_events`, `medications`, `prescriptions`, `patients`, and `caregivers`. Wired `apps/dashboard/src/app/audit/page.tsx` with live metrics, search, event filtering, patient/prescription links, and before/after clinical field diffs (SI-14). Enforced SI-16 zero-PHI log stream discipline. Total repository verified baseline: **62 test suites, 678 tests (100% passing)**, Git baseline commit `9136382`.
