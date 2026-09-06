/**
 * Patient API Routes (DPDP Erasure & Management).
 * Authoritative sources: `PercriptionSetuMASTERPLAN.md` §26, `docs/SCHEMA.md` §2.1, §10, `SAFETY_INVARIANTS.md` SI-10, SI-11, SI-14.
 */

import { Router, Request, Response, NextFunction } from 'express';
import type { Knex } from 'knex';
import { deletePatient } from '../retention/service';
import { formatMedicationForDashboard } from '../verification/display';
import { Logger, defaultLogger } from '../logging/logger';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const E164_PHONE_REGEX = /^\+[1-9]\d{1,14}$/;
const TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ALLOWED_MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'bedtime'];

export function createPatientsRouter(db: Knex, logger: Logger = defaultLogger): Router {
  const router = Router();

  /**
   * GET /api/patients
   * Returns list of non-deleted registered patients.
   */
  router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const patients = await db('patients')
        .whereNull('deleted_at')
        .select(
          'id',
          'full_name',
          'phone_number',
          'preferred_language',
          'meal_times',
          'created_at',
          'updated_at',
        )
        .orderBy('created_at', 'desc');

      return res.status(200).json({
        patients,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/patients
   * Registers a new patient record.
   * Authoritative source: docs/API_CONTRACTS.md §13.6, SCHEMA.md §2.1, OQ-05 boundary.
   */
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawFullName = req.body?.full_name;
      if (typeof rawFullName !== 'string' || !rawFullName.trim() || rawFullName.trim().length > 200) {
        return res.status(400).json({
          error: {
            code: 'INVALID_FULL_NAME',
            message: 'Patient full name is required (1-200 characters)',
          },
        });
      }
      const fullName = rawFullName.trim();

      let phoneNumber: string | null = null;
      if (req.body?.phone_number !== undefined && req.body?.phone_number !== null) {
        if (typeof req.body.phone_number !== 'string') {
          return res.status(400).json({
            error: {
              code: 'INVALID_PHONE_NUMBER',
              message: 'Phone number must be a string or null',
            },
          });
        }
        const trimmedPhone = req.body.phone_number.trim();
        if (trimmedPhone.length > 0) {
          if (!E164_PHONE_REGEX.test(trimmedPhone)) {
            return res.status(400).json({
              error: {
                code: 'INVALID_PHONE_NUMBER',
                message: 'Phone number must be in E.164 format (e.g. +910000000019)',
              },
            });
          }
          phoneNumber = trimmedPhone;
        }
      }

      let preferredLanguage = 'mr';
      if (req.body?.preferred_language !== undefined && req.body?.preferred_language !== null) {
        if (typeof req.body.preferred_language !== 'string' || !['mr', 'en'].includes(req.body.preferred_language)) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PREFERRED_LANGUAGE',
              message: "Preferred language must be 'mr' or 'en'",
            },
          });
        }
        preferredLanguage = req.body.preferred_language;
      }

      let mealTimes: Record<string, string> | null = null;
      if (req.body?.meal_times !== undefined && req.body?.meal_times !== null) {
        if (typeof req.body.meal_times !== 'object' || Array.isArray(req.body.meal_times)) {
          return res.status(400).json({
            error: {
              code: 'INVALID_MEAL_TIMES',
              message: 'Meal times must be an object',
            },
          });
        }
        const validatedMeals: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.body.meal_times)) {
          if (!ALLOWED_MEAL_SLOTS.includes(key)) {
            return res.status(400).json({
              error: {
                code: 'INVALID_MEAL_TIMES',
                message: `Unknown meal time slot: ${key}`,
              },
            });
          }
          if (typeof value !== 'string' || !TIME_REGEX.test(value)) {
            return res.status(400).json({
              error: {
                code: 'INVALID_MEAL_TIMES',
                message: `Slot '${key}' must be a valid 24-hour time in HH:mm format`,
              },
            });
          }
          validatedMeals[key] = value;
        }
        mealTimes = validatedMeals;
      }

      const [newPatient] = await db('patients')
        .insert({
          full_name: fullName,
          phone_number: phoneNumber,
          preferred_language: preferredLanguage,
          meal_times: mealTimes ? JSON.stringify(mealTimes) : null,
        })
        .returning('*');

      logger.info('PATIENT_CREATED', {
        action: 'patient_created',
        patient_id: newPatient.id,
      });

      return res.status(201).json({
        patient: {
          id: newPatient.id,
          full_name: newPatient.full_name,
          phone_number: newPatient.phone_number,
          preferred_language: newPatient.preferred_language,
          meal_times: typeof newPatient.meal_times === 'string'
            ? JSON.parse(newPatient.meal_times)
            : newPatient.meal_times,
          created_at: newPatient.created_at,
          updated_at: newPatient.updated_at,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/patients/:id
   * Returns patient clinical profile by UUID.
   */
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;

      if (!id || typeof id !== 'string' || !UUID_REGEX.test(id)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PATIENT_ID',
            message: 'A valid patient UUID is required',
          },
        });
      }

      const patient = await db('patients')
        .where({ id })
        .whereNull('deleted_at')
        .first();

      if (!patient) {
        return res.status(404).json({
          error: {
            code: 'PATIENT_NOT_FOUND',
            message: 'Patient record not found',
          },
        });
      }

      // Count active prescriptions
      const [rxCount] = await db('prescriptions')
        .where({ patient_id: id })
        .count('id as count');

      // Query deliverable active medications (SI-02, SI-15, SCHEMA §2.5)
      const activeMedications = await db('medications')
        .innerJoin('prescriptions', 'prescriptions.id', 'medications.prescription_id')
        .where('prescriptions.patient_id', id)
        .whereIn('medications.verification_status', ['confirmed', 'corrected'])
        .where('medications.lifecycle_state', 'active')
        .select('medications.*')
        .orderBy('medications.created_at', 'desc');

      const formattedMedications = activeMedications.map((med) =>
        formatMedicationForDashboard(med),
      );

      return res.status(200).json({
        patient: {
          id: patient.id,
          full_name: patient.full_name,
          phone_number: patient.phone_number,
          preferred_language: patient.preferred_language,
          meal_times:
            typeof patient.meal_times === 'string'
              ? JSON.parse(patient.meal_times)
              : patient.meal_times,
          created_at: patient.created_at,
          updated_at: patient.updated_at,
        },
        active_prescriptions_count: Number(rxCount?.count || 0),
        active_medications: formattedMedications,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * DELETE /api/patients/:id
   * Executes a DPDP right-to-erasure request for the patient:
   * 1. Redacts personal identifiers (name to [DELETED_PATIENT], nullifies phone and meal_times).
   * 2. Halts all pending WhatsApp reminders immediately (SI-10, SI-11).
   * 3. Transitions active medications to 'stopped' with reason 'PATIENT_ERASURE_REQUEST'.
   * 4. Logs immutable compliance audit events in medication_audit_events (SI-14).
   * 5. Unlinks patient_caregivers associations.
   */
  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;

      if (!id || typeof id !== 'string' || !UUID_REGEX.test(id)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PATIENT_ID',
            message: 'A valid patient UUID is required',
          },
        });
      }

      const actorCaregiverId =
        req.body?.caregiver_id ||
        (req.headers?.['x-caregiver-id'] as string) ||
        undefined;

      const result = await deletePatient(db, id, actorCaregiverId);

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      if (err.message === 'PATIENT_NOT_FOUND') {
        return res.status(404).json({
          error: {
            code: 'PATIENT_NOT_FOUND',
            message: 'Patient record not found',
          },
        });
      }
      next(err);
    }
  });

  return router;
}
