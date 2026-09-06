/**
 * Patient Creation API Routes Integration Tests.
 * Authoritative sources: `docs/API_CONTRACTS.md` §13.6, `docs/SCHEMA.md` §2.1, §10, `SAFETY_INVARIANTS.md` SI-16.
 */

import request from 'supertest';
import type { Knex } from 'knex';
import { createApp } from '../../src/app';
import { getDb } from '../../src/db/connection';
import { FixtureOcrProvider } from '../../src/ocr/fixture-provider';
import { Logger } from '../../src/logging/logger';

describe('Patient Creation API Route (POST /api/patients)', () => {
  let db: Knex;
  let app: any;
  let ocrProvider: FixtureOcrProvider;
  let logs: string[] = [];
  let testLogger: Logger;

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

  beforeEach(() => {
    logs = [];
    testLogger = new Logger({
      stream: {
        write: (msg: string) => {
          logs.push(msg);
        },
      },
    });
    app = createApp(db, ocrProvider, undefined, testLogger);
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

  it('1. Successfully registers a patient with required fields only', async () => {
    const res = await request(app)
      .post('/api/patients')
      .send({ full_name: 'Synthetic Patient One' })
      .expect(201);

    expect(res.body).toHaveProperty('patient');
    const { patient } = res.body;

    expect(patient.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(patient.full_name).toBe('Synthetic Patient One');
    expect(patient.phone_number).toBeNull();
    expect(patient.preferred_language).toBe('mr');
    expect(patient.meal_times).toBeNull();
    expect(patient.created_at).toBeDefined();
    expect(patient.updated_at).toBeDefined();

    // Verify row in database
    const dbRecord = await db('patients').where({ id: patient.id }).first();
    expect(dbRecord).toBeDefined();
    expect(dbRecord.full_name).toBe('Synthetic Patient One');
    expect(dbRecord.phone_number).toBeNull();
    expect(dbRecord.preferred_language).toBe('mr');
    expect(dbRecord.deleted_at).toBeNull();
  });

  it('2. Successfully registers a patient with all fields and custom meal times', async () => {
    const payload = {
      full_name: 'Asha Suresh Patil',
      phone_number: '+910000000019',
      preferred_language: 'mr',
      meal_times: {
        breakfast: '08:30',
        lunch: '13:00',
        dinner: '20:30',
        bedtime: '22:00',
      },
    };

    const res = await request(app)
      .post('/api/patients')
      .send(payload)
      .expect(201);

    const { patient } = res.body;
    expect(patient.full_name).toBe('Asha Suresh Patil');
    expect(patient.phone_number).toBe('+910000000019');
    expect(patient.preferred_language).toBe('mr');
    expect(patient.meal_times).toEqual({
      breakfast: '08:30',
      lunch: '13:00',
      dinner: '20:30',
      bedtime: '22:00',
    });

    // Verify DB
    const dbRecord = await db('patients').where({ id: patient.id }).first();
    expect(dbRecord.phone_number).toBe('+910000000019');
    const parsedMeals = typeof dbRecord.meal_times === 'string'
      ? JSON.parse(dbRecord.meal_times)
      : dbRecord.meal_times;
    expect(parsedMeals).toEqual(payload.meal_times);
  });

  it('3. Normalizes empty or whitespace phone_number to null', async () => {
    const res = await request(app)
      .post('/api/patients')
      .send({
        full_name: 'Patient Empty Phone',
        phone_number: '   ',
      })
      .expect(201);

    expect(res.body.patient.phone_number).toBeNull();

    const dbRecord = await db('patients').where({ id: res.body.patient.id }).first();
    expect(dbRecord.phone_number).toBeNull();
  });

  it('4. Rejects missing or empty full_name with 400 INVALID_FULL_NAME', async () => {
    // Missing
    const res1 = await request(app)
      .post('/api/patients')
      .send({})
      .expect(400);

    expect(res1.body).toEqual({
      error: {
        code: 'INVALID_FULL_NAME',
        message: expect.stringContaining('full name is required'),
      },
    });

    // Whitespace only
    const res2 = await request(app)
      .post('/api/patients')
      .send({ full_name: '   ' })
      .expect(400);

    expect(res2.body.error.code).toBe('INVALID_FULL_NAME');

    // Non-string
    const res3 = await request(app)
      .post('/api/patients')
      .send({ full_name: 12345 })
      .expect(400);

    expect(res3.body.error.code).toBe('INVALID_FULL_NAME');
  });

  it('5. Rejects invalid phone_number with 400 INVALID_PHONE_NUMBER', async () => {
    // Missing leading +
    const res1 = await request(app)
      .post('/api/patients')
      .send({ full_name: 'Valid Name', phone_number: '9822000019' })
      .expect(400);

    expect(res1.body.error.code).toBe('INVALID_PHONE_NUMBER');

    // Letters
    const res2 = await request(app)
      .post('/api/patients')
      .send({ full_name: 'Valid Name', phone_number: '+91ABCDEF12' })
      .expect(400);

    expect(res2.body.error.code).toBe('INVALID_PHONE_NUMBER');
  });

  it('6. Rejects unsupported preferred_language with 400 INVALID_PREFERRED_LANGUAGE', async () => {
    const res = await request(app)
      .post('/api/patients')
      .send({ full_name: 'Valid Name', preferred_language: 'fr' })
      .expect(400);

    expect(res.body.error.code).toBe('INVALID_PREFERRED_LANGUAGE');
  });

  it('7. Rejects invalid meal_times with 400 INVALID_MEAL_TIMES', async () => {
    // Non-object
    const res1 = await request(app)
      .post('/api/patients')
      .send({ full_name: 'Valid Name', meal_times: 'invalid' })
      .expect(400);
    expect(res1.body.error.code).toBe('INVALID_MEAL_TIMES');

    // Array
    const res2 = await request(app)
      .post('/api/patients')
      .send({ full_name: 'Valid Name', meal_times: ['08:00'] })
      .expect(400);
    expect(res2.body.error.code).toBe('INVALID_MEAL_TIMES');

    // Unknown slot
    const res3 = await request(app)
      .post('/api/patients')
      .send({ full_name: 'Valid Name', meal_times: { morning_snack: '10:00' } })
      .expect(400);
    expect(res3.body.error.code).toBe('INVALID_MEAL_TIMES');

    // Non-HH:mm format (12-hour or invalid)
    const res4 = await request(app)
      .post('/api/patients')
      .send({ full_name: 'Valid Name', meal_times: { breakfast: '8:00 AM' } })
      .expect(400);
    expect(res4.body.error.code).toBe('INVALID_MEAL_TIMES');

    // Out of range hours (25:00)
    const res5 = await request(app)
      .post('/api/patients')
      .send({ full_name: 'Valid Name', meal_times: { breakfast: '25:00' } })
      .expect(400);
    expect(res5.body.error.code).toBe('INVALID_MEAL_TIMES');
  });

  it('8. Enforces OQ-05 Caregiver Isolation: never creates patient_caregivers link', async () => {
    const [existingCaregiver] = await db('caregivers')
      .insert({ full_name: 'Dr. Verifier' })
      .returning('*');

    const res = await request(app)
      .post('/api/patients')
      .set('x-caregiver-id', existingCaregiver.id)
      .send({
        full_name: 'Isolated Patient',
        caregiver_id: existingCaregiver.id,
      })
      .expect(201);

    const createdPatientId = res.body.patient.id;

    // Verify ZERO entries in patient_caregivers
    const links = await db('patient_caregivers').where({ patient_id: createdPatientId });
    expect(links).toHaveLength(0);
  });

  it('9. Enforces SI-16: logs operational metadata only with ZERO patient PHI', async () => {
    await request(app)
      .post('/api/patients')
      .send({
        full_name: 'Secret Patient Name',
        phone_number: '+910000000019',
      })
      .expect(201);

    // Filter for PATIENT_CREATED logs
    const patientCreatedLogs = logs
      .map((l) => JSON.parse(l))
      .filter((entry) => entry.action === 'patient_created');

    expect(patientCreatedLogs.length).toBeGreaterThanOrEqual(1);
    const entry = patientCreatedLogs[0];

    // Allowed metadata exists
    expect(entry.patient_id).toBeDefined();
    expect(entry.action).toBe('patient_created');

    // Strictly verify no PHI leaked into logs
    expect(JSON.stringify(logs)).not.toContain('Secret Patient Name');
    expect(JSON.stringify(logs)).not.toContain('+910000000019');
  });
});
