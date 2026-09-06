import type { Knex } from 'knex';

/**
 * Migration 20260829000002: Reminders schema for PrescriptionSetu.
 *
 * Implements the `reminders` table specified in `docs/SCHEMA.md` §2.6 and `docs/DECISIONS.md` D-030 (OQ-02 resolved).
 *
 * - `payload` column: `jsonb NOT NULL` supporting polymorphic union:
 *    1. `{ type: 'rendered_text', body: string, language: string }`
 *    2. `{ type: 'template', template_name: string, language: string, variables: string[] }`
 * - Constraints:
 *    - `status IN ('pending', 'sent', 'failed', 'cancelled')`
 *    - Foreign key: `medication_id -> medications.id` (RESTRICT)
 *    - Foreign key: `adherence_logs.reminder_id -> reminders.id` (SET NULL)
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Create reminders table
  await knex.schema.createTable('reminders', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('medication_id').notNullable().references('id').inTable('medications').onDelete('RESTRICT');
    table.timestamp('scheduled_time', { useTz: true }).notNullable();
    table.text('status').notNullable().defaultTo('pending');
    table.jsonb('payload').notNullable();
    table.timestamp('sent_at', { useTz: true }).nullable();
    table.integer('attempt_count').notNullable().defaultTo(0);
    table.text('last_error_code').nullable();
    table.timestamp('cancelled_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.check("status IN ('pending', 'sent', 'failed', 'cancelled')", [], 'chk_reminder_status');
    table.index(['scheduled_time', 'status'], 'idx_reminders_scheduled_status');
    table.index(['medication_id'], 'idx_reminders_medication_id');
  });

  // 2. Add foreign key to adherence_logs.reminder_id
  await knex.schema.alterTable('adherence_logs', (table) => {
    table.foreign('reminder_id', 'fk_adherence_logs_reminder_id').references('id').inTable('reminders').onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('adherence_logs', (table) => {
    table.dropForeign(['reminder_id'], 'fk_adherence_logs_reminder_id');
  });
  await knex.schema.dropTableIfExists('reminders');
}
