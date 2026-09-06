/**
 * Verification Dashboard API Integration Tests (Pending Queue & Detail Views).
 * Authoritative sources: `PercriptionSetuMASTERPLAN.md` §18.5, `docs/API_CONTRACTS.md` §13.2.
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { getDb } from '../../src/db/connection';
import { FixtureOcrProvider } from '../../src/ocr/fixture-provider';
import { savePrescriptionWithParseResult } from '../../src/db/repository';
import { parse } from '../../src/parser/parse';
import type { Knex } from 'knex';

describe('Verification Dashboard API (GET /pending & GET /:id)', () => {
  let db: Knex;
  let app: any;
  let ocrProvider: FixtureOcrProvider;
  let testPatientId: string;
  let testCaregiverId: string;
  let pendingPrescriptionId: string;
  let verifiedPrescriptionId: string;

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

    ocrProvider = new FixtureOcrProvider();
    app = createApp(db, ocrProvider);

    const [patient] = await db('patients').insert({ full_name: 'Dashboard Patient' }).returning('*');
    testPatientId = patient.id;

    const [caregiver] = await db('caregivers').insert({ full_name: 'Dashboard Caregiver' }).returning('*');
    testCaregiverId = caregiver.id;

    // 1. Create a pending prescription with parsed candidates (including ambiguous token)
    const rawOcrPending = 'Tab Moxifloxacin eye drops 1 drop OD\nTab Paracetamol 500mg 1 tab SOS';
    const parsedPending = parse(rawOcrPending);
    const savedPending = await savePrescriptionWithParseResult(
      db,
      testPatientId,
      testCaregiverId,
      rawOcrPending,
      parsedPending,
    );
    pendingPrescriptionId = savedPending.prescription.id;

    // 2. Create a verified prescription
    const [verifiedPrescription] = await db('prescriptions')
      .insert({
        patient_id: testPatientId,
        uploaded_by: testCaregiverId,
        raw_ocr_text: 'Tab Metformin 500mg 1 tab BD',
        status: 'verified',
      })
      .returning('*');
    verifiedPrescriptionId = verifiedPrescription.id;
  });

  afterAll(async () => {
    if (db) {
      const pRows = await db('prescriptions').where({ patient_id: testPatientId }).select('id');
      const pIds = pRows.map((p: any) => p.id);
      if (pIds.length > 0) {
        const mRows = await db('medications').whereIn('prescription_id', pIds).select('id');
        const mIds = mRows.map((m: any) => m.id);
        if (mIds.length > 0) {
          await db('medication_audit_events').whereIn('medication_id', mIds).del();
        }
        await db('medications').whereIn('prescription_id', pIds).del();
        await db('prescriptions').whereIn('id', pIds).del();
      }
      await db('caregivers').where({ id: testCaregiverId }).del();
      await db('patients').where({ id: testPatientId }).del();
      await db.destroy();
    }
  });

  it('1. GET /api/prescriptions/pending returns pending prescriptions with CORS headers for dashboard', async () => {
    const res = await request(app)
      .get('/api/prescriptions/pending')
      .set('Origin', 'http://localhost:3001');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    expect(res.body.prescriptions).toBeDefined();
    expect(Array.isArray(res.body.prescriptions)).toBe(true);

    const ids = res.body.prescriptions.map((p: any) => p.id);
    expect(ids).toContain(pendingPrescriptionId);
  });

  it('2. GET /api/prescriptions/pending filters by caregiver_id query parameter', async () => {
    const res = await request(app).get(`/api/prescriptions/pending?caregiver_id=${testCaregiverId}`);

    expect(res.status).toBe(200);
    expect(res.body.prescriptions.length).toBeGreaterThanOrEqual(1);
    expect(res.body.prescriptions.every((p: any) => p.uploaded_by === testCaregiverId)).toBe(true);
  });

  it('3. GET /api/prescriptions/pending does NOT return verified prescriptions', async () => {
    const res = await request(app).get('/api/prescriptions/pending');

    expect(res.status).toBe(200);
    const ids = res.body.prescriptions.map((p: any) => p.id);
    expect(ids).not.toContain(verifiedPrescriptionId);
  });

  it('4. GET /api/prescriptions/:id returns full metadata and raw OCR text', async () => {
    const res = await request(app).get(`/api/prescriptions/${pendingPrescriptionId}`);

    expect(res.status).toBe(200);
    expect(res.body.prescription.id).toBe(pendingPrescriptionId);
    expect(res.body.prescription.status).toBe('pending_verification');
    expect(res.body.prescription.raw_ocr_text).toContain('Moxifloxacin');
  });

  it('5. GET /api/prescriptions/:id returns display expansions with rule_id, matched_literal, and plain language expansion', async () => {
    const res = await request(app).get(`/api/prescriptions/${pendingPrescriptionId}`);

    expect(res.status).toBe(200);
    expect(res.body.medications).toHaveLength(2);

    const med1 = res.body.medications.find((m: any) =>
      m.display_expansions?.some((e: any) => e.rule_id === 'AMBIG-OD-001'),
    );
    expect(med1).toBeDefined();
    expect(med1.display_expansions.length).toBeGreaterThanOrEqual(1);

    const ambigRule = med1.display_expansions.find((e: any) => e.rule_id === 'AMBIG-OD-001');
    expect(ambigRule).toBeDefined();
    expect(ambigRule.matched_literal).toBe('OD');
    expect(ambigRule.canonical_expansion).toContain('ambiguous');
  });

  it('6. GET /api/prescriptions/:id surfaces candidate_readings for ambiguous tokens (SI-05)', async () => {
    const res = await request(app).get(`/api/prescriptions/${pendingPrescriptionId}`);

    expect(res.status).toBe(200);
    const med1 = res.body.medications.find((m: any) => m.candidate_readings?.length > 0);
    expect(med1).toBeDefined();
    expect(med1.candidate_readings).toHaveLength(2);
    expect(med1.candidate_readings[0].reading).toBe('once daily');
    expect(med1.candidate_readings[1].reading).toBe('right eye');
  });

  it('7. GET /api/prescriptions/:id surfaces missing_fields for conditional PRN/SOS items (SI-08)', async () => {
    const res = await request(app).get(`/api/prescriptions/${pendingPrescriptionId}`);

    expect(res.status).toBe(200);
    const med2 = res.body.medications.find((m: any) => m.effective_fields?.as_needed === true);
    expect(med2).toBeDefined();
    expect(med2.effective_fields.as_needed).toBe(true);
    expect(med2.missing_fields.length).toBeGreaterThanOrEqual(2);
    const missingFieldNames = med2.missing_fields.map((mf: any) => mf.field);
    expect(missingFieldNames).toContain('max_doses_per_day');
    expect(missingFieldNames).toContain('min_interval_hours');
  });

  it('8. GET /api/prescriptions/:id returns 404 for non-existent prescription UUID', async () => {
    const nonExistentUuid = '99999999-0000-0000-0000-000000000000';
    const res = await request(app).get(`/api/prescriptions/${nonExistentUuid}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });
});
