/**
 * Clinical Audit Trail API Routes (SI-14, SI-16).
 * Authoritative sources: `SAFETY_INVARIANTS.md` SI-14, SI-16, `BUILD_ORDER.md` §4 Step 8,
 * `docs/SCHEMA.md` §3.1, `docs/DECISIONS.md` D-016, D-031, D-033, D-034.
 */

import { Router, Request, Response, NextFunction } from 'express';
import type { Knex } from 'knex';
import { Logger, defaultLogger } from '../logging/logger';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_EVENT_TYPES = new Set([
  'all',
  'parsed',
  'confirmed',
  'corrected',
  'rejected',
  'stopped',
  'superseded',
  'completed',
  'revised',
  'erasure',
]);

export function createAuditRouter(db: Knex, logger: Logger = defaultLogger): Router {
  const router = Router();

  /**
   * GET /api/audit
   * Returns paginated, reverse-chronological clinical audit events with enriched context and summary statistics.
   * All search and filter parameters are strictly parameterized through Knex query builders.
   * Zero PHI is written to application logs (SI-16).
   */
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        event_type = 'all',
        patient_id,
        medication_id,
        search,
        limit = '50',
        offset = '0',
      } = req.query;

      // 1. Validate event_type parameter
      const eventTypeStr = String(event_type).toLowerCase();
      if (!ALLOWED_EVENT_TYPES.has(eventTypeStr)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_EVENT_TYPE',
            message: `Event type '${eventTypeStr}' is not supported. Allowed: ${Array.from(ALLOWED_EVENT_TYPES).join(', ')}`,
          },
        });
      }

      // 2. Validate UUID filters if provided
      if (patient_id && !UUID_REGEX.test(String(patient_id))) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PATIENT_ID',
            message: 'Patient ID must be a valid UUID format',
          },
        });
      }

      if (medication_id && !UUID_REGEX.test(String(medication_id))) {
        return res.status(400).json({
          error: {
            code: 'INVALID_MEDICATION_ID',
            message: 'Medication ID must be a valid UUID format',
          },
        });
      }

      // 3. Parse pagination with safe bounds
      const parsedLimit = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 200);
      const parsedOffset = Math.max(parseInt(String(offset), 10) || 0, 0);

      // 4. Build base query with relational joins for audit enrichment
      const baseQuery = db('medication_audit_events as mae')
        .leftJoin('medications as m', 'm.id', 'mae.medication_id')
        .leftJoin('prescriptions as p', 'p.id', 'm.prescription_id')
        .leftJoin('patients as pt', 'pt.id', 'p.patient_id')
        .leftJoin('caregivers as c', 'c.id', 'mae.actor_caregiver_id');

      // 5. Apply parameterized filters
      if (eventTypeStr === 'erasure') {
        baseQuery.where('mae.reason', 'PATIENT_ERASURE_REQUEST');
      } else if (eventTypeStr !== 'all') {
        baseQuery.where('mae.event_type', eventTypeStr);
      }

      if (patient_id) {
        baseQuery.where('p.patient_id', String(patient_id));
      }

      if (medication_id) {
        baseQuery.where('mae.medication_id', String(medication_id));
      }

      if (typeof search === 'string' && search.trim()) {
        const term = `%${search.trim()}%`;
        baseQuery.where((qb) => {
          qb.whereILike('m.drug_name', term)
            .orWhereILike('pt.full_name', term)
            .orWhereILike('mae.reason', term)
            .orWhereILike('c.full_name', term);
        });
      }

      // 6. Compute filtered total count
      const countResult = await baseQuery.clone().count<{ count: string | number }>('mae.id as count').first();
      const filteredTotal = Number(countResult?.count || 0);

      // 7. Select enriched audit event fields
      const events = await baseQuery
        .select(
          'mae.id',
          'mae.medication_id',
          'm.prescription_id',
          'p.patient_id',
          db.raw("COALESCE(pt.full_name, '[UNKNOWN_PATIENT]') as patient_name"),
          db.raw(
            "COALESCE(m.drug_name, mae.old_value->>'drug_name', mae.new_value->>'drug_name', 'Unspecified Medication') as drug_name",
          ),
          'mae.event_type',
          'mae.field_name',
          'mae.old_value',
          'mae.new_value',
          'mae.actor_caregiver_id',
          db.raw("COALESCE(c.full_name, 'System (Deterministic Parser)') as actor_name"),
          'mae.reason',
          'mae.created_at',
        )
        .orderBy('mae.created_at', 'desc')
        .limit(parsedLimit)
        .offset(parsedOffset);

      // 8. Compute overall summary statistics across the entire audit table
      const summaryResult = await db('medication_audit_events as mae')
        .select(
          db.raw('COUNT(*)::int as total_events'),
          db.raw("COUNT(CASE WHEN mae.event_type = 'corrected' THEN 1 END)::int as corrections_count"),
          db.raw("COUNT(CASE WHEN mae.event_type = 'stopped' THEN 1 END)::int as stops_count"),
          db.raw("COUNT(CASE WHEN mae.event_type = 'rejected' THEN 1 END)::int as rejections_count"),
          db.raw("COUNT(CASE WHEN mae.event_type = 'confirmed' THEN 1 END)::int as confirmations_count"),
          db.raw("COUNT(CASE WHEN mae.reason = 'PATIENT_ERASURE_REQUEST' THEN 1 END)::int as erasures_count"),
        )
        .first();

      const summary = {
        total_events: Number(summaryResult?.total_events || 0),
        corrections_count: Number(summaryResult?.corrections_count || 0),
        stops_count: Number(summaryResult?.stops_count || 0),
        rejections_count: Number(summaryResult?.rejections_count || 0),
        confirmations_count: Number(summaryResult?.confirmations_count || 0),
        erasures_count: Number(summaryResult?.erasures_count || 0),
      };

      // 9. Structured operational logging strictly without PHI (SI-16)
      logger.info('AUDIT_LOG_ACCESSED', {
        action: 'audit_log_query',
        count: events.length,
      });

      return res.status(200).json({
        events,
        total: filteredTotal,
        summary,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/audit/:id
   * Retrieves single audit event by UUID.
   */
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      if (!UUID_REGEX.test(id)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_AUDIT_EVENT_ID',
            message: 'Audit event ID must be a valid UUID format',
          },
        });
      }

      const event = await db('medication_audit_events as mae')
        .leftJoin('medications as m', 'm.id', 'mae.medication_id')
        .leftJoin('prescriptions as p', 'p.id', 'm.prescription_id')
        .leftJoin('patients as pt', 'pt.id', 'p.patient_id')
        .leftJoin('caregivers as c', 'c.id', 'mae.actor_caregiver_id')
        .where('mae.id', id)
        .select(
          'mae.id',
          'mae.medication_id',
          'm.prescription_id',
          'p.patient_id',
          db.raw("COALESCE(pt.full_name, '[UNKNOWN_PATIENT]') as patient_name"),
          db.raw(
            "COALESCE(m.drug_name, mae.old_value->>'drug_name', mae.new_value->>'drug_name', 'Unspecified Medication') as drug_name",
          ),
          'mae.event_type',
          'mae.field_name',
          'mae.old_value',
          'mae.new_value',
          'mae.actor_caregiver_id',
          db.raw("COALESCE(c.full_name, 'System (Deterministic Parser)') as actor_name"),
          'mae.reason',
          'mae.created_at',
        )
        .first();

      if (!event) {
        return res.status(404).json({
          error: {
            code: 'AUDIT_EVENT_NOT_FOUND',
            message: `Audit event with id ${id} not found`,
          },
        });
      }

      return res.status(200).json({
        event,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
