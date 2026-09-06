/**
 * Clinical Audit Trail Routes Integration Tests.
 * Authoritative sources:
 *   - `SAFETY_INVARIANTS.md` SI-14, SI-16
 *   - `BUILD_ORDER.md` §4 Step 8
 *   - `docs/SCHEMA.md` §3.1
 *   - `docs/DECISIONS.md` D-016, D-031, D-033, D-034
 */

import request from 'supertest';
import type { Knex } from 'knex';
import { createApp } from '../../src/app';
import { getDb } from '../../src/db/connection';
import { FixtureOcrProvider } from '../../src/ocr/fixture-provider';
import { Logger } from '../../src/logging/logger';
import { savePrescriptionWithParseResult } from '../../src/db/repository';
import { correctMedication, stopMedication, confirmMedication, rejectMedication } from '../../src/verification/gate';
import { deletePatient } from '../../src/retention/service';
import { parse } from '../../src/parser/parse';

describe('Clinical Audit Trail API (GET /api/audit & GET /api/audit/:id)', () => {
  let db: Knex;
  let app: any;
  let ocrProvider: FixtureOcrProvider;
  let loggedEntries: any[] = [];
  let testLogger: Logger;

  let testPatientId: string;
  let testCaregiverId: string;

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
  });

  beforeEach(async () => {
    loggedEntries = [];
    testLogger = new Logger({
      stream: {
        write: (entry) => {
          loggedEntries.push(entry);
        },
      },
    });
    app = createApp(db, ocrProvider, undefined, testLogger);

    // Clean tables before seeding to guarantee isolation when running across all suites
    await db('adherence_logs').delete();
    await db('reminders').delete();
    await db('medication_audit_events').delete();
    await db('medications').delete();
    await db('prescriptions').delete();
    await db('patient_caregivers').delete();
    await db('caregivers').delete();
    await db('patients').delete();

    // Seed base test patient and caregiver
    const [patient] = await db('patients')
      .insert({
        full_name: 'Ganpatrao More',
        phone_number: '+919822012345',
        preferred_language: 'mr',
      })
      .returning('*');
    testPatientId = patient.id;

    const [caregiver] = await db('caregivers')
      .insert({
        full_name: 'Dr. Ananya Patil',
        phone_number: '+919822054321',
      })
      .returning('*');
    testCaregiverId = caregiver.id;
  });

  afterEach(async () => {
    await db('adherence_logs').delete();
    await db('reminders').delete();
    await db('medication_audit_events').delete();
    await db('medications').delete();
    await db('prescriptions').delete();
    await db('patient_caregivers').delete();
    await db('caregivers').delete();
    await db('patients').delete();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('1. Returns empty list and zeroed summary when no audit events exist', async () => {
    const res = await request(app).get('/api/audit');
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
    expect(res.body.total).toBe(0);
    expect(res.body.summary).toEqual({
      total_events: 0,
      corrections_count: 0,
      stops_count: 0,
      rejections_count: 0,
      confirmations_count: 0,
      erasures_count: 0,
    });
  });

  it('2. Returns populated audit events in reverse-chronological order with joined metadata', async () => {
    // 1. Upload & parse prescription (emits parsed event)
    const rawOcr = 'Tab Metformin 500mg 1 tab BD';
    const parsed = parse(rawOcr);
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parsed);
    const medId = saved.medications[0].id;

    // 2. Confirm medication (emits confirmed event)
    await confirmMedication(db, medId, testCaregiverId);

    const res = await request(app).get('/api/audit');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.events.length).toBe(2);

    // Most recent event should be confirmed
    const [firstEvent, secondEvent] = res.body.events;
    expect(firstEvent.event_type).toBe('confirmed');
    expect(firstEvent.patient_name).toBe('Ganpatrao More');
    expect(firstEvent.patient_id).toBe(testPatientId);
    expect(firstEvent.prescription_id).toBe(saved.prescription.id);
    expect(firstEvent.medication_id).toBe(medId);
    expect(firstEvent.actor_name).toBe('Dr. Ananya Patil');
    expect(firstEvent.actor_caregiver_id).toBe(testCaregiverId);

    // Second event should be parsed
    expect(secondEvent.event_type).toBe('parsed');
    expect(secondEvent.medication_id).toBe(medId);

    // Summary counts
    expect(res.body.summary.total_events).toBe(2);
    expect(res.body.summary.confirmations_count).toBe(1);
  });

  it('3. Filters audit events by event_type (corrected, stopped, erasure)', async () => {
    const rawOcr = 'Tab Telmisartan 40mg 1 tab OD';
    const parsed = parse(rawOcr);
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parsed);
    const medId = saved.medications[0].id;

    // Perform clinical correction
    await correctMedication(
      db,
      medId,
      {
        frequency_code: 'THRICE_DAILY',
        times_per_day: 3,
      },
      testCaregiverId,
      'Adjusted to TDS per doctor telephone instructions',
    );

    // Query with event_type=corrected
    const res = await request(app).get('/api/audit?event_type=corrected');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.events.length).toBe(1);
    expect(res.body.events[0].event_type).toBe('corrected');
    expect(res.body.events[0].reason).toBe('Adjusted to TDS per doctor telephone instructions');
    expect(res.body.events[0].old_value).toBeDefined();
    expect(res.body.events[0].new_value).toBeDefined();
    expect(res.body.summary.corrections_count).toBe(1);

    // Query with non-matching event_type
    const emptyRes = await request(app).get('/api/audit?event_type=stopped');
    expect(emptyRes.status).toBe(200);
    expect(emptyRes.body.total).toBe(0);
    expect(emptyRes.body.events).toEqual([]);
  });

  it('4. Rejects invalid event_type with 400 Bad Request', async () => {
    const res = await request(app).get('/api/audit?event_type=invalid_type');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_EVENT_TYPE');
  });

  it('5. Filters audit events by patient_id and medication_id', async () => {
    // Patient 1 medication
    const rawOcr1 = 'Tab Metformin 500mg 1 tab BD';
    const saved1 = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr1, parse(rawOcr1));

    // Patient 2
    const [patient2] = await db('patients')
      .insert({
        full_name: 'Savitri Patil',
        phone_number: '+919822099999',
        preferred_language: 'mr',
      })
      .returning('*');
    const rawOcr2 = 'Tab Amlodipine 5mg 1 tab OD';
    const saved2 = await savePrescriptionWithParseResult(db, patient2.id, testCaregiverId, rawOcr2, parse(rawOcr2));

    // Filter by patient 1
    const p1Res = await request(app).get(`/api/audit?patient_id=${testPatientId}`);
    expect(p1Res.status).toBe(200);
    expect(p1Res.body.total).toBe(1);
    expect(p1Res.body.events[0].patient_id).toBe(testPatientId);
    expect(p1Res.body.events[0].patient_name).toBe('Ganpatrao More');

    // Filter by patient 2
    const p2Res = await request(app).get(`/api/audit?patient_id=${patient2.id}`);
    expect(p2Res.status).toBe(200);
    expect(p2Res.body.total).toBe(1);
    expect(p2Res.body.events[0].patient_id).toBe(patient2.id);
    expect(p2Res.body.events[0].patient_name).toBe('Savitri Patil');

    // Filter by specific medication
    const medRes = await request(app).get(`/api/audit?medication_id=${saved1.medications[0].id}`);
    expect(medRes.status).toBe(200);
    expect(medRes.body.total).toBe(1);
    expect(medRes.body.events[0].medication_id).toBe(saved1.medications[0].id);

    // Invalid UUID validation
    const invalidRes = await request(app).get('/api/audit?patient_id=not-a-uuid');
    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.error.code).toBe('INVALID_PATIENT_ID');
  });

  it('6. Parameterized search across drug name, patient name, and audited reason', async () => {
    const rawOcr = 'Tab Telmisartan 40mg 1 tab OD';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));
    const medId = saved.medications[0].id;

    await rejectMedication(
      db,
      medId,
      'Handwriting smudge on frequency notation; rescanned by clinic',
      testCaregiverId,
    );

    // Search by reason keyword
    const searchRes = await request(app).get('/api/audit?search=smudge');
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.total).toBe(1);
    expect(searchRes.body.events[0].event_type).toBe('rejected');
    expect(searchRes.body.events[0].reason).toContain('smudge');

    // Search by patient name
    const patientSearch = await request(app).get('/api/audit?search=Ganpatrao');
    expect(patientSearch.status).toBe(200);
    expect(patientSearch.body.total).toBe(2); // parsed and rejected

    // Search with no match
    const noMatch = await request(app).get('/api/audit?search=nonexistenttermxyz');
    expect(noMatch.status).toBe(200);
    expect(noMatch.body.total).toBe(0);
  });

  it('7. Preserves audit trail for DPDP erased patient as [DELETED_PATIENT] (SI-14, D-031)', async () => {
    const rawOcr = 'Tab Metformin 500mg 1 tab BD';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));
    const medId = saved.medications[0].id;
    await confirmMedication(db, medId, testCaregiverId);

    // Manually activate medication for test stop
    await db('medications').where({ id: medId }).update({ lifecycle_state: 'active' });

    // Execute DPDP patient erasure
    const erasureResult = await deletePatient(db, testPatientId, testCaregiverId);
    expect(erasureResult.success).toBe(true);

    // Query audit events
    const res = await request(app).get('/api/audit');
    expect(res.status).toBe(200);

    // Find the stopped audit event generated by erasure
    const erasureEvent = res.body.events.find((e: any) => e.reason === 'PATIENT_ERASURE_REQUEST');
    expect(erasureEvent).toBeDefined();
    expect(erasureEvent.event_type).toBe('stopped');
    expect(erasureEvent.patient_name).toBe('[DELETED_PATIENT]');

    // Summary should reflect erasures_count
    expect(res.body.summary.erasures_count).toBe(1);
    expect(res.body.summary.stops_count).toBe(1);
  });

  it('8. GET /api/audit/:id returns full detail for an existing audit event', async () => {
    const rawOcr = 'Tab Metformin 500mg 1 tab BD';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));
    const medId = saved.medications[0].id;

    await confirmMedication(db, medId, testCaregiverId);

    const listRes = await request(app).get('/api/audit');
    const auditId = listRes.body.events[0].id;

    const detailRes = await request(app).get(`/api/audit/${auditId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.event.id).toBe(auditId);
    expect(detailRes.body.event.medication_id).toBe(medId);
    expect(detailRes.body.event.patient_name).toBe('Ganpatrao More');
    expect(detailRes.body.event.actor_name).toBe('Dr. Ananya Patil');
  });

  it('9. GET /api/audit/:id returns 404 for non-existent UUID and 400 for invalid UUID', async () => {
    const nonExistentUuid = '00000000-0000-0000-0000-000000000999';
    const notFoundRes = await request(app).get(`/api/audit/${nonExistentUuid}`);
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body.error.code).toBe('AUDIT_EVENT_NOT_FOUND');

    const badUuidRes = await request(app).get('/api/audit/not-a-valid-uuid');
    expect(badUuidRes.status).toBe(400);
    expect(badUuidRes.error).toBeDefined();
  });

  it('10. Asserts audit API is strictly read-only and records are never mutated by queries (SI-14, D-016)', async () => {
    const rawOcr = 'Tab Metformin 500mg 1 tab BD';
    const saved = await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));
    const medId = saved.medications[0].id;

    const auditBefore = await db('medication_audit_events').where({ medication_id: medId }).first();
    expect(auditBefore).toBeDefined();

    // Verify mutating HTTP methods on /api/audit return 404
    const postRes = await request(app).post('/api/audit').send({ event_type: 'custom' });
    expect(postRes.status).toBe(404);

    const putRes = await request(app).put(`/api/audit/${auditBefore.id}`).send({ reason: 'mutated' });
    expect(putRes.status).toBe(404);

    const patchRes = await request(app).patch(`/api/audit/${auditBefore.id}`).send({ reason: 'mutated' });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app).delete(`/api/audit/${auditBefore.id}`);
    expect(deleteRes.status).toBe(404);

    // Verify GET queries do not mutate the database record
    await request(app).get(`/api/audit?medication_id=${medId}`);
    await request(app).get(`/api/audit/${auditBefore.id}`);

    const auditAfter = await db('medication_audit_events').where({ id: auditBefore.id }).first();
    expect(auditAfter).toEqual(auditBefore);
  });

  it('11. Structured logging outputs zero PHI during audit queries (SI-16)', async () => {
    const rawOcr = 'Tab Metformin 500mg 1 tab BD';
    await savePrescriptionWithParseResult(db, testPatientId, testCaregiverId, rawOcr, parse(rawOcr));

    // Clear logs before query
    loggedEntries = [];

    // Execute audit query with search term and filters
    const res = await request(app).get('/api/audit?search=Metformin&event_type=parsed');
    expect(res.status).toBe(200);

    // Assert that the logger captured the request
    expect(loggedEntries.length).toBeGreaterThan(0);

    // Inspect all captured log strings
    const serializedLogs = JSON.stringify(loggedEntries);
    expect(serializedLogs).not.toContain('Metformin');
    expect(serializedLogs).not.toContain('Ganpatrao');
    expect(serializedLogs).not.toContain('+919822012345');
    expect(serializedLogs).not.toContain('500mg');
  });
});
