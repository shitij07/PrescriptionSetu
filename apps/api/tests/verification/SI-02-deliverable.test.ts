/**
 * SI-02 / SI-03 / SI-15 — Patient-facing Deliverability & Reminder Generation Guards.
 *
 * Authoritative sources:
 *   - `SAFETY_INVARIANTS.md` SI-01, SI-02, SI-03, SI-15
 *   - `docs/SCHEMA.md` §2.5 (Deliverable predicate)
 *   - `PercriptionSetuMASTERPLAN.md` §26
 */

import {
  assertPrescriptionVerifiable,
  canGenerateReminders,
  isMedicationDeliverable,
} from '../../src/verification/guards';
import type { MedicationRecord, VerificationStatus, LifecycleState } from '../../src/domain/types';

function createMockMedication(overrides?: Partial<MedicationRecord>): MedicationRecord {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    prescription_id: '22222222-2222-2222-2222-222222222222',
    drug_name: 'Metformin',
    drug_name_validation: 'matched',
    frequency_code: 'TWICE_DAILY',
    times_per_day: 2,
    timing_anchors: ['AFTER_MEAL'],
    dose_amount: { kind: 'integer', value: 1 },
    dose_unit: 'tablet',
    dose_strength_value: 500,
    dose_strength_unit: 'mg',
    duration_value: 5,
    duration_unit: 'day',
    duration_indefinite: null,
    as_needed: null,
    total_doses: null,
    recurring: true,
    immediate: null,
    schedule_derivable: true,
    verifier_action_required: null,
    max_doses_per_day: null,
    min_interval_hours: null,
    parse_result: {},
    verification_status: 'pending',
    verified_by: null,
    verified_at: null,
    lifecycle_state: null,
    superseded_by: null,
    lifecycle_reason: null,
    lifecycle_changed_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('SI-02 / SI-03 Deliverability & Reminder Generation Guards', () => {
  it('1. returns false for pending medication', () => {
    const med = createMockMedication({ verification_status: 'pending', lifecycle_state: 'active' });
    expect(isMedicationDeliverable(med)).toBe(false);
  });

  it('2. returns false for rejected medication', () => {
    const med = createMockMedication({ verification_status: 'rejected', lifecycle_state: 'active' });
    expect(isMedicationDeliverable(med)).toBe(false);
  });

  it('3. returns false for confirmed medication with lifecycle_state NULL (pre-activation)', () => {
    const med = createMockMedication({ verification_status: 'confirmed', lifecycle_state: null });
    expect(isMedicationDeliverable(med)).toBe(false);
  });

  it('4. returns false for corrected medication with lifecycle_state NULL (pre-activation)', () => {
    const med = createMockMedication({ verification_status: 'corrected', lifecycle_state: null });
    expect(isMedicationDeliverable(med)).toBe(false);
  });

  it('5. returns false for confirmed medication with stopped lifecycle_state', () => {
    const med = createMockMedication({ verification_status: 'confirmed', lifecycle_state: 'stopped' });
    expect(isMedicationDeliverable(med)).toBe(false);
  });

  it('6. returns false for confirmed medication with superseded lifecycle_state', () => {
    const med = createMockMedication({ verification_status: 'confirmed', lifecycle_state: 'superseded' });
    expect(isMedicationDeliverable(med)).toBe(false);
  });

  it('7. returns false for confirmed medication with completed lifecycle_state', () => {
    const med = createMockMedication({ verification_status: 'confirmed', lifecycle_state: 'completed' });
    expect(isMedicationDeliverable(med)).toBe(false);
  });

  it('8. returns true for corrected + active medication', () => {
    const med = createMockMedication({ verification_status: 'corrected', lifecycle_state: 'active' });
    expect(isMedicationDeliverable(med)).toBe(true);
  });

  it('9. returns true for confirmed + active medication', () => {
    const med = createMockMedication({ verification_status: 'confirmed', lifecycle_state: 'active' });
    expect(isMedicationDeliverable(med)).toBe(true);
  });

  it('10. returns false from canGenerateReminders when schedule_derivable is false (e.g. SOS / STAT)', () => {
    const med = createMockMedication({
      verification_status: 'confirmed',
      lifecycle_state: 'active',
      schedule_derivable: false,
    });
    expect(isMedicationDeliverable(med)).toBe(true);
    expect(canGenerateReminders(med)).toBe(false);
  });

  it('11. returns true from canGenerateReminders for deliverable medication with schedule_derivable true', () => {
    const med = createMockMedication({
      verification_status: 'confirmed',
      lifecycle_state: 'active',
      schedule_derivable: true,
    });
    expect(canGenerateReminders(med)).toBe(true);
  });

  it('12. assertPrescriptionVerifiable rejects when any medication is pending or rejected', () => {
    const mConfirmed = createMockMedication({ verification_status: 'confirmed' });
    const mPending = createMockMedication({ verification_status: 'pending' });
    const mRejected = createMockMedication({ verification_status: 'rejected' });

    // Empty list
    expect(() => assertPrescriptionVerifiable([])).toThrow('Prescription has no medications');

    // Pending medication present
    expect(() => assertPrescriptionVerifiable([mConfirmed, mPending])).toThrow(
      'Cannot verify prescription: medication is still pending verification',
    );

    // Rejected medication present
    expect(() => assertPrescriptionVerifiable([mConfirmed, mRejected])).toThrow(
      'Cannot verify prescription: medication has been rejected',
    );

    // All confirmed / corrected -> passes without throwing
    const mCorrected = createMockMedication({ verification_status: 'corrected' });
    expect(() => assertPrescriptionVerifiable([mConfirmed, mCorrected])).not.toThrow();
  });
});
