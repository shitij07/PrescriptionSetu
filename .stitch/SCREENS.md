# Stitch Screen Catalog & Route Registry (`.stitch/SCREENS.md`)

> **Primary Canonical Production Registry:** Stitch `projects/12099988010162769768` (*PrescriptionSetu — Canonical Workstation*) — **SOLE CANONICAL PRODUCTION DESIGN AUTHORITY**  
> **Canonical Design System Asset:** `assets/14883456124291103363` (*PrescriptionSetu Light Health-Tech D-034*)  
> **Historical Archive Registry:** Stitch `projects/7482253828292669249` (*PrescriptionSetu Dashboard*) — **HISTORICAL ARCHIVE ONLY (READ-ONLY)**  
> **Visual Alignment:** Light Health-Tech Direction ([`docs/DECISIONS.md` D-034](file:///c:/Users/thopa/PerscriptionSetu/docs/DECISIONS.md#L882-L913))  
> **Last Verified & Audited:** 2026-09-05

---

## 1. Executive Summary & Registry Status Classifications

This document establishes the official mapping between remote Stitch design prototypes and the Next.js frontend application in [`apps/dashboard`](file:///c:/Users/thopa/PerscriptionSetu/apps/dashboard).

### Status Classifications
Every screen discovered across both the canonical and archive projects is assigned a rigorous status:
- **`CANONICAL PRODUCTION`**: The authoritative visual and structural reference for an active product route in `projects/12099988010162769768`.
- **`HISTORICAL REFERENCE`**: An approved prototype from the original project (`projects/7482253828292669249`) preserved exclusively for design provenance and historical context.
- **`SUPPORTING`**: A validated secondary state (e.g. pending review, activation-ready, modal dialog, or asset preview) belonging to a canonical route.
- **`SYNTHESIZED`**: A route implemented using the shared global workstation shell and D-034 design tokens where no standalone page design exists in Stitch (e.g. `/staff`).
- **`SUPERSEDED`**: An earlier canvas generation in the canonical project that has been replaced by a refined version.
- **`REJECTED`**: An obsolete, dark-mode, abandoned, or visually rejected screen that must never be implemented.

---

## 2. Canonical Product Route Mapping (Production Authority)

The application defines 8 primary routes. All active routes map to the **Canonical Production Project (`projects/12099988010162769768`)**:

| Product Route | Canonical Production Screen ID (`12099988010162769768`) | Screen Title on Canvas | Historical Reference ID (`7482253828292669249`) | Implementation Status |
|---|---|---|---|---|
| **`/`** | `5a4c302972674e40b5049c80ca70c653` | *Clinical Operations Dashboard* | `14d4344b8b2f4d9aab771c69c743faf9` | **CANONICAL PRODUCTION** |
| **`/prescriptions`** | `b216bbdea9a9407b8fbd4f94102ec847` | *Prescription Verification Queue* | `58d1f59cb555402985372740d031afdd` | **CANONICAL PRODUCTION** |
| **`/prescriptions/[id]`** | `016910254af04e318210123ed64735f1` | *Clinical Verification Workstation* | `3c4ecaa20c8440e99b87d01810d200f5` | **CANONICAL PRODUCTION** |
| **`/patients`** | `1594a304ce564d859ebcd711f0f4a204` | *Refined Patient Directory Workstation* | `0146bd5884df4e4a89d6648feaf04f3c` | **CANONICAL PRODUCTION** |
| **`/patients/[id]`** | `e9bbea4ddbd943a688568118d8e68d1c` | *Patient Detail Workstation — Ganpatrao More* | `9de2d7f0d4e248eebfa0f6d07ba49f55` | **CANONICAL PRODUCTION** |
| **`/reminders`** | `38e869472d1d4abb8f7e10f24d95fb7b` | *Medication Reminders Workstation* | `fdf9eb8cdbaf4a7bacd1c1e326e545ad` | **CANONICAL PRODUCTION** |
| **`/audit`** | `064280f7673e4be4a21370a31f968915` | *Clinical Audit Workstation* | `763c64eacc9b442d876f42c74f078f0c` | **CANONICAL PRODUCTION** |
| **`/staff`** | *(None — No Dedicated Stitch Screen)* | *(Synthesized in Next.js)* | `cfa92fa0dc7848a7be4f9d140a3cec64` (Headshot) | **SYNTHESIZED** |

### Explicit Implementation Architecture for `/staff`
> [!IMPORTANT]
> **There is NO dedicated standalone Stitch screen for `/staff` in either project.**  
> The screen `cfa92fa0dc7848a7be4f9d140a3cec64` in the archive is a standalone studio headshot asset.  
> The `/staff` route is synthesized in Next.js using the global workstation shell ([`AppHeader`](file:///c:/Users/thopa/PerscriptionSetu/apps/dashboard/src/components/layout/AppHeader.tsx), [`AppSidebar`](file:///c:/Users/thopa/PerscriptionSetu/apps/dashboard/src/components/layout/AppSidebar.tsx)), the canonical 6-item navigation hierarchy, and the staff table components established in the operations dashboard (`5a4c3029`).

---

## 3. Canonical Project: Superseded & Rejected Screen Registry

The following non-canonical entities exist on the canvas of `projects/12099988010162769768` and must not be used as visual authorities:

| Screen ID | Title on Canvas | Status | Superseded By | Reason & Technical Context |
|---|---|---|---|---|
| `9830f565cb6d4c79a67281f3c0125728` | *Patient Directory Workstation* | **REJECTED / SUPERSEDED** | `1594a304ce564d859ebcd711f0f4a204` | Rejected initial pilot attempt. Failed visual review due to missing triage cards and divergent composition. |
| `7494e94dcce34129b802c06a8bd0fc21` | *Prescription Verification Queue* | **SUPERSEDED** | `b216bbdea9a9407b8fbd4f94102ec847` | Early queue iteration (hidden on canvas). Superseded by refined queue `b216bbde`. |
| `5fa7d3769b98424389aaa211754189ab` | *Clinical Operations Dashboard* | **SUPERSEDED** | `5a4c302972674e40b5049c80ca70c653` | Early canvas draft (hidden: true). Replaced by `5a4c3029`. |
| `cfb1b4165dd943fe99208b898419b56b` | *Clinical Audit Workstation* | **SUPERSEDED** | `064280f7673e4be4a21370a31f968915` | Early canvas draft (hidden: true). Replaced by `064280f7`. |
| `ea74b04cb4dd45108f6e528b5617d782` | *Medication Reminders Workstation* | **SUPERSEDED** | `38e869472d1d4abb8f7e10f24d95fb7b` | Early canvas draft (hidden: true). Replaced by `38e86947`. |
| `5442814439272009145` | *Patient Detail Workstation Draft* | **SUPERSEDED** | `e9bbea4ddbd943a688568118d8e68d1c` | Intermediate canvas instance (hidden: true). Replaced by `e9bbea4d`. |

---

## 4. Supporting States, Modals & Design Assets

| Route | State / Interaction | Screen / Asset ID | Project Origin | Screen Title | Status | Technical Role |
|---|---|---|---|---|---|---|
| `/prescriptions/[id]` | `correction_modal` | `ade351718e724c9c81a6e702db76a888` | Archive (`74822538`) | *Final Polished Medication Correction Workspace* | **CANONICAL MODAL** | Authoritative frequency/timing/dose correction modal with mandatory justification input (`SI-14`). |
| `/prescriptions/[id]` | `document_crop` | `26e352896bc14ed2885e17f8f6314f4e` | Canonical (`12099988`) | *Clinical document crop preview* | **SUPPORTING ASSET** | Visual preview fixture showing simulated handwritten Rx slip with bounding boxes. |
| Global | `theme_asset` | `assets/14883456124291103363` | Canonical (`12099988`) | *PrescriptionSetu Light Health-Tech (D-034)* | **DESIGN SYSTEM** | Core tokens, colors, typography, and spacing scale definitions. |
| Global | `logo_asset` | `123fa926b0bc401081037a9e38c26950` | Archive (`74822538`) | *PrescriptionSetu Clinical Logo* | **SUPPORTING ASSET** | Square clinical brand mark icon. |

---

## 5. Historical Archive Catalog (`projects/7482253828292669249`)

The historical prototype library contains 43 screens and 4 canvas asset instances preserved strictly for design provenance. **This project is READ-ONLY.**

| # | Screen ID | Stitch Title | Dimensions | Primary Category | Proposed Route | Canonical Status | Technical Provenance Rationale |
|---|---|---|---|---|---|---|---|
| 1 | `096f90d086af4960bac77d32470614d1` | PrescriptionSetu Caregiver Dashboard | 2560x283 | EXPLORATION / REJECTED | `/` | **REJECTED** | Incomplete dark header banner stub. Obsoleted by full dashboard. |
| 2 | `9de2d7f0d4e248eebfa0f6d07ba49f55` | PrescriptionSetu — Final Polished Patient Detail: Ganpatrao More | 2560x2820 | CANONICAL PAGE | `/patients/[id]` | **HISTORICAL REFERENCE** | Historical authority for patient profile; recreated as `e9bbea4d`. |
| 3 | `d2c96b731a9c4eadb7108c765ada88ca` | PrescriptionSetu — Medication Correction Workspace | 2560x2176 | VARIANT / ALTERNATIVE | `/prescriptions/[id]` | **HISTORICAL CANDIDATE** | Alternative correction card layout using large pill chips. |
| 4 | `fdf9eb8cdbaf4a7bacd1c1e326e545ad` | PrescriptionSetu — Refined Medication Reminders Workstation | 2560x2234 | CANONICAL PAGE | `/reminders` | **HISTORICAL REFERENCE** | Historical authority for reminders; recreated as `38e86947`. |
| 5 | `cfa92fa0dc7848a7be4f9d140a3cec64` | Professional studio headshot of Dr. Sarah Wilson... | 1024x1024 | COMPONENT / PATTERN | `/staff` | **SUPPORTING ASSET** | High-resolution staff headshot used in clinician cards. |
| 6 | `58d1f59cb555402985372740d031afdd` | PrescriptionSetu — Refined Prescription Queue | 2560x2272 | CANONICAL PAGE | `/prescriptions` | **HISTORICAL REFERENCE** | Historical authority for queue; refined as `b216bbde`. |
| 7 | `60c6290a7a8c451b96c0eebbc57bdf52` | Clinical Verification Workstation - Variant A | 2560x2176 | VARIANT / ALTERNATIVE | `/prescriptions/[id]` | **HISTORICAL CANDIDATE** | Earlier Light workstation variant with floating zoom controls. |
| 8 | `0146bd5884df4e4a89d6648feaf04f3c` | PrescriptionSetu — Refined Patient Directory Workstation | 2560x2378 | CANONICAL PAGE | `/patients` | **HISTORICAL REFERENCE** | Historical authority for patient roster; recreated as `1594a304`. |
| 9 | `3c4ecaa20c8440e99b87d01810d200f5` | PrescriptionSetu — Refined Verification Workstation | 2560x2112 | CANONICAL PAGE | `/prescriptions/[id]` | **HISTORICAL REFERENCE** | Historical authority for workstation; recreated as `01691025`. |
| 10 | `3fb45e7926ed4ef4a6c66bcf922fa491` | EXP-03 — Home Dashboard — Human-Centric | 2560x2718 | VARIANT / ALTERNATIVE | `/` | **HISTORICAL CANDIDATE** | Human-centric overview alternative with expanded patient activity cards. |
| 11 | `88a5c5efac9845bc992d8feb012c1d70` | PrescriptionSetu — Refined Patient Detail: Ganpatrao More | 2560x2048 | VARIANT / ALTERNATIVE | `/patients/[id]` | **HISTORICAL CANDIDATE** | Compact 2048px version of patient profile without expanded history logs. |
| 12 | `61a6346b8bfe455d8093b8e214356642` | PrescriptionSetu - Verification Workstation (Variant B) | 2560x2048 | VARIANT / ALTERNATIVE | `/prescriptions/[id]` | **HISTORICAL CANDIDATE** | Variant B review workstation with bulk confirmation shortcuts. |
| 13 | `27dbfac6fe2a4840bacf4f19293bc4ce` | Verification Workstation - Ready to Activate | 2560x2194 | PAGE STATE | `/prescriptions/[id]` | **SUPPORTING** | Unlocked state where all candidates are confirmed; activation CTA enabled. |
| 14 | `b84f9ba220584e02b25dc21697ad1a5a` | PrescriptionSetu — Refined Patient Directory | 2560x2208 | VARIANT / ALTERNATIVE | `/patients` | **HISTORICAL CANDIDATE** | Full-width data table directory without the side preview card. |
| 15 | `3d309ea784774ae5abf55f6df2d9383c` | PrescriptionSetu - Verification Workstation (Variant B) | 2560x2048 | VARIANT / ALTERNATIVE | `/prescriptions/[id]` | **HISTORICAL CANDIDATE** | Alternate layout of Variant B with keyboard shortcut badges. |
| 16 | `d5d2c9f6e6a7478bb11ae1e12f7b7491` | Clinical Correction Flow | 2560x2194 | MODAL / DIALOG | `/prescriptions/[id]` | **SUPPORTING** | Dedicated overlay dialog with frequency radio grid and dose stepper. |
| 17 | `419ad1009add49c9acfa929522bcacbb` | EXP-03 — Home Dashboard — Minimalist Utility | 2560x2486 | VARIANT / ALTERNATIVE | `/` | **HISTORICAL CANDIDATE** | Dense operational metrics dashboard emphasizing throughput KPIs. |
| 18 | `5ba0018c55da4365a84f152cf024f8d9` | EXP-03 — Home Dashboard — Operational Focus | 2560x2782 | VARIANT / ALTERNATIVE | `/` | **HISTORICAL CANDIDATE** | Dashboard prioritizing immediate pending verification queue items. |
| 19 | `052e89a81ac74e68a4a9ed69fe04945b` | Clinical Medication Correction Modal | 2560x2048 | VARIANT / ALTERNATIVE | `/prescriptions/[id]` | **REJECTED** | Early dark-mode correction modal. Obsoleted by light-mode D-034 alignment. |
| 20 | `f9796561901e48f7b19a10e3a48049c8` | PrescriptionSetu — Patient Directory | 2560x2208 | VARIANT / ALTERNATIVE | `/patients` | **HISTORICAL CANDIDATE** | Light patient table; nearly identical to `b84f9ba2` with minor filter spacing diffs. |
| 21 | `ddf43095b7f04272b631295be5f38177` | PrescriptionSetu - Evidence Workbench (Variant C) | 2560x2176 | VARIANT / ALTERNATIVE | `/prescriptions/[id]` | **HISTORICAL CANDIDATE** | Three-pane workbench with explicit tree provenance panel. |
| 22 | `f61c666b812c42fab81b6f3c5eb3bf84` | PrescriptionSetu - Evidence Workbench (Variant C) | 2560x2048 | VARIANT / ALTERNATIVE | `/prescriptions/[id]` | **REJECTED** | Dark version of Variant C evidence workbench. |
| 23 | `123fa926b0bc401081037a9e38c26950` | PrescriptionSetu Clinical Logo | 1024x1024 | COMPONENT / PATTERN | Global | **SUPPORTING ASSET** | Square clinical brand mark with prescription cross. |
| 24 | `14d4344b8b2f4d9aab771c69c743faf9` | PrescriptionSetu — Clinical Operations Dashboard | 2560x2084 | CANONICAL PAGE | `/` | **HISTORICAL REFERENCE** | Historical authority for dashboard; refined as `5a4c3029`. |
| 25 | `c41771669f404e4db1d75f46f870f47d` | PrescriptionSetu — Refined Patient Detail: Ganpatrao More | 2560x2952 | VARIANT / ALTERNATIVE | `/patients/[id]` | **HISTORICAL CANDIDATE** | Extended patient profile with expanded historical compliance timeline. |
| 26 | `9372f0e873904f3fa90b0e3e6ec23548` | PrescriptionSetu — Simplified Clinical Audit | 2560x2048 | VARIANT / ALTERNATIVE | `/audit` | **SUPPORTING** | Compact audit view focusing strictly on RX-84920 details in a modal drawer. |
| 27 | `e206ee40da9f44338e3c75d96a76a46c` | PrescriptionSetu Logo | 1024x1024 | COMPONENT / PATTERN | Global | **SUPPORTING ASSET** | Alternative horizontal logo lockup icon. |
| 28 | `9160583acea54dc096ea4ba68ee4ba01` | Caregiver Verification Workstation | 2560x2048 | EXPLORATION / REJECTED | `/prescriptions/[id]` | **REJECTED** | Initial dark workstation exploration. Superseded by light workstation. |
| 29 | `728b66af5fa24434a28cdffb542be17e` | PrescriptionSetu — Operations Dashboard | 2560x2432 | EXPLORATION / REJECTED | `/` | **REJECTED** | Early dark operations dashboard exploration. |
| 30 | `7d8b4604dc0f44dba19032fbfd673dd2` | Clinical Verification Workstation - Variant A | 2560x2048 | VARIANT / ALTERNATIVE | `/prescriptions/[id]` | **HISTORICAL CANDIDATE** | Duplicate canvas instance of Variant A workstation. |
| 31 | `763c64eacc9b442d876f42c74f078f0c` | PrescriptionSetu — Clinical Audit Workstation | 2560x2256 | CANONICAL PAGE | `/audit` | **HISTORICAL REFERENCE** | Historical authority for audit; refined as `064280f7`. |
| 32 | `5f5eef33efa04467a295ed4099494640` | PrescriptionSetu — Premium Operations Workspace | 2560x2240 | EXPLORATION / REJECTED | `/` | **REJECTED** | Dark operations workspace variant with amber alert badges. |
| 33 | `5f7fc62842bc4a8d961b9a1f50f802f3` | Verification Workstation - Pending Review | 2560x2194 | PAGE STATE | `/prescriptions/[id]` | **SUPPORTING** | Initial unreviewed state (all candidates unconfirmed; gate strictly locked). |
| 34 | `a5ea6957896a47c192eb1d03fbe819c5` | PrescriptionSetu — Prescription Queue | 2560x2272 | VARIANT / ALTERNATIVE | `/prescriptions` | **HISTORICAL CANDIDATE** | Earlier queue iteration; superseded by refined version `58d1f59c`. |
| 35 | `ae80cc7e49014c5d8922239ab93569bb` | PrescriptionSetu — Patient Detail: Ganpatrao More | 2560x2884 | VARIANT / ALTERNATIVE | `/patients/[id]` | **HISTORICAL CANDIDATE** | Intermediate patient profile version before final DPDP polish. |
| 36 | `be6f09bd9ad945e097b524180f4d7f28` | PrescriptionSetu — Refined Medication Correction Workspace | 2560x2048 | VARIANT / ALTERNATIVE | `/prescriptions/[id]` | **HISTORICAL CANDIDATE** | Refined correction workspace immediately preceding `ade35171`. |
| 37 | `b04afb6de74a459d9fb540bbefa8298f` | PrescriptionSetu Logo | 1024x1024 | COMPONENT / PATTERN | Global | **SUPPORTING ASSET** | Square icon brand mark variant. |
| 38 | `4cadb3ede8a74e588f6e9027d93b8ac5` | Clinical Medication Correction Workspace | 2560x2176 | VARIANT / ALTERNATIVE | `/prescriptions/[id]` | **HISTORICAL CANDIDATE** | In-context correction view with inline timing anchor selection. |
| 39 | `9951c3ab5a8d4785b14ee9f6108d35d0` | PrescriptionSetu — Medication Reminders Workstation | 2560x2336 | VARIANT / ALTERNATIVE | `/reminders` | **HISTORICAL CANDIDATE** | Early reminders workstation before final time-of-day groupings landed. |
| 40 | `689c58681d4c405daf3becde856b485f` | Clinical Medication Correction Workspace - Corrected View | 2560x2048 | PAGE STATE | `/prescriptions/[id]` | **SUPPORTING** | Shows a candidate card updated to `corrected` with visual badge and reason. |
| 41 | `fbf83e35a5244568bf94549f0fecbecb` | PrescriptionSetu — Optimized Patient Directory | 2560x2398 | VARIANT / ALTERNATIVE | `/patients` | **HISTORICAL CANDIDATE** | Highly optimized patient roster with quick-filter pills and search cues. |
| 42 | `ade351718e724c9c81a6e702db76a888` | PrescriptionSetu — Final Polished Medication Correction Workspace | 2560x2560 | MODAL / DIALOG | `/prescriptions/[id]` | **CANONICAL MODAL** | Authoritative modal for frequency/timing/dose correction with mandatory reason. |
| 43 | `af5eed1bcb1e46bc9ae26b5caa80977f` | EXP-03 — Light Premium — Home Dashboard A | 2560x2384 | EXPLORATION / REJECTED | `/` | **REJECTED** | Hidden on canvas (`hidden: true`). Experimental light home layout. |
