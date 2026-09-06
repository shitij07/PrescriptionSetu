/**
 * Prescription Image Retention Cleanup Integration Tests.
 * Authoritative sources: `PercriptionSetuMASTERPLAN.md` §26, `docs/SCHEMA.md` §10.
 */

import type { Knex } from 'knex';
import { getDb } from '../../src/db/connection';
import { cleanupExpiredPrescriptionImages } from '../../src/retention/service';

describe('Prescription Image Retention Cleanup Service', () => {
  let db: Knex;

  beforeAll(async () => {
    db = getDb({
      client: 'pg',
      connection: process.env.TEST_DATABASE_URL || {
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT) || 5432,
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.TEST_PGDATABASE || 'prescriptionsetu_test',
      },
      pool: { min: 1, max: 2 },
    });
  });

    const cleanTables = async () => {
      await db('adherence_logs').delete();
      await db('reminders').delete();
      await db('medication_audit_events').delete();
      await db('medications').delete();
      await db('prescriptions').delete();
      await db('patient_caregivers').delete();
      await db('caregivers').delete();
      await db('patients').delete();
    };

    beforeEach(async () => {
      await cleanTables();
    });

    afterEach(async () => {
      await cleanTables();
    });

  afterAll(async () => {
    await db.destroy();
  });

  it('purges image_storage_key on verified prescriptions older than retentionDays, while keeping recent and unverified ones intact', async () => {
    const [patient] = await db('patients')
      .insert({ full_name: 'Retention Test Patient', preferred_language: 'mr' })
      .returning('*');

    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    // 1. Expired verified prescription (>30 days)
    const [expiredRx] = await db('prescriptions')
      .insert({
        patient_id: patient.id,
        raw_ocr_text: 'Tab Paracetamol 650mg TDS',
        image_storage_key: 'prescriptions/old-img.jpg',
        status: 'verified',
        verified_at: fortyDaysAgo,
      })
      .returning('*');

    // 2. Recent verified prescription (<30 days)
    const [recentRx] = await db('prescriptions')
      .insert({
        patient_id: patient.id,
        raw_ocr_text: 'Tab Metformin 500mg BD',
        image_storage_key: 'prescriptions/recent-img.jpg',
        status: 'verified',
        verified_at: fiveDaysAgo,
      })
      .returning('*');

    // 3. Unverified prescription (should never be purged before human verification)
    const [unverifiedRx] = await db('prescriptions')
      .insert({
        patient_id: patient.id,
        raw_ocr_text: 'Tab Amoxicillin 500mg TDS',
        image_storage_key: 'prescriptions/unverified-img.jpg',
        status: 'pending_verification',
      })
      .returning('*');

    // Execute retention cleanup with 30 days retention policy
    const result = await cleanupExpiredPrescriptionImages(db, { retentionDays: 30 });

    expect(result.success).toBe(true);
    expect(result.purged_images_count).toBe(1);

    // Verify expired prescription had image_storage_key cleared
    const updatedExpired = await db('prescriptions').where({ id: expiredRx.id }).first();
    expect(updatedExpired.image_storage_key).toBeNull();
    // Verify raw_ocr_text remains intact (provenance preservation)
    expect(updatedExpired.raw_ocr_text).toBe('Tab Paracetamol 650mg TDS');

    // Verify recent prescription image is preserved
    const updatedRecent = await db('prescriptions').where({ id: recentRx.id }).first();
    expect(updatedRecent.image_storage_key).toBe('prescriptions/recent-img.jpg');

    // Verify unverified prescription image is preserved
    const updatedUnverified = await db('prescriptions').where({ id: unverifiedRx.id }).first();
    expect(updatedUnverified.image_storage_key).toBe('prescriptions/unverified-img.jpg');
  });
});
