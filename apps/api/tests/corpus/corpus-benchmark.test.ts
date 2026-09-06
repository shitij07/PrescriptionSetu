/**
 * End-to-End Synthetic Prescription Corpus Benchmark Suite.
 * Authoritative sources: `BUILD_ORDER.md` §2.1, `PercriptionSetuMASTERPLAN.md` §18.2, §26, `docs/CORPUS.md`.
 */

import path from 'path';
import fs from 'fs';
import type { Knex } from 'knex';
import { parse } from '../../src/parser/parse';
import { FixtureOcrProvider } from '../../src/ocr/fixture-provider';
import { getDb } from '../../src/db/connection';
import { savePrescriptionWithParseResult } from '../../src/db/repository';
import { confirmMedication, rejectMedication, verifyPrescription } from '../../src/verification/gate';

const corpusFixturePath = path.join(__dirname, 'fixtures', 'prescription-corpus.json');
const corpusFixture: any[] = JSON.parse(fs.readFileSync(corpusFixturePath, 'utf8'));

describe('Synthetic Prescription Corpus Benchmark Suite (28 Samples)', () => {
  let db: Knex;
  let ocrProvider: FixtureOcrProvider;
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
    await db('adherence_logs').delete();
    await db('reminders').delete();
    await db('medication_audit_events').delete();
    await db('medications').delete();
    await db('prescriptions').delete();
    await db('patient_caregivers').delete();
    await db('caregivers').delete();
    await db('patients').delete();

    const [patient] = await db('patients')
      .insert({ full_name: 'Corpus Benchmark Patient', preferred_language: 'mr' })
      .returning('*');
    testPatientId = patient.id;

    const [caregiver] = await db('caregivers')
      .insert({ full_name: 'Corpus Benchmark Caregiver', phone_number: '+919876543210' })
      .returning('*');
    testCaregiverId = caregiver.id;
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('Parser Fidelity & Provenance Validation Across All 28 Samples', () => {
    for (const sample of corpusFixture) {
      it(`[${sample.sample_id}] ${sample.name} matches expected candidate structure and source spans`, () => {
        const result = parse(sample.raw_prescription_text);
        expect(result.candidates).toHaveLength(sample.expected_candidate_count);

        // Verify each expected candidate property
        for (let i = 0; i < sample.expected_candidates.length; i++) {
          const expected: any = sample.expected_candidates[i];
          const actual = result.candidates[i];

          if (expected.frequency_code !== undefined) {
            expect(actual.frequency_code).toBe(expected.frequency_code);
          }
          if (expected.times_per_day !== undefined) {
            expect(actual.times_per_day).toBe(expected.times_per_day);
          }
          if (expected.dose_amount !== undefined) {
            expect(actual.dose_amount).toEqual(expected.dose_amount);
          }
          if (expected.dose_unit !== undefined) {
            expect(actual.dose_unit).toBe(expected.dose_unit);
          }
          if (expected.dose_strength_value !== undefined) {
            expect(actual.dose_strength_value).toBe(expected.dose_strength_value);
          }
          if (expected.dose_strength_unit !== undefined) {
            expect(actual.dose_strength_unit).toBe(expected.dose_strength_unit);
          }
          if (expected.duration_value !== undefined) {
            expect(actual.duration_value).toBe(expected.duration_value);
          }
          if (expected.duration_unit !== undefined) {
            expect(actual.duration_unit).toBe(expected.duration_unit);
          }
          if (expected.timing_anchors !== undefined) {
            expect(actual.timing_anchors).toEqual(expect.arrayContaining(expected.timing_anchors));
          }
          if (expected.as_needed !== undefined) {
            expect(actual.as_needed).toBe(expected.as_needed);
          }
          if (expected.verifier_action_required !== undefined) {
            expect(actual.verifier_action_required).toBe(expected.verifier_action_required);
          }

          // Provenance Check: Verify source spans slice valid non-empty substring from source text
          for (const match of actual.matches) {
            const sliced = sample.raw_prescription_text.slice(
              match.source_span.start,
              match.source_span.end,
            );
            expect(sliced.toLowerCase()).toBe(match.matched_literal.toLowerCase());
          }
        }
      });
    }
  });

  describe('Fixture OCR Perception Lookup', () => {
    for (const sample of corpusFixture) {
      it(`[${sample.sample_id}] resolves from FixtureOcrProvider by sample key`, async () => {
        const ocrResult = await ocrProvider.processImage({ fixture_key: sample.sample_id });
        expect(ocrResult.raw_ocr_text).toBe(sample.raw_prescription_text);
        expect(ocrResult.confidence).toBeGreaterThanOrEqual(0.7);
      });
    }
  });

  describe('End-to-End Pipeline & Safety Invariant Execution', () => {
    it('[SYN-01] Metformin BD successfully verifies and schedules 2 daily reminders', async () => {
      const ocrResult = await ocrProvider.processImage({ fixture_key: 'SYN-01' });
      const parseResult = parse(ocrResult.raw_ocr_text);
      const saved = await savePrescriptionWithParseResult(
        db,
        testPatientId,
        testCaregiverId,
        ocrResult.raw_ocr_text,
        parseResult,
        ocrResult.confidence,
      );

      // Confirm candidate and authorize schedule
      const medId = saved.medications[0].id;
      await confirmMedication(db, medId, testCaregiverId);
      await db('medications').where({ id: medId }).update({ schedule_derivable: true });

      // Verify prescription
      const verified = await verifyPrescription(db, saved.prescription.id, testCaregiverId);
      expect(verified.prescription_status).toBe('verified');

      // Check persisted reminders
      const reminders = await db('reminders').where({ medication_id: medId });
      expect(reminders).toHaveLength(2);
    });

    it('[SYN-02] Amoxicillin TDS 7 days generates 21 scheduled reminders across duration', async () => {
      const ocrResult = await ocrProvider.processImage({ fixture_key: 'SYN-02' });
      const parseResult = parse(ocrResult.raw_ocr_text);
      const saved = await savePrescriptionWithParseResult(
        db,
        testPatientId,
        testCaregiverId,
        ocrResult.raw_ocr_text,
        parseResult,
        ocrResult.confidence,
      );

      const medId = saved.medications[0].id;
      await confirmMedication(db, medId, testCaregiverId);
      await db('medications').where({ id: medId }).update({ schedule_derivable: true });
      await verifyPrescription(db, saved.prescription.id, testCaregiverId);

      const reminders = await db('reminders').where({ medication_id: medId });
      expect(reminders).toHaveLength(21);
    });

    it('[SYN-06] Paracetamol SOS generates 0 recurring reminders (SI-09)', async () => {
      const ocrResult = await ocrProvider.processImage({ fixture_key: 'SYN-06' });
      const parseResult = parse(ocrResult.raw_ocr_text);
      const saved = await savePrescriptionWithParseResult(
        db,
        testPatientId,
        testCaregiverId,
        ocrResult.raw_ocr_text,
        parseResult,
        ocrResult.confidence,
      );

      const medId = saved.medications[0].id;
      await confirmMedication(db, medId, testCaregiverId);
      await verifyPrescription(db, saved.prescription.id, testCaregiverId);

      const reminders = await db('reminders').where({ medication_id: medId });
      expect(reminders).toHaveLength(0);
    });

    it('[SYN-23] Contradiction BD OD flags verifier_action_required (SI-13)', async () => {
      const ocrResult = await ocrProvider.processImage({ fixture_key: 'SYN-23' });
      const parseResult = parse(ocrResult.raw_ocr_text);
      expect(parseResult.candidates[0].frequency_code).toBeNull();
      expect(parseResult.candidates[0].verifier_action_required).toBe(true);
      expect(parseResult.candidates[0].candidate_readings?.length).toBeGreaterThanOrEqual(2);
    });

    it('[SYN-28] Multi-Medication with 1 rejected candidate is strictly BLOCKED from verification (SI-01)', async () => {
      const ocrResult = await ocrProvider.processImage({ fixture_key: 'SYN-28' });
      const parseResult = parse(ocrResult.raw_ocr_text);
      const saved = await savePrescriptionWithParseResult(
        db,
        testPatientId,
        testCaregiverId,
        ocrResult.raw_ocr_text,
        parseResult,
        ocrResult.confidence,
      );

      expect(saved.medications).toHaveLength(2);

      // Confirm candidate 1, Reject candidate 2
      await confirmMedication(db, saved.medications[0].id, testCaregiverId);
      await rejectMedication(db, saved.medications[1].id, 'Contraindicated', testCaregiverId);

      // Attempt verification -> Must fail with SI-01 assertion
      await expect(
        verifyPrescription(db, saved.prescription.id, testCaregiverId),
      ).rejects.toThrow('Cannot verify prescription: medication has been rejected');

      // Prescription status remains pending_verification
      const prescription = await db('prescriptions').where({ id: saved.prescription.id }).first();
      expect(prescription?.status).toBe('pending_verification');
    });
  });
});
