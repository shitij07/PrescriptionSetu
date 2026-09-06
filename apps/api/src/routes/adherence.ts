/**
 * Adherence API Routes.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 7, `PercriptionSetuMASTERPLAN.md` §18.9, `SAFETY_INVARIANTS.md` SI-14, SI-15, SI-16.
 */

import { Router, type Request, type Response } from 'express';
import type { Knex } from 'knex';
import type { MessageProvider } from '../delivery/types';
import {
  recordAdherenceReply,
  getAdherenceLogsForMedication,
  getAdherenceSummaryForPatient,
} from '../adherence/service';

export function createAdherenceRouter(db: Knex, messageProvider?: MessageProvider): Router {
  const router = Router();

  /**
   * POST /api/adherence/reply
   * Ingests and classifies an inbound patient or caregiver reply.
   */
  router.post('/reply', async (req: Request, res: Response) => {
    try {
      const { reminder_id, medication_id, responder_caregiver_id, raw_reply_text, classification } =
        req.body || {};

      if (!raw_reply_text || typeof raw_reply_text !== 'string' || !raw_reply_text.trim()) {
        return res.status(400).json({
          error: 'RAW_REPLY_TEXT_REQUIRED',
          message: 'raw_reply_text is required and must be a non-empty string',
        });
      }

      const result = await recordAdherenceReply(
        db,
        {
          reminder_id: reminder_id ? String(reminder_id) : undefined,
          medication_id: medication_id ? String(medication_id) : undefined,
          responder_caregiver_id: responder_caregiver_id ? String(responder_caregiver_id) : undefined,
          raw_reply_text: String(raw_reply_text),
          classification,
        },
        messageProvider,
      );

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to record adherence reply',
      });
    }
  });

  /**
   * GET /api/adherence/medication/:id
   * Retrieves adherence logs for a specific medication.
   */
  router.get('/medication/:id', async (req: Request, res: Response) => {
    try {
      const medicationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const logs = await getAdherenceLogsForMedication(db, String(medicationId));
      return res.json({
        success: true,
        data: logs,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch adherence logs',
      });
    }
  });

  /**
   * GET /api/adherence/patient/:id
   * Retrieves adherence summary for a patient, excluding `needs_attention` from calculation.
   */
  router.get('/patient/:id', async (req: Request, res: Response) => {
    try {
      const patientId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const summary = await getAdherenceSummaryForPatient(db, String(patientId));
      return res.json({
        success: true,
        data: summary,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch patient adherence summary',
      });
    }
  });

  return router;
}
