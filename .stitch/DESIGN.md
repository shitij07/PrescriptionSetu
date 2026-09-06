# PrescriptionSetu Design System (`.stitch/DESIGN.md`)

> **Design Direction:** Light Health-Tech Visual Direction  
> **Authority:** Ratified in [`docs/DECISIONS.md` D-034](file:///c:/Users/thopa/PerscriptionSetu/docs/DECISIONS.md#L882-L913), superseding legacy dark "Clinical Precision Workstation" metadata  
> **Canonical Production Stitch Project:** `projects/12099988010162769768` (*PrescriptionSetu — Canonical Workstation*) — **SOLE CANONICAL PRODUCTION DESIGN AUTHORITY**  
> **Canonical Design System Asset:** `assets/14883456124291103363` (*PrescriptionSetu Light Health-Tech D-034*)  
> **Historical Archive Stitch Project:** `projects/7482253828292669249` (*PrescriptionSetu Dashboard*) — **HISTORICAL ARCHIVE ONLY (READ-ONLY)**  
> **Implementation Target:** [`apps/dashboard/tailwind.config.js`](file:///c:/Users/thopa/PerscriptionSetu/apps/dashboard/tailwind.config.js) and [`apps/dashboard/src/app/globals.css`](file:///c:/Users/thopa/PerscriptionSetu/apps/dashboard/src/app/globals.css)

---

## 1. Project Authority & Design Hierarchy

1. **Sole Canonical Production Authority:**  
   `projects/12099988010162769768` is the authoritative production design project for PrescriptionSetu. All frontend implementation, component styling, layout compositions, and token verifications must use this canonical project as their primary visual authority.
2. **Historical Archive Boundary:**  
   `projects/7482253828292669249` is the historical prototype archive. It is strictly **READ-ONLY** and must never receive write, generation, edit, variant, or mutation calls. Historical prototypes may be consulted solely for design provenance and context.
3. **Canonical Design System:**  
   The active visual direction is governed by D-034 Light Health-Tech registered under asset `assets/14883456124291103363`.

---

## 2. Clinical North Star & Core Design Principles

PrescriptionSetu's interface is designed for family caregivers, community health workers, and clinical verifiers. Because unverified medication instructions can cause severe real-world harm, the design system enforces four foundational principles:

1. **Safety Over Speed (Unbreakable SI-01 Visibility):**
   - The human verification gate is never hidden or relegated to a subtle icon.
   - Prescriptions that are unverified, partially verified, or blocked prominently display the `SI-01 Safety Gate` status pill.
   - Action controls reflect safety gating: activation buttons remain structurally disabled until 100% of candidates reach `confirmed` or `corrected`.

2. **High-Contrast Clinical Precision (Light Health-Tech):**
   - Clean, light surfaces (`#FFFFFF` on `#F8FAFC` canvas) maximize readability across varied ambient lighting conditions and mobile/desktop displays.
   - Tonal depth is achieved through crisp 1px borders (`#E2E8F0`) and diffuse elevation rather than heavy drop shadows.
   - Pure light mode: zero dark themes, zero black backgrounds.

3. **Strict Typography & Provenance Discipline:**
   - Standard clinical labels, instructions, and patient names use clean modern sans-serif typography (`Avenir Next`, `Inter`).
   - All machine-parsed data, prescription identifiers, OCR text spans, shorthand rules (e.g. `FREQ-BD-001`), ICD codes, and audit timestamps are strictly styled in `JetBrains Mono` to prevent optical misreading of numbers and codes.

4. **Plain-Language Clinical UX & Progressive Disclosure:**
   - Primary clinician-facing workflows must use plain, understandable medical phrasing (e.g. *"Twice daily (Morning, Night)"*, *"After meals"*).
   - Low-level machine interpretation internals (regex patterns, AST tokens, Unicode character offsets, bounding-box coordinates) must not clutter primary clinical surfaces.
   - Technical provenance belongs in secondary inspection drawers, popovers, or monospace metadata badges.
   - Safety decisions must remain completely transparent and actionable without requiring technical compiler or parser knowledge.

---

## 3. Color System & Design Tokens

### Canvas & Surfaces
| Token Name | Hex Code | Tailwind Utility | Usage |
|---|---|---|---|
| `canvas` | `#F8FAFC` | `bg-canvas`, `bg-slate-50` | Main application background canvas |
| `surface.card` / `surface.1` | `#FFFFFF` | `bg-white` | Primary content cards, tables, and workstation panels |
| `surface.subtle` / `surface.2` | `#F8FAFC` | `bg-slate-50` | Nested containers, table headers, and inactive tabs |
| `surface.muted` / `surface.3` | `#F1F5F9` | `bg-slate-100` | Input backgrounds, code callouts, and hover states |

### Borders & Dividers
| Token Name | Hex Code | Tailwind Utility | Usage |
|---|---|---|---|
| `border.DEFAULT` | `#E2E8F0` | `border-slate-200` | Standard card, table row, and container borders |
| `border.subtle` | `#F1F5F9` | `border-slate-100` | Subtle internal section dividers |
| `border.dark` | `#CBD5E1` | `border-slate-300` | Emphasized borders, active input boundaries |

### Primary Clinical Brand (Warm Healthcare Indigo)
| Token Name | Hex Code | Tailwind Utility | Usage |
|---|---|---|---|
| `brand-50` | `#F5F3FF` | `bg-brand-50` | Active menu item backgrounds, badge tints |
| `brand-100` | `#EDE9FE` | `bg-brand-100` | Highlight callouts, span highlighter background |
| `brand-500` | `#4A40C1` | `bg-brand-500`, `text-brand-500` | **Primary Brand Color**; primary CTAs, active indicators |
| `brand-600` | `#3D34A5` | `bg-brand-600`, `text-brand-600` | Primary button hover state, prominent text links |
| `brand-700` | `#312988` | `bg-brand-700` | Active button press state |

### Semantic Clinical Status Tokens
| State | Hex Code | Light Tint | Tailwind Utilities | Clinical Meaning |
|---|---|---|---|---|
| **Mint / Confirmed** | `#059669` | `#ECFDF5` | `text-emerald-700`, `bg-emerald-50`, `border-emerald-200` | Confirmed candidate, verified prescription, active regimen, `SI-01 Gate Active` safety pill |
| **Amber / Pending** | `#D97706` | `#FEF3C7` | `text-amber-800`, `bg-amber-50`, `border-amber-200` | Awaiting review, unconfirmed candidate, low OCR confidence (<70%), ambiguous instruction, rate limit warning |
| **Rose / Alert / Stop** | `#E11D48` | `#FFF1F2` | `text-rose-700`, `bg-rose-50`, `border-rose-200` | Rejected candidate, stopped medication, DPDP patient erasure, allergy conflict, validation error |

---

## 4. Typography System

### Font Families
- **Primary Sans-Serif (`font-sans`):** `"Avenir Next"`, `Inter`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `Roboto`, `sans-serif`
  - Used for headings, body copy, navigation labels, button labels, and patient names.
- **Monospace (`font-mono`):** `"JetBrains Mono"`, `ui-monospace`, `SFMono-Regular`, `Menlo`, `Monaco`, `Consolas`, `monospace`
  - Used for prescription IDs (`RX-84920`), patient IDs (`PT-84729`), shorthand rules (`FREQ-BD-001`), OCR Unicode spans, ICD-10 codes, and audit timestamps.

### Type Scale & Hierarchy
| Level | Font Size / Line Height | Font Weight | Family | Example Usage |
|---|---|---|---|---|
| **Display Heading** | 32px / 40px (`text-2xl` / `text-3xl`) | Bold (700) | Sans | Overview KPI headers, Patient detail name |
| **Page Heading (H1)** | 20px / 28px (`text-xl`) | Bold (700) | Sans | Workstation & Directory page titles |
| **Section Heading (H2)** | 16px / 24px (`text-base`) | SemiBold (600) | Sans | Card titles, workstation column headers |
| **Body (Regular)** | 14px / 20px (`text-sm`) | Regular (400) | Sans | Primary instructions, clinical notes |
| **Technical Label** | 12px / 16px (`text-xs`) | Medium (500) | Monospace | Rule provenance, status badges, timestamps |
| **Micro Caption** | 10px / 14px (`text-[10px]`) | Medium (500) | Monospace | Line numbers (`01`, `02`), gutter markers |

---

## 5. Spacing, Elevation & Layout Rhythms

### 4px Baseline Spacing Grid
- `xs` (4px): Tight element offsets, icon-to-text spacing
- `sm` (8px): Chip padding, compact list gaps
- `md` (16px): Card internal padding, form input spacing
- `lg` (24px): Grid gaps, section vertical margins
- `xl` (32px / 40px): Page container padding

### Border Radii
- `4px` (`rounded`): Text inputs, compact buttons, code tokens
- `8px` (`rounded-lg`): Action cards, candidate containers, alert banners
- `12px` (`rounded-xl`): Main workstation cards, modal dialogs
- `9999px` (`rounded-full`): Status pills, avatar circles, filter chips

### Elevation & Depth
- **Level 0 (Canvas):** Flat `#F8FAFC`
- **Level 1 (Cards & Sidebars):** `#FFFFFF` with 1px border `#E2E8F0` and `shadow-xs` (`0 1px 2px 0 rgb(0 0 0 / 0.05)`)
- **Level 2 (Modals & Drawers):** `#FFFFFF` with 1px border `#E2E8F0` and `shadow-lg` (`0 10px 15px -3px rgb(0 0 0 / 0.1)`), paired with `backdrop-blur-sm` overlay (`bg-slate-900/30`)

### Table Layout & Overflow Containment Rules
- **Local Horizontal Scrolling:** Wide clinical data tables (Queues, Audits, Directories, Medication tables) must be wrapped in a local scrolling container with `overflow-x-auto`.
- **Page Overflow Containment:** The page container and main workstation shell must strictly enforce `overflow-x-hidden`. Under no circumstances may a table cause page-level horizontal window scrolling.
- **No Compression of Clinical Columns:** Do not shrink typography sizes or arbitrarily truncate clinical columns (drug names, frequencies, dosage forms) merely to prevent horizontal scrolling.
- **Accessible Touch & Action Targets:** Preserve minimum 44px touch targets, comfortable row padding (`py-4`), and visible, un-truncated action controls (`Review →`, `View →`, `Details`).

---

## 6. Global App Shell & Navigation

The approved workstation global shell establishes the universal framing for all application routes:

### 1. Global Navigation Hierarchy (`AppSidebar.tsx`)
The left sidebar (`w-60` / `280px`, `#FFFFFF` surface, `border-r border-slate-200`) enforces the exact canonical 6-item navigation hierarchy in this strict order:

1. **`Home`** (`home` icon) → `/`
2. **`Patients`** (`person` icon) → `/patients`
3. **`Prescriptions`** (`description` icon) → `/prescriptions`
4. **`Reminders`** (`notifications` icon) → `/reminders`
5. **`Reports`** (`bar_chart` icon) → `/reports` (or `/audit`)
6. **`Staff`** (`group` icon) → `/staff`

- **Branding Header:** `PrescriptionSetu` wordmark paired with purple rounded-square medical/document mark (`#4A40C1`), and subtitle `"CLINICAL PORTAL"`.
- **Active Navigation Treatment:** Active route receives brand indigo tint (`bg-brand-50 text-brand-600`), 4px right border accent (`border-r-4 border-primary`), and `aria-current="page"`.
- **Footer Placement:** `Logout` action link (`logout` icon) anchored at the bottom of the sidebar.

### 2. Global Top Header (`AppHeader.tsx`)
- Sticky top navigation bar (`h-16`, `bg-white/80 backdrop-blur-md border-b border-slate-200`).
- **Universal Patient Search:** Centered pill input (`Search patients, prescriptions, or patient ID...` with `⌘K` keyboard cue).
- **Safety Gate Indicator Pill:** Prominent **`SI-01 Gate Active`** emerald indicator (`bg-emerald-50 text-emerald-700 border border-emerald-200` with `verified_user` icon).
- **Notifications Button:** Subtle icon button with unread alert dot.
- **Clinical Verifier Profile:** Dr. Shinde avatar badge (`DS` circle badge), user name, and `"Clinical Verifier"` caption.

---

## 7. Route-Specific Workstation Specifications

### 1. Clinical Operations Dashboard (`/`) — Screen `5a4c302972674e40b5049c80ca70c653`
- **Purpose:** Central operational overview for clinical verifiers and supervisors.
- **Composition:**
  - KPI Stat Cards: Total Prescriptions, Verification Queue Backlog, Adherence Rate, Active Reminders.
  - Urgent Action Banner: Prominent callout when unreviewed high-priority prescriptions are pending.
  - Priority Queue Table: High-density preview table linking directly to pending verification items.
  - Clinician Activity & Staff Status overview.

### 2. Prescription Verification Queue (`/prescriptions`) — Screen `b216bbdea9a9407b8fbd4f94102ec847`
- **Purpose:** Triage and processing queue for uploaded prescription scans.
- **Composition:**
  - Status Filter Tabs: All, Needs Review, Verified, Blocked/Rejected.
  - 7-Column Data Table: Prescription ID, Patient, Date Uploaded, Extracted Medications, OCR Confidence Chip, Priority / Triage State, Action (`Review →`).
  - Strict local horizontal scroll containment (`overflow-x-auto`).

### 3. Clinical Verification Workstation (`/prescriptions/[id]`) — Screen `016910254af04e318210123ed64735f1`
- **Purpose:** Core safety workstation where clinical verifiers examine OCR crops, review parsed candidates, and confirm regimens.
- **Composition:**
  - **Five-Step Workflow Tracker:** `Upload → OCR → Parse → [Review] → Activate`.
  - **Left Pane:** High-resolution prescription image crop viewer with bounding-box overlays and zoom/pan controls.
  - **Right Pane:** Candidate verification cards (`CandidateCard.tsx`) displaying extracted drug name, plain-language expanded frequency, timing relation, shorthand provenance (`FREQ-BD-001`), and `Confirm` / `Correct` / `Reject` buttons.
  - **SI-01 Gate Status Bar (`GateStatusBar.tsx`):** Pinned progress bar (*"2 of 3 medications verified"*). Activation CTA remains structurally disabled until 100% of candidates are confirmed/corrected.
  - **Correction Modal (`CorrectionModal.tsx`):** Authoritative modal pattern (`ade351718e724c9c81a6e702db76a888`) with dose amount stepper, frequency chips (`OD`, `BD`, `TDS`, `QID`, `HS`), timing relations, and **mandatory text input for justification reason** (required by `SI-14`).

### 4. Patient Directory Workstation (`/patients`) — Screen `1594a304ce564d859ebcd711f0f4a204`
- **Purpose:** Roster of enrolled patients and active medication regimens.
- **Composition:**
  - Header: Search input (`Search patients...`) and `+ New Patient` primary CTA.
  - "Needs Attention" Triage Grid: 2-column alert cards for dosage conflicts (rose border) and pending prescription reviews (amber border).
  - 7-Column Patient Directory Table: Patient, Patient ID, Active Medications, Verification State, Adherence Percentage, Last Activity, Action (`View →` persistently visible).

### 5. Patient Detail Workstation (`/patients/[id]`) — Screen `e9bbea4ddbd943a688568118d8e68d1c`
- **Purpose:** Comprehensive clinical profile for an individual patient.
- **Composition:**
  - Breadcrumb: `← Back to Patients`.
  - Patient Summary Header: Name, `Verification: Awaiting Review` status pill, monospace demographic metadata (`PT-84729` • `Male` • `68 yrs` • `RX-84920`).
  - Action Banner: `Verification Required` with amber left accent border and `Review Prescription →` CTA.
  - Left Column (8 cols): Current Medications table (clearly distinguishing unverified ambiguous drugs from confirmed regimens) and Documents & Records category tiles.
  - Right Column (4 cols): Patient Context (status, diagnosis, allergy chips), Adherence gauge (86% circular progress ring), and Recent Activity vertical timeline.

### 6. Medication Reminders Workstation (`/reminders`) — Screen `38e869472d1d4abb8f7e10f24d95fb7b`
- **Purpose:** Schedule and monitoring workstation for automated patient reminders.
- **Composition:**
  - Time-of-day grouped reminder cards: Morning (`सकाळ`), Afternoon (`दुपार`), Evening (`संध्याकाळ`), Bedtime (`रात्र`).
  - Marathi WhatsApp message preview bubble rendering localized drug instructions and audio play button.
  - Recipient phone verification badge and adherence acknowledgment toggles.

### 7. Clinical Audit Workstation (`/audit`) — Screen `064280f7673e4be4a21370a31f968915`
- **Purpose:** Regulatory audit trail and DPDP compliance logging.
- **Composition:**
  - Append-only log table: Timestamp, Event Type, Actor ID, Prescription ID, Justification Reason, Integrity Hash.
  - Filter drawer for inspecting raw cryptographic signatures and provenance chains without polluting primary views.

### 8. Staff & Clinicians (`/staff`) — Synthesized Route
- **Purpose:** Clinician directory and verifier role management.
- **Composition:**
  - Synthesized using the canonical global workstation shell (`AppHeader` + `AppSidebar`) and Light Health-Tech tokens.
  - Clinician profile cards, active verifier status badges, and verification throughput metrics.

---

## 8. Safety Invariants & Clinical Non-Inference Rules

1. **Invariant SI-01 Overrides Everything:**  
   No dosage, frequency, or timing instruction may reach a patient without explicit human confirmation first. This gate is enforced by code guard clauses, not UI styling.
2. **Visual Mock Fixture Data Only:**  
   All patient names (Ganpatrao More, Savitri Patil, Vikram Kadam), medication dosages (Metformin 500mg, Telmisartan 40mg), adherence percentages, and clinical alerts presented in Stitch screens are **visual fixtures only**.
3. **No Clinical or Parser Inference:**  
   Frontend engineers and AI agents must NOT infer new clinical rules, OCR confidence thresholds, parser AST structures, API contracts, or database schemas from Stitch screens. All backend contracts remain strictly governed by `docs/SCHEMA.md`, `docs/API_CONTRACTS.md`, and `SAFETY_INVARIANTS.md`.
