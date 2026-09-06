/**
 * Prescription Express Routes & Controllers.
 * Authoritative sources: `PercriptionSetuMASTERPLAN.md` §18.1, §18.5, `docs/SCHEMA.md`, `SAFETY_INVARIANTS.md`.
 */

import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import type { Knex } from 'knex';
import type { OcrProvider } from '../ocr/types';
import { parse } from '../parser/parse';
import {
  savePrescriptionWithParseResult,
  getPendingPrescriptions,
  getPrescriptionDetailWithMedications,
} from '../db/repository';
import { formatMedicationForDashboard } from '../verification/display';
import { verifyPrescription } from '../verification/gate';
import { createRateLimiter } from '../middleware/rate-limiter';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createPrescriptionsRouter(
  db: Knex,
  ocrProvider: OcrProvider,
  rateLimiterMiddleware: RequestHandler = createRateLimiter(),
): Router {
  const router = Router();

  /**
   * POST /api/prescriptions/upload
   * Ingests a prescription image/fixture, runs OCR, parses shorthand, and persists pending records.
   */
  router.post('/upload', rateLimiterMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { patient_id, caregiver_id, fixture_key, raw_text } = req.body;

      if (!patient_id || !caregiver_id) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: "Both 'patient_id' and 'caregiver_id' are required",
          },
        });
      }

      if (!UUID_REGEX.test(patient_id) || !UUID_REGEX.test(caregiver_id)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Identifiers must be valid UUIDs',
          },
        });
      }

      // 1. Run OCR perception
      const ocrInput = fixture_key ? { fixture_key } : { raw_text };
      const ocrResult = await ocrProvider.processImage(ocrInput);

      // 2. Parse raw OCR text (OCR confidence is NEVER passed to parse())
      const parseResult = parse(ocrResult.raw_ocr_text);

      // 3. Persist prescription and candidates
      const saved = await savePrescriptionWithParseResult(
        db,
        patient_id,
        caregiver_id,
        ocrResult.raw_ocr_text,
        parseResult,
        ocrResult.confidence,
        ocrResult.metadata || null,
      );

      return res.status(201).json({
        prescription: saved.prescription,
        medications: saved.medications,
        unparsed_fragments: parseResult.unparsed_fragments || [],
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/prescriptions/pending
   * Retrieves all prescriptions awaiting human verification.
   */
  router.get('/pending', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const caregiverId = typeof req.query.caregiver_id === 'string' ? req.query.caregiver_id : undefined;
      const pending = await getPendingPrescriptions(db, caregiverId);
      return res.status(200).json({ prescriptions: pending });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/prescriptions/:id
   * Retrieves full verification details for a prescription.
   */
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id || !UUID_REGEX.test(id)) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Invalid prescription UUID' },
        });
      }

      const detail = await getPrescriptionDetailWithMedications(db, id);
      if (!detail) {
        return res.status(404).json({
          error: { code: 'RESOURCE_NOT_FOUND', message: 'Prescription not found' },
        });
      }

      const formattedMedications = detail.medications.map(formatMedicationForDashboard);

      return res.status(200).json({
        prescription: detail.prescription,
        medications: formattedMedications,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/prescriptions/:id/verify
   * Evaluates the SI-01 gate and atomically verifies the prescription.
   */
  router.post('/:id/verify', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { verifier_caregiver_id } = req.body;

      if (!verifier_caregiver_id || !UUID_REGEX.test(verifier_caregiver_id)) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Valid verifier_caregiver_id UUID is required' },
        });
      }

      if (!id || !UUID_REGEX.test(id)) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Invalid prescription UUID' },
        });
      }

      const result = await verifyPrescription(db, id, verifier_caregiver_id);
      return res.status(200).json(result);
    } catch (err: any) {
      if (err.message && err.message.includes('Cannot verify prescription')) {
        return res.status(422).json({
          error: {
            code: 'VERIFICATION_GATE_REJECTED',
            message: err.message,
          },
        });
      }
      next(err);
    }
  });

  return router;
}
