# CORPUS.md — Synthetic Prescription Benchmark Dataset

**Corpus Version:** `1.0.0`  
**Dataset Size:** 28 Synthetic Printed Prescriptions  
**Authority:** `BUILD_ORDER.md` §2.1, `PercriptionSetuMASTERPLAN.md` §18.2, §26, `SAFETY_INVARIANTS.md`  
**Last Updated:** 2026-08-30  

---

## 1. Provenance and Privacy Statement

> **STRICT SYNTHETIC-ONLY GUARANTEE:**
> Every sample in this dataset is **100% self-authored and synthetic**.
> - **Zero real patient health information (PHI)** or personally identifiable information (PII) is included.
> - **Zero real prescription scans or photographs** from living or deceased patients were used.
> - Doctor names, clinic names, registration numbers, patient identifiers, and phone numbers are purely fictional.
> - The samples are formatted to mirror realistic Indian outpatient department (OPD) prescription slips with standard clinical shorthand patterns.

---

## 2. Dataset Overview and Group Taxonomy

The 28 samples are organized into four functional evaluation cohorts:

| Group | Range | Focus & Characteristics |
|---|---|---|
| **Group 1: Standard Single-Medication** | `SYN-01` to `SYN-08` | High-frequency single medication prescriptions with standard frequencies (OD, BD, TDS, QID), anchors (HS, ac, pc), and single/conditional doses (SOS, stat). |
| **Group 2: Multi-Medication Regimens** | `SYN-09` to `SYN-16` | Realistic 2-line and 3-line chronic regimens (diabetes, hypertension, cardiac care, antibiotic combinations) testing multi-line segmentation and combined scheduling. |
| **Group 3: Special Units & Formats** | `SYN-17` to `SYN-22` | Fractional tablet doses (`1/2`, `½`), volume doses (`5ml`, `10mL`), continuous lifelong therapy, and bare durations. |
| **Group 4: Adversarial & Safety Boundaries** | `SYN-23` to `SYN-28` | Multi-match contradictions, token boundary defense, missing dose amounts, non-medication text, corrupted OCR tokens, and partial rejection gate blocking. |

---

## 3. Detailed Catalog of Synthetic Samples

### Group 1: Standard Single-Medication Prescriptions

#### `SYN-01` — Standard Metformin Twice Daily
- **Raw Text:** `Tab Metformin 500mg 1 tab BD`
- **Clinical Scenario:** Type-2 diabetes maintenance.
- **Rules Exercised:** `FREQ-BD-001`, `STR-MASS-001`, `AMT-TAB-001`
- **Expected Candidates:** 1 (`frequency_code: 'TWICE_DAILY'`, `times_per_day: 2`, `dose_amount: 1`, `dose_unit: 'tablet'`, `strength: 500mg`)
- **Gate Outcome:** Transitions to `verified` upon caregiver confirmation; generates 2 daily reminders (08:00, 20:00).

#### `SYN-02` — Amoxicillin Thrice Daily with Day Duration
- **Raw Text:** `Tab Amoxicillin 500 mg 1 tab TDS x 7 days`
- **Clinical Scenario:** Acute bacterial infection course.
- **Rules Exercised:** `FREQ-TDS-001`, `STR-MASS-001`, `AMT-TAB-001`, `DUR-DAYS-001`
- **Expected Candidates:** 1 (`frequency_code: 'THRICE_DAILY'`, `times_per_day: 3`, `duration: 7 days`)
- **Gate Outcome:** Verified; generates 3 daily reminders for 7 days (21 total reminders).

#### `SYN-03` — Telmisartan Once Daily After Meal
- **Raw Text:** `Tab Telmisartan 40mg 1 tab OD pc`
- **Clinical Scenario:** Hypertension management.
- **Rules Exercised:** `FREQ-OD-001`, `STR-MASS-001`, `AMT-TAB-001`, `TIME-PC-001`
- **Expected Candidates:** 1 (`frequency_code: 'ONCE_DAILY'`, `timing_anchors: ['AFTER_MEAL']`)
- **Gate Outcome:** Verified; generates 1 daily post-breakfast reminder (08:00).

#### `SYN-04` — Clonazepam Bedtime Dose
- **Raw Text:** `Tab Clonazepam 0.5mg 1 tab HS`
- **Clinical Scenario:** Nocturnal anxiety/insomnia.
- **Rules Exercised:** `ANCH-HS-001`, `STR-MASS-001`, `AMT-TAB-001`
- **Expected Candidates:** 1 (`timing_anchors: ['BEDTIME']`)
- **Gate Outcome:** Verified; generates 1 daily bedtime reminder (22:00).

#### `SYN-05` — Pantoprazole Before Food
- **Raw Text:** `Tab Pantoprazole 40mg 1 tab OD ac`
- **Clinical Scenario:** Acid reflux/GERD.
- **Rules Exercised:** `FREQ-OD-001`, `STR-MASS-001`, `AMT-TAB-001`, `TIME-AC-001`
- **Expected Candidates:** 1 (`frequency_code: 'ONCE_DAILY'`, `timing_anchors: ['BEFORE_MEAL']`)
- **Gate Outcome:** Verified; generates 1 daily pre-breakfast reminder (08:00).

#### `SYN-06` — Paracetamol As-Needed (SOS)
- **Raw Text:** `Tab Paracetamol 650mg 1 tab SOS`
- **Clinical Scenario:** Fever/pain relief as needed.
- **Rules Exercised:** `COND-SOS-001`, `STR-MASS-001`, `AMT-TAB-001`
- **Expected Candidates:** 1 (`as_needed: true`, `schedule_derivable: false`)
- **Gate Outcome:** Verified; zero recurring reminders generated per SI-09.

#### `SYN-07` — Paracetamol Immediate Single Dose (STAT)
- **Raw Text:** `Tab Paracetamol 500mg 1 tab stat`
- **Clinical Scenario:** Immediate single emergency dose.
- **Rules Exercised:** `DOSE-STAT-001`, `STR-MASS-001`, `AMT-TAB-001`
- **Expected Candidates:** 1 (`total_doses: 1`, `immediate: true`, `recurring: false`, `schedule_derivable: false`)
- **Gate Outcome:** Verified; zero recurring reminders generated per SI-09.

#### `SYN-08` — Promethazine Syrup Four Times Daily
- **Raw Text:** `Syr Promethazine 5ml QID x 3 days`
- **Clinical Scenario:** Severe allergy syrup.
- **Rules Exercised:** `FREQ-QID-001`, `AMT-VOL-001`, `DUR-DAYS-001`
- **Expected Candidates:** 1 (`frequency_code: 'FOUR_TIMES_DAILY'`, `times_per_day: 4`, `dose_amount: 5`, `dose_unit: 'ml'`, `duration: 3 days`)
- **Gate Outcome:** Verified; generates 4 daily reminders for 3 days (12 total reminders).

---

### Group 2: Multi-Medication Regimens

#### `SYN-09` — Diabetic Dual Regimen
- **Raw Text:** `Tab Metformin 500mg 1 tab BD\nTab Glimepiride 1mg 1 tab OD ac`
- **Clinical Scenario:** Dual oral antidiabetic therapy.
- **Rules Exercised:** Multi-line segmentation, `FREQ-BD-001`, `FREQ-OD-001`, `TIME-AC-001`
- **Expected Candidates:** 2 distinct candidates.
- **Gate Outcome:** Both confirmed $\rightarrow$ Verified; reminders scheduled for both medications.

#### `SYN-10` — Hypertension & Lipid Triple Regimen
- **Raw Text:** `Tab Telmisartan 40mg 1 tab OD\nTab Amlodipine 5mg 1 tab OD\nTab Rosuvastatin 10mg 1 tab HS`
- **Clinical Scenario:** Cardio-metabolic risk management.
- **Rules Exercised:** Multi-line segmentation, `FREQ-OD-001`, `ANCH-HS-001`, `STR-MASS-001`
- **Expected Candidates:** 3 distinct candidates.
- **Gate Outcome:** All 3 confirmed $\rightarrow$ Verified; schedules morning and bedtime reminders.

#### `SYN-11` — Antibiotic + Analgesic + PPI Combo
- **Raw Text:** `Tab Augmentin 625mg 1 tab BD x 5 days\nTab Paracetamol 650mg 1 tab SOS\nCap Omeprazole 20mg 1 cap OD ac`
- **Clinical Scenario:** Acute infection with gastric protection and SOS fever relief.
- **Rules Exercised:** `FREQ-BD-001`, `DUR-DAYS-001`, `COND-SOS-001`, `FREQ-OD-001`, `TIME-AC-001`
- **Expected Candidates:** 3 distinct candidates.
- **Gate Outcome:** Verified; recurring reminders generated for Augmentin and Omeprazole, PRN isolated.

#### `SYN-12` — Morning Thyroid & Calcium Split Regimen
- **Raw Text:** `Tab Thyronorm 50mcg 1 tab OD ac\nTab Calcium 500mg 1 tab OD pc`
- **Clinical Scenario:** Hypothyroidism and osteoporosis prevention.
- **Rules Exercised:** `FREQ-OD-001`, `STR-MASS-001`, `TIME-AC-001`, `TIME-PC-001`
- **Expected Candidates:** 2 distinct candidates.
- **Gate Outcome:** Verified; independent morning ac and pc reminders scheduled.

#### `SYN-13` — Ciprofloxacin Fortnight Course
- **Raw Text:** `Tab Ciprofloxacin 500mg 1 tab BD x 2 weeks`
- **Clinical Scenario:** Extended bacterial infection treatment.
- **Rules Exercised:** `FREQ-BD-001`, `STR-MASS-001`, `DUR-WEEKS-001`
- **Expected Candidates:** 1 candidate (`duration_value: 2`, `duration_unit: 'week'`).
- **Gate Outcome:** Verified; generates 2 daily reminders for 14 days (28 total reminders).

#### `SYN-14` — Azithromycin Slash Notation Duration
- **Raw Text:** `Tab Azithromycin 500mg 1 tab OD x 3/7`
- **Clinical Scenario:** Short-course macrolide antibiotic.
- **Rules Exercised:** `FREQ-OD-001`, `STR-MASS-001`, `DUR-DAYS-001` (slash notation `3/7`)
- **Expected Candidates:** 1 candidate (`duration_value: 3`, `duration_unit: 'day'`).
- **Gate Outcome:** Verified; generates 1 daily reminder for 3 days.

#### `SYN-15` — Post-MI Cardiac Triple Therapy
- **Raw Text:** `Tab Ecosprin 75mg 1 tab OD pc\nTab Clopidogrel 75mg 1 tab OD pc\nTab Atorvastatin 20mg 1 tab HS`
- **Clinical Scenario:** Dual antiplatelet and high-intensity statin therapy.
- **Rules Exercised:** Multi-line, `FREQ-OD-001`, `TIME-PC-001`, `ANCH-HS-001`
- **Expected Candidates:** 3 distinct candidates.
- **Gate Outcome:** Verified; morning pc and night reminders generated.

#### `SYN-16` — Dual Respiratory Therapy
- **Raw Text:** `Tab Levocetirizine 5mg 1 tab HS x 10 days\nSyr Ambroxol 10ml TDS`
- **Clinical Scenario:** Bronchial congestion with nighttime antihistamine.
- **Rules Exercised:** `ANCH-HS-001`, `DUR-DAYS-001`, `AMT-VOL-001`, `FREQ-TDS-001`
- **Expected Candidates:** 2 distinct candidates.
- **Gate Outcome:** Verified; night and TDS reminders scheduled.

---

### Group 3: Special Units & Formats

#### `SYN-17` — Fractional Tablet Dose (ASCII Slash)
- **Raw Text:** `Tab Thyroxine 12.5mcg 1/2 tab OD`
- **Clinical Scenario:** Micro-dosed thyroid hormone titration.
- **Rules Exercised:** `AMT-FRAC-001` (`1/2`), `STR-MASS-001`, `FREQ-OD-001`
- **Expected Candidates:** 1 candidate (`dose_amount: 0.5`, `dose_unit: 'tablet'`).
- **Gate Outcome:** Verified; 1 daily reminder formatted with 0.5 tablet dose.

#### `SYN-18` — Fractional Tablet Dose (Unicode Fraction)
- **Raw Text:** `Tab Clonazepam 0.25mg ½ tab HS`
- **Clinical Scenario:** Low-dose evening sedative taper.
- **Rules Exercised:** `AMT-FRAC-001` (`½`), `STR-MASS-001`, `ANCH-HS-001`
- **Expected Candidates:** 1 candidate (`dose_amount: 0.5`, `dose_unit: 'tablet'`).
- **Gate Outcome:** Verified; 1 bedtime reminder formatted with 0.5 tablet dose.

#### `SYN-19` — Continuous / Lifelong Medication
- **Raw Text:** `Tab Metformin 500mg 1 tab BD continue`
- **Clinical Scenario:** Lifelong chronic therapy.
- **Rules Exercised:** `DUR-CONTINUOUS-001`, `FREQ-BD-001`, `STR-MASS-001`
- **Expected Candidates:** 1 candidate (`verifier_action_required: true`, `candidate_readings: [indefinite, review]`).
- **Gate Outcome:** Requires caregiver review of continuous status; verified upon confirmation.

#### `SYN-20` — Bare Duration (Unit Absent)
- **Raw Text:** `Tab Multivitamin 1 tab OD x 10`
- **Clinical Scenario:** Nutritional supplement with ambiguous duration notation.
- **Rules Exercised:** `DUR-BARE-001` (`x 10`), `FREQ-OD-001`
- **Expected Candidates:** 1 candidate (`duration_value: null`, `verifier_action_required: true`, `candidate_readings: ['10 days', '10 weeks', '10 doses total']`).
- **Gate Outcome:** Verifier must select the authoritative duration unit before scheduling.

#### `SYN-21` — Millilitre Volume Dose
- **Raw Text:** `Syr CoughSyrup 10mL TDS x 5 days`
- **Clinical Scenario:** Pediatric/adult oral syrup.
- **Rules Exercised:** `AMT-VOL-001` (`10mL`), `FREQ-TDS-001`, `DUR-DAYS-001`
- **Expected Candidates:** 1 candidate (`dose_amount: 10`, `dose_unit: 'ml'`).
- **Gate Outcome:** Verified; 3 daily reminders for 5 days.

#### `SYN-22` — PRN Analgesic
- **Raw Text:** `Tab Ibuprofen 400mg 1 tab PRN`
- **Clinical Scenario:** Acute pain relief on demand.
- **Rules Exercised:** `COND-PRN-001`, `STR-MASS-001`, `AMT-TAB-001`
- **Expected Candidates:** 1 candidate (`as_needed: true`, `schedule_derivable: false`).
- **Gate Outcome:** Verified; zero recurring reminders generated.

---

### Group 4: Adversarial & Safety Boundaries

#### `SYN-23` — Multi-Match Contradiction (SI-13)
- **Raw Text:** `Tab Metformin 500mg 1 tab BD OD`
- **Clinical Scenario:** Prescribing contradiction where two incompatible frequencies appear on one line.
- **Rules Exercised:** `FREQ-BD-001` and `FREQ-OD-001` collision on single candidate.
- **Expected Outcome:** `frequency_code: null`, `candidate_readings: ['BD', 'OD']`, `verifier_action_required: true`.
- **Safety Enforcement:** Atomic verification gate strictly blocked until human resolves contradiction (**SI-13**).

#### `SYN-24` — Token Boundary Defense (SI-06)
- **Raw Text:** `Tab Atorvastatin 20mg 1 tab BD`
- **Clinical Scenario:** Substring trap where drug name `Atorvastatin` contains substring `statin`.
- **Rules Exercised:** Token boundary guard in `DOSE-STAT-001`.
- **Expected Outcome:** `DOSE-STAT-001` is ignored; correctly extracts `BD` (twice daily) without false STAT classification.

#### `SYN-25` — Missing Dose Amount
- **Raw Text:** `Tab UnknownDrug 500mg BD`
- **Clinical Scenario:** Prescriber wrote strength and frequency but omitted tablet count.
- **Rules Exercised:** `STR-MASS-001`, `FREQ-BD-001`.
- **Expected Outcome:** `dose_amount: null`, `verifier_action_required: true` (dictionary §9).
- **Safety Enforcement:** Requires human verifier to explicitly supply dose amount before verification.

#### `SYN-26` — Pure Non-Medication Clinical Header
- **Raw Text:** `Rx Consultation Only\nPatient Advised Bed Rest\nFollow up after blood test`
- **Clinical Scenario:** Non-prescription clinic slip / advice header.
- **Rules Exercised:** Multi-line segmentation.
- **Expected Outcome:** Zero medication candidates; unparsed lines captured in envelope-level `unparsed_fragments`.

#### `SYN-27` — Corrupted OCR Shorthand (SI-06)
- **Raw Text:** `Tab Amoxicillin 500mg 1 tab TDS\nTab CorruptedLine 500mg 8D`
- **Clinical Scenario:** OCR error converting `BD` into `8D`.
- **Rules Exercised:** `extractUnparsedFragments()`, `FREQ-TDS-001`, `STR-MASS-001`.
- **Expected Outcome:** Line 1 produces valid candidate; Line 2 produces candidate with `500mg`, `8D` unparsed, and `verifier_action_required: true`.
- **Safety Enforcement:** Whole prescription is **BLOCKED** from verification (**SI-01**) until Line 2 is reviewed.

#### `SYN-28` — Multi-Medication Partial Rejection Gate Block (SI-01)
- **Raw Text:** `Tab Metformin 500mg 1 tab BD\nTab Paracetamol 500mg 1 tab TDS`
- **Clinical Scenario:** Caregiver confirms Metformin but explicitly rejects Paracetamol due to contraindication.
- **Rules Exercised:** `verifyPrescription()` atomic transaction guard.
- **Expected Outcome:** `POST /api/prescriptions/:id/verify` returns HTTP **422 Unprocessable Entity** with `REJECTED_MEDICATIONS_PRESENT`.
- **Safety Enforcement:** Zero reminders generated; status remains unverified (**SI-01**).
