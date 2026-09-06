import type { Knex } from 'knex';

/**
 * Migration 20260829000001: Core relational schema for PrescriptionSetu.
 *
 * Implements the 7 core tables specified in `docs/SCHEMA.md` v0.1.0:
 *   1. patients
 *   2. caregivers
 *   3. patient_caregivers
 *   4. prescriptions
 *   5. medications
 *   6. medication_audit_events (SI-14 append-only safety infrastructure)
 *   7. adherence_logs
 *
 * NOTE: The `reminders` table is explicitly BLOCKED on OQ-02 and is omitted here per SCHEMA.md §2.6.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. patients
  await knex.schema.createTable('patients', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('full_name').notNullable();
    table.text('phone_number').nullable();
    table.text('preferred_language').notNullable().defaultTo('mr');
    table.jsonb('meal_times').nullable();
    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // 2. caregivers
  await knex.schema.createTable('caregivers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('full_name').notNullable();
    table.text('phone_number').nullable();
    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // 3. patient_caregivers
  await knex.schema.createTable('patient_caregivers', (table) => {
    table.uuid('patient_id').notNullable().references('id').inTable('patients').onDelete('RESTRICT');
    table.uuid('caregiver_id').notNullable().references('id').inTable('caregivers').onDelete('RESTRICT');
    table.text('role').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.primary(['patient_id', 'caregiver_id', 'role']);
    table.check("role IN ('uploader', 'verifier', 'adherence_recipient')", [], 'chk_patient_caregiver_role');
  });

  // 4. prescriptions
  await knex.schema.createTable('prescriptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('patient_id').notNullable().references('id').inTable('patients').onDelete('RESTRICT');
    table.uuid('uploaded_by').nullable().references('id').inTable('caregivers').onDelete('RESTRICT');
    table.text('image_storage_key').nullable();
    table.text('raw_ocr_text').nullable();
    table.decimal('ocr_confidence', 5, 4).nullable();
    table.jsonb('ocr_metadata').nullable();
    table.text('status').notNullable().defaultTo('pending_verification');
    table.timestamp('verified_at', { useTz: true }).nullable();
    table.uuid('verified_by').nullable().references('id').inTable('caregivers').onDelete('RESTRICT');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.check("status IN ('pending_verification', 'verified')", [], 'chk_prescription_status');
  });

  // 5. medications
  await knex.schema.createTable('medications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('prescription_id').notNullable().references('id').inTable('prescriptions').onDelete('RESTRICT');
    table.text('drug_name').nullable();
    table.text('drug_name_validation').nullable();

    // Effective clinical fields (no database defaults)
    table.text('frequency_code').nullable();
    table.integer('times_per_day').nullable();
    table.specificType('timing_anchors', 'text[]').nullable();
    table.jsonb('dose_amount').nullable();
    table.text('dose_unit').nullable();
    table.decimal('dose_strength_value', 10, 4).nullable();
    table.text('dose_strength_unit').nullable();
    table.integer('duration_value').nullable();
    table.text('duration_unit').nullable();
    table.boolean('duration_indefinite').nullable();
    table.boolean('as_needed').nullable();
    table.integer('total_doses').nullable();
    table.boolean('recurring').nullable();
    table.boolean('immediate').nullable();
    table.boolean('schedule_derivable').nullable();
    table.boolean('verifier_action_required').nullable();

    // SI-08 fields (no defaults, parser-unwritable)
    table.integer('max_doses_per_day').nullable();
    table.decimal('min_interval_hours', 6, 2).nullable();

    // Provenance (immutable parse result)
    table.jsonb('parse_result').nullable();

    // Verification axis (the gate)
    table.text('verification_status').notNullable().defaultTo('pending');
    table.uuid('verified_by').nullable().references('id').inTable('caregivers').onDelete('RESTRICT');
    table.timestamp('verified_at', { useTz: true }).nullable();

    // Lifecycle axis (clinical state)
    table.text('lifecycle_state').nullable(); // starts NULL per SCHEMA §9
    table.uuid('superseded_by').nullable().references('id').inTable('medications').onDelete('RESTRICT');
    table.text('lifecycle_reason').nullable();
    table.timestamp('lifecycle_changed_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Constraints per SCHEMA §2.5
    table.check("verification_status IN ('pending', 'confirmed', 'corrected', 'rejected')", [], 'chk_medication_verification_status');
    table.check("lifecycle_state IN ('active', 'completed', 'stopped', 'superseded')", [], 'chk_medication_lifecycle_state');
    table.check("drug_name_validation IN ('matched', 'unmatched')", [], 'chk_medication_drug_name_validation');
    table.check("frequency_code IN ('ONCE_DAILY', 'TWICE_DAILY', 'THRICE_DAILY', 'FOUR_TIMES_DAILY')", [], 'chk_medication_frequency_code');
    table.check('times_per_day BETWEEN 1 AND 4', [], 'chk_medication_times_per_day');
    table.check("dose_unit IN ('tablet', 'ml')", [], 'chk_medication_dose_unit');
    table.check("dose_strength_unit IN ('mg', 'mcg', 'g')", [], 'chk_medication_dose_strength_unit');
    table.check("duration_unit IN ('day', 'week')", [], 'chk_medication_duration_unit');
  });

  // 6. medication_audit_events (SI-14 append-only safety infrastructure)
  await knex.schema.createTable('medication_audit_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('medication_id').notNullable().references('id').inTable('medications').onDelete('RESTRICT');
    table.text('event_type').notNullable();
    table.text('field_name').nullable();
    table.jsonb('old_value').nullable();
    table.jsonb('new_value').nullable();
    table.uuid('actor_caregiver_id').nullable().references('id').inTable('caregivers').onDelete('RESTRICT');
    table.text('reason').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.check(
      "event_type IN ('parsed', 'confirmed', 'corrected', 'rejected', 'stopped', 'superseded', 'completed', 'revised')",
      [],
      'chk_audit_event_type',
    );
  });

  // 7. adherence_logs
  await knex.schema.createTable('adherence_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('medication_id').nullable().references('id').inTable('medications').onDelete('RESTRICT');
    table.uuid('reminder_id').nullable(); // FK deferred until reminders table exists (OQ-02)
    table.uuid('responder_caregiver_id').nullable().references('id').inTable('caregivers').onDelete('RESTRICT');
    table.text('classification').notNullable();
    table.text('raw_reply_text').nullable();
    table.boolean('excluded_from_stats').notNullable().defaultTo(false);
    table.timestamp('escalated_at', { useTz: true }).nullable();
    table.timestamp('received_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.check("classification IN ('taken', 'missed', 'unclear', 'needs_attention')", [], 'chk_adherence_classification');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('adherence_logs');
  await knex.schema.dropTableIfExists('medication_audit_events');
  await knex.schema.dropTableIfExists('medications');
  await knex.schema.dropTableIfExists('prescriptions');
  await knex.schema.dropTableIfExists('patient_caregivers');
  await knex.schema.dropTableIfExists('caregivers');
  await knex.schema.dropTableIfExists('patients');
}
