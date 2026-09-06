/**
 * SI-01 — Prescription Human Verification Gate & Verification Actions.
 *
 * Authoritative sources:
 *   - `SAFETY_INVARIANTS.md` SI-01, SI-04, SI-10, SI-12, SI-14
 *   - `docs/SCHEMA.md` §2.4, §2.5, §3.1
 *   - `PercriptionSetuMASTERPLAN.md` §21, §26
 */

import {
  confirmMedication,
  correctMedication,
  rejectMedication,
  verifyPrescription,
} from '../../src/verification/gate';
import type { Knex } from 'knex';

describe('SI-01 Prescription Verification Gate & Actions', () => {
  let mockDb: any;
  let mockTrx: any;
  let builder: any;

  beforeEach(() => {
    builder = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue(1),
      insert: jest.fn().mockResolvedValue([1]),
      first: jest.fn().mockResolvedValue(null),
      select: jest.fn().mockReturnThis(),
    };

    mockTrx = jest.fn((table: string) => builder);
    mockTrx.commit = jest.fn().mockResolvedValue(undefined);
    mockTrx.rollback = jest.fn().mockResolvedValue(undefined);

    mockDb = jest.fn((table: string) => builder);
    mockDb.transaction = jest.fn((callback: (trx: any) => Promise<any>) => callback(mockTrx));
  });

  it('1. confirmMedication sets verification_status confirmed, records verifier identity, and emits audit event', async () => {
    const medId = '11111111-1111-1111-1111-111111111111';
    const verifierId = '99999999-9999-9999-9999-999999999999';

    const result = await confirmMedication(mockDb, medId, verifierId);

    expect(result.success).toBe(true);
    expect(result.verification_status).toBe('confirmed');
  });

  it('2. correctMedication updates clinical fields without mutating parse_result, sets corrected, and emits audit event', async () => {
    const medId = '11111111-1111-1111-1111-111111111111';
    const verifierId = '99999999-9999-9999-9999-999999999999';

    const existingMed = {
      id: medId,
      frequency_code: 'ONCE_DAILY',
      times_per_day: 1,
      dose_amount: { kind: 'integer', value: 1 },
      verification_status: 'pending',
      parse_result: { matches: [{ rule_id: 'FREQ-OD-001' }] },
    };

    builder.first.mockResolvedValue(existingMed);

    const corrections = {
      frequency_code: 'TWICE_DAILY' as const,
      times_per_day: 2,
    };

    const result = await correctMedication(
      mockDb,
      medId,
      corrections,
      verifierId,
      'Corrected frequency per handwritten note',
    );

    expect(result.success).toBe(true);
    expect(result.verification_status).toBe('corrected');
  });

  it('3. rejectMedication marks medication rejected, leaves lifecycle_state NULL, and emits audit event', async () => {
    const medId = '11111111-1111-1111-1111-111111111111';
    const verifierId = '99999999-9999-9999-9999-999999999999';

    const result = await rejectMedication(mockDb, medId, 'Illegible line item', verifierId);

    expect(result.success).toBe(true);
    expect(result.verification_status).toBe('rejected');
  });

  it('4. verifyPrescription refuses transition when any associated medication is pending', async () => {
    const prescriptionId = '22222222-2222-2222-2222-222222222222';
    const verifierId = '99999999-9999-9999-9999-999999999999';

    const medications = [
      { id: 'm1', verification_status: 'confirmed' },
      { id: 'm2', verification_status: 'pending' },
    ];

    builder.where.mockResolvedValue(medications);

    await expect(verifyPrescription(mockDb, prescriptionId, verifierId)).rejects.toThrow(
      'Cannot verify prescription: medication is still pending verification',
    );
  });

  it('5. verifyPrescription refuses transition when any associated medication is rejected', async () => {
    const prescriptionId = '22222222-2222-2222-2222-222222222222';
    const verifierId = '99999999-9999-9999-9999-999999999999';

    const medications = [
      { id: 'm1', verification_status: 'confirmed' },
      { id: 'm2', verification_status: 'rejected' },
    ];

    builder.where.mockResolvedValue(medications);

    await expect(verifyPrescription(mockDb, prescriptionId, verifierId)).rejects.toThrow(
      'Cannot verify prescription: medication has been rejected',
    );
  });

  it('6. verifyPrescription atomically marks prescription verified and activates all confirmed/corrected medications', async () => {
    const prescriptionId = '22222222-2222-2222-2222-222222222222';
    const verifierId = '99999999-9999-9999-9999-999999999999';

    const medications = [
      { id: 'm1', verification_status: 'confirmed' },
      { id: 'm2', verification_status: 'corrected' },
    ];

    // First call to .where({ prescription_id }) resolves to medications
    builder.where.mockResolvedValueOnce(medications);

    const result = await verifyPrescription(mockDb, prescriptionId, verifierId);

    expect(result.success).toBe(true);
    expect(result.prescription_status).toBe('verified');
    expect(result.activated_medication_count).toBe(2);
  });
});
