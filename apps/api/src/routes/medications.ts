/**
 * Medication Express Routes & Controllers.
 * Authoritative sources: `PercriptionSetuMASTERPLAN.md` §18.5, `docs/SCHEMA.md`, `SAFETY_INVARIANTS.md`.
 */

import { Router, Request, Response, NextFunction } from 'express';
import type { Knex } from 'knex';
import { confirmMedication, correctMedication, rejectMedication, stopMedication } from '../verification/gate';
import { getMedicationById } from '../db/repository';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_CORRECTION_FIELDS = new Set([
  'drug_name',
  'frequency_code',
  'times_per_day',
  'timing_anchors',
  'dose_amount',
  'dose_unit',
  'dose_strength_value',
  'dose_strength_unit',
  'duration_value',
  'duration_unit',
  'duration_indefinite',
  'as_needed',
  'max_doses_per_day',
  'min_interval_hours',
]);

export function createMedicationsRouter(db: Knex): Router {
  const router = Router();

  /**
   * POST /api/medications/:id/confirm
   * Confirms a parsed medication line as-is.
   */
  router.post('/:id/confirm', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { verifier_caregiver_id } = req.body;

      if (!id || !UUID_REGEX.test(id)) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Invalid medication UUID' },
        });
      }

      if (!verifier_caregiver_id || !UUID_REGEX.test(verifier_caregiver_id)) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Valid verifier_caregiver_id UUID is required' },
        });
      }

      const existing = await getMedicationById(db, id);
      if (!existing) {
        return res.status(404).json({
          error: { code: 'RESOURCE_NOT_FOUND', message: 'Medication not found' },
        });
      }

      const result = await confirmMedication(db, id, verifier_caregiver_id);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/medications/:id/correct
   * Human correction of one or more clinical fields on a medication line item.
   */
  router.post('/:id/correct', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { verifier_caregiver_id, corrections, reason } = req.body;

      if (!id || !UUID_REGEX.test(id)) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Invalid medication UUID' },
        });
      }

      if (!verifier_caregiver_id || !UUID_REGEX.test(verifier_caregiver_id)) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Valid verifier_caregiver_id UUID is required' },
        });
      }

      if (!corrections || typeof corrections !== 'object') {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: "A 'corrections' object is required" },
        });
      }

      // Validate that only allowed clinical fields are included in corrections
      for (const field of Object.keys(corrections)) {
        if (!ALLOWED_CORRECTION_FIELDS.has(field)) {
          return res.status(422).json({
            error: {
              code: 'INVALID_CORRECTION_FIELD',
              message: `Field '${field}' cannot be modified via clinical correction`,
            },
          });
        }
      }

      const existing = await getMedicationById(db, id);
      if (!existing) {
        return res.status(404).json({
          error: { code: 'RESOURCE_NOT_FOUND', message: 'Medication not found' },
        });
      }

      const result = await correctMedication(db, id, corrections, verifier_caregiver_id, reason);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/medications/:id/reject
   * Rejects a medication line item.
   */
  router.post('/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { verifier_caregiver_id, reason } = req.body;

      if (!id || !UUID_REGEX.test(id)) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Invalid medication UUID' },
        });
      }

      if (!verifier_caregiver_id || !UUID_REGEX.test(verifier_caregiver_id)) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Valid verifier_caregiver_id UUID is required' },
        });
      }

      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Rejection reason is required' },
        });
      }

      const existing = await getMedicationById(db, id);
      if (!existing) {
        return res.status(404).json({
          error: { code: 'RESOURCE_NOT_FOUND', message: 'Medication not found' },
        });
      }

      const result = await rejectMedication(db, id, reason, verifier_caregiver_id);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/medications/:id/stop
   * Transactionally stops an active medication and cancels its pending reminders (SI-10, SI-11).
   */
  router.post('/:id/stop', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { caregiver_id, reason } = req.body;

      if (!id || !UUID_REGEX.test(id)) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Invalid medication UUID' },
        });
      }

      if (!caregiver_id || !UUID_REGEX.test(caregiver_id)) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Valid caregiver_id UUID is required' },
        });
      }

      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Stop reason is required' },
        });
      }

      const existing = await getMedicationById(db, id);
      if (!existing) {
        return res.status(404).json({
          error: { code: 'RESOURCE_NOT_FOUND', message: 'Medication not found' },
        });
      }

      if (existing.lifecycle_state !== 'active') {
        return res.status(422).json({
          error: {
            code: 'INVALID_LIFECYCLE_TRANSITION',
            message: `Cannot stop medication: current lifecycle state is '${existing.lifecycle_state || 'null'}' (only active medications can be stopped)`,
          },
        });
      }

      const result = await stopMedication(db, id, caregiver_id, reason.trim());
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

