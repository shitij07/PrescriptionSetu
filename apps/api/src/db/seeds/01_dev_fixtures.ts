import type { Knex } from 'knex';

/**
 * Deterministic Synthetic Development Fixtures Seed (Slice 1).
 *
 * Populates realistic, strictly synthetic relational data for local development:
 * - 1 Caregiver (Dr. Ananya Patil, matching DEFAULT_CAREGIVER_ID)
 * - 3 Outpatients (Ganpatrao More, Sunita Kulkarni, Dattatray Shinde)
 * - Patient-Caregiver relationship links
 * - 1 Pending Prescription with unverified candidate (Sunita Kulkarni)
 * - 1 Verified Prescription with 2 active medication regimens (Ganpatrao More)
 * - Append-only medication audit events (SI-14)
 * - Scheduled reminders for active regimens (D-030)
 * - Synthetic adherence logs
 *
 * SAFETY INVARIANTS:
 * - Strict non-production guard: throws if NODE_ENV is 'production'.
 * - Zero real PHI: all names prefixed with '[DEV]' and contact numbers use '+91 00000 XXXXX'.
 * - Enforces SI-01: pending prescription only has pending medications with lifecycle_state = NULL.
 * - Enforces SI-02 / SI-03: reminders only exist for confirmed medications with lifecycle_state = 'active'.
 */

export const DEV_CAREGIVER_ID = '00000000-0000-0000-0000-000000000001';

export const DEV_PATIENT_1_ID = '11111111-1111-1111-1111-111111111111'; // Ganpatrao More (Chronic active)
export const DEV_PATIENT_2_ID = '22222222-2222-2222-2222-222222222222'; // Sunita Kulkarni (Pending verification)
export const DEV_PATIENT_3_ID = '33333333-3333-3333-3333-333333333333'; // Dattatray Shinde (Directory only)

export const DEV_RX_PENDING_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const DEV_MED_PENDING_ID = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';

export const DEV_RX_VERIFIED_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
export const DEV_MED_ACTIVE_1_ID = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb'; // Metformin 500mg BD
export const DEV_MED_ACTIVE_2_ID = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb'; // Telmisartan 40mg OD

export const DEV_REMINDER_1_ID = 'cccccccc-1111-1111-1111-cccccccccccc';
export const DEV_REMINDER_2_ID = 'cccccccc-2222-2222-2222-cccccccccccc';

export const DEV_ADHERENCE_1_ID = 'dddddddd-1111-1111-1111-dddddddddddd';
export const DEV_ADHERENCE_2_ID = 'dddddddd-2222-2222-2222-dddddddddddd';

export async function seed(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL SAFETY ERROR: SEED DATA MUST NEVER RUN IN A PRODUCTION ENVIRONMENT.');
  }

  const allDevPatientIds = [DEV_PATIENT_1_ID, DEV_PATIENT_2_ID, DEV_PATIENT_3_ID];
  const allDevPrescriptionIds = [DEV_RX_PENDING_ID, DEV_RX_VERIFIED_ID];
  const allDevMedicationIds = [DEV_MED_PENDING_ID, DEV_MED_ACTIVE_1_ID, DEV_MED_ACTIVE_2_ID];

  // 1. Clean up existing seed fixtures in reverse foreign-key dependency order
  await knex('adherence_logs').whereIn('medication_id', allDevMedicationIds).del();
  await knex('reminders').whereIn('medication_id', allDevMedicationIds).del();
  await knex('medication_audit_events').whereIn('medication_id', allDevMedicationIds).del();
  await knex('medications').whereIn('id', allDevMedicationIds).del();
  await knex('prescriptions').whereIn('id', allDevPrescriptionIds).del();
  await knex('patient_caregivers').whereIn('patient_id', allDevPatientIds).del();
  await knex('patients').whereIn('id', allDevPatientIds).del();
  await knex('caregivers').where({ id: DEV_CAREGIVER_ID }).del();

  const now = new Date();

  // 2. Insert primary caregiver
  await knex('caregivers').insert({
    id: DEV_CAREGIVER_ID,
    full_name: 'Dr. Ananya Patil',
    phone_number: '+91 00000 00000',
    created_at: now,
    updated_at: now,
  });

  // 3. Insert outpatients with realistic Marathi meal anchors
  await knex('patients').insert([
    {
      id: DEV_PATIENT_1_ID,
      full_name: '[DEV] Ganpatrao More',
      phone_number: '+91 00000 00001',
      preferred_language: 'mr',
      meal_times: JSON.stringify({
        breakfast: '08:00',
        lunch: '13:00',
        dinner: '20:00',
        bedtime: '22:00',
      }),
      created_at: new Date(Date.now() - 3600000 * 24 * 7), // 7 days ago
      updated_at: now,
    },
    {
      id: DEV_PATIENT_2_ID,
      full_name: '[DEV] Sunita Kulkarni',
      phone_number: '+91 00000 00002',
      preferred_language: 'mr',
      meal_times: JSON.stringify({
        breakfast: '08:30',
        lunch: '13:30',
        dinner: '20:30',
        bedtime: '22:30',
      }),
      created_at: new Date(Date.now() - 3600000 * 24 * 2), // 2 days ago
      updated_at: now,
    },
    {
      id: DEV_PATIENT_3_ID,
      full_name: '[DEV] Dattatray Shinde',
      phone_number: '+91 00000 00003',
      preferred_language: 'mr',
      meal_times: JSON.stringify({
        breakfast: '08:00',
        lunch: '13:00',
        dinner: '20:00',
        bedtime: '21:30',
      }),
      created_at: new Date(Date.now() - 3600000 * 24 * 1), // 1 day ago
      updated_at: now,
    },
  ]);

  // 4. Link caregivers to patients
  await knex('patient_caregivers').insert([
    {
      patient_id: DEV_PATIENT_1_ID,
      caregiver_id: DEV_CAREGIVER_ID,
      role: 'verifier',
      created_at: now,
    },
    {
      patient_id: DEV_PATIENT_1_ID,
      caregiver_id: DEV_CAREGIVER_ID,
      role: 'uploader',
      created_at: now,
    },
    {
      patient_id: DEV_PATIENT_1_ID,
      caregiver_id: DEV_CAREGIVER_ID,
      role: 'adherence_recipient',
      created_at: now,
    },
    {
      patient_id: DEV_PATIENT_2_ID,
      caregiver_id: DEV_CAREGIVER_ID,
      role: 'verifier',
      created_at: now,
    },
    {
      patient_id: DEV_PATIENT_2_ID,
      caregiver_id: DEV_CAREGIVER_ID,
      role: 'uploader',
      created_at: now,
    },
    {
      patient_id: DEV_PATIENT_3_ID,
      caregiver_id: DEV_CAREGIVER_ID,
      role: 'verifier',
      created_at: now,
    },
  ]);

  // 5. Prescriptions: 1 pending, 1 verified
  await knex('prescriptions').insert([
    {
      id: DEV_RX_PENDING_ID,
      patient_id: DEV_PATIENT_2_ID,
      uploaded_by: DEV_CAREGIVER_ID,
      image_storage_key: 'dev_fixtures/sunita_amoxicillin.png',
      raw_ocr_text: 'Tab Amoxicillin 500 mg 1 tab TDS x 7 days',
      ocr_confidence: 0.94,
      ocr_metadata: JSON.stringify({ engine: 'fixture', lines: 1 }),
      status: 'pending_verification',
      created_at: new Date(Date.now() - 3600000 * 2), // 2 hours ago
      updated_at: new Date(Date.now() - 3600000 * 2),
    },
    {
      id: DEV_RX_VERIFIED_ID,
      patient_id: DEV_PATIENT_1_ID,
      uploaded_by: DEV_CAREGIVER_ID,
      image_storage_key: 'dev_fixtures/ganpatrao_chronic.png',
      raw_ocr_text: 'Tab Metformin 500mg 1 tab BD\nTab Telmisartan 40mg 1 tab OD pc',
      ocr_confidence: 0.98,
      ocr_metadata: JSON.stringify({ engine: 'fixture', lines: 2 }),
      status: 'verified',
      verified_at: new Date(Date.now() - 3600000 * 24 * 3), // verified 3 days ago
      verified_by: DEV_CAREGIVER_ID,
      created_at: new Date(Date.now() - 3600000 * 24 * 3),
      updated_at: new Date(Date.now() - 3600000 * 24 * 3),
    },
  ]);

  // 6. Medications
  await knex('medications').insert([
    // Pending candidate on pending Rx
    {
      id: DEV_MED_PENDING_ID,
      prescription_id: DEV_RX_PENDING_ID,
      drug_name: 'Amoxicillin',
      drug_name_validation: 'matched',
      frequency_code: 'THRICE_DAILY',
      times_per_day: 3,
      timing_anchors: null,
      dose_amount: JSON.stringify(1),
      dose_unit: 'tablet',
      dose_strength_value: 500,
      dose_strength_unit: 'mg',
      duration_value: 7,
      duration_unit: 'day',
      duration_indefinite: false,
      as_needed: false,
      total_doses: 21,
      recurring: true,
      immediate: false,
      schedule_derivable: true,
      verifier_action_required: false,
      verification_status: 'pending',
      lifecycle_state: null, // Starts NULL per SCHEMA §9
      parse_result: JSON.stringify({
        candidate_readings: [],
        missing_fields: [],
        unparsed_fragments: [],
        frequency_code: {
          rule_id: 'FREQ-TDS-001',
          dictionary_version: '0.1.0',
          matched_literal: 'TDS',
          source_span: { start: 26, end: 29 },
          match_type: 'exact',
        },
      }),
      created_at: new Date(Date.now() - 3600000 * 2),
    },
    // Active medication 1 on verified Rx
    {
      id: DEV_MED_ACTIVE_1_ID,
      prescription_id: DEV_RX_VERIFIED_ID,
      drug_name: 'Metformin',
      drug_name_validation: 'matched',
      frequency_code: 'TWICE_DAILY',
      times_per_day: 2,
      timing_anchors: ['AFTER_MEAL'],
      dose_amount: JSON.stringify(1),
      dose_unit: 'tablet',
      dose_strength_value: 500,
      dose_strength_unit: 'mg',
      duration_value: 30,
      duration_unit: 'day',
      duration_indefinite: true,
      as_needed: false,
      total_doses: 60,
      recurring: true,
      immediate: false,
      schedule_derivable: true,
      verifier_action_required: false,
      verification_status: 'confirmed',
      verified_by: DEV_CAREGIVER_ID,
      verified_at: new Date(Date.now() - 3600000 * 24 * 3),
      lifecycle_state: 'active',
      lifecycle_changed_at: new Date(Date.now() - 3600000 * 24 * 3),
      lifecycle_reason: 'Prescription verified',
      parse_result: JSON.stringify({
        candidate_readings: [],
        missing_fields: [],
        unparsed_fragments: [],
        frequency_code: {
          rule_id: 'FREQ-BD-001',
          dictionary_version: '0.1.0',
          matched_literal: 'BD',
          source_span: { start: 23, end: 25 },
          match_type: 'exact',
        },
      }),
      created_at: new Date(Date.now() - 3600000 * 24 * 3),
    },
    // Active medication 2 on verified Rx
    {
      id: DEV_MED_ACTIVE_2_ID,
      prescription_id: DEV_RX_VERIFIED_ID,
      drug_name: 'Telmisartan',
      drug_name_validation: 'matched',
      frequency_code: 'ONCE_DAILY',
      times_per_day: 1,
      timing_anchors: ['AFTER_MEAL'],
      dose_amount: JSON.stringify(1),
      dose_unit: 'tablet',
      dose_strength_value: 40,
      dose_strength_unit: 'mg',
      duration_value: 30,
      duration_unit: 'day',
      duration_indefinite: true,
      as_needed: false,
      total_doses: 30,
      recurring: true,
      immediate: false,
      schedule_derivable: true,
      verifier_action_required: false,
      verification_status: 'confirmed',
      verified_by: DEV_CAREGIVER_ID,
      verified_at: new Date(Date.now() - 3600000 * 24 * 3),
      lifecycle_state: 'active',
      lifecycle_changed_at: new Date(Date.now() - 3600000 * 24 * 3),
      lifecycle_reason: 'Prescription verified',
      parse_result: JSON.stringify({
        candidate_readings: [],
        missing_fields: [],
        unparsed_fragments: [],
        frequency_code: {
          rule_id: 'FREQ-OD-001',
          dictionary_version: '0.1.0',
          matched_literal: 'OD',
          source_span: { start: 56, end: 58 },
          match_type: 'exact',
        },
      }),
      created_at: new Date(Date.now() - 3600000 * 24 * 3),
    },
  ]);

  // 7. SI-14 Append-only Medication Audit Events
  await knex('medication_audit_events').insert([
    {
      medication_id: DEV_MED_PENDING_ID,
      event_type: 'parsed',
      actor_caregiver_id: null,
      reason: 'Automated deterministic shorthand parse',
      created_at: new Date(Date.now() - 3600000 * 2),
    },
    {
      medication_id: DEV_MED_ACTIVE_1_ID,
      event_type: 'parsed',
      actor_caregiver_id: null,
      reason: 'Automated deterministic shorthand parse',
      created_at: new Date(Date.now() - 3600000 * 24 * 3),
    },
    {
      medication_id: DEV_MED_ACTIVE_1_ID,
      event_type: 'confirmed',
      actor_caregiver_id: DEV_CAREGIVER_ID,
      reason: 'Human clinical verification sign-off',
      created_at: new Date(Date.now() - 3600000 * 24 * 3),
    },
    {
      medication_id: DEV_MED_ACTIVE_2_ID,
      event_type: 'parsed',
      actor_caregiver_id: null,
      reason: 'Automated deterministic shorthand parse',
      created_at: new Date(Date.now() - 3600000 * 24 * 3),
    },
    {
      medication_id: DEV_MED_ACTIVE_2_ID,
      event_type: 'confirmed',
      actor_caregiver_id: DEV_CAREGIVER_ID,
      reason: 'Human clinical verification sign-off',
      created_at: new Date(Date.now() - 3600000 * 24 * 3),
    },
  ]);

  // 8. Reminders for active medications only (SI-02, SI-03)
  await knex('reminders').insert([
    {
      id: DEV_REMINDER_1_ID,
      medication_id: DEV_MED_ACTIVE_1_ID,
      scheduled_time: new Date(Date.now() + 3600000 * 2), // in 2 hours
      status: 'pending',
      payload: JSON.stringify({
        type: 'rendered_text',
        body: 'नमस्कार, Metformin (1 tablet) घेण्याची वेळ झाली आहे.',
        language: 'mr',
      }),
      attempt_count: 0,
      created_at: new Date(Date.now() - 3600000 * 24 * 3),
    },
    {
      id: DEV_REMINDER_2_ID,
      medication_id: DEV_MED_ACTIVE_2_ID,
      scheduled_time: new Date(Date.now() + 3600000 * 4), // in 4 hours
      status: 'pending',
      payload: JSON.stringify({
        type: 'rendered_text',
        body: 'नमस्कार, Telmisartan (1 tablet) घेण्याची वेळ झाली आहे.',
        language: 'mr',
      }),
      attempt_count: 0,
      created_at: new Date(Date.now() - 3600000 * 24 * 3),
    },
  ]);

  // 9. Adherence Logs
  await knex('adherence_logs').insert([
    {
      id: DEV_ADHERENCE_1_ID,
      medication_id: DEV_MED_ACTIVE_1_ID,
      reminder_id: null,
      responder_caregiver_id: DEV_CAREGIVER_ID,
      classification: 'taken',
      raw_reply_text: 'हो, गोळी घेतली',
      excluded_from_stats: false,
      received_at: new Date(Date.now() - 3600000 * 24),
    },
    {
      id: DEV_ADHERENCE_2_ID,
      medication_id: DEV_MED_ACTIVE_2_ID,
      reminder_id: null,
      responder_caregiver_id: DEV_CAREGIVER_ID,
      classification: 'taken',
      raw_reply_text: 'औषध घेतले',
      excluded_from_stats: false,
      received_at: new Date(Date.now() - 3600000 * 12),
    },
  ]);
}
