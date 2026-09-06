/**
 * Reminder Scheduler Unit & Pure Function Tests.
 * Authoritative sources: `PercriptionSetuMASTERPLAN.md` §18.6, §30, `BUILD_ORDER.md` §4 Step 5, `SAFETY_INVARIANTS.md` SI-02, SI-03.
 */

import { scheduleReminders } from '../../src/reminders/scheduler';
import type { MedicationRecord } from '../../src/domain/types';
import type { PatientMealTimes } from '../../src/reminders/types';

describe('Reminder Scheduler (scheduleReminders pure function)', () => {
  const baseActiveMedication: MedicationRecord = {
    id: '11111111-1111-1111-1111-111111111111',
    prescription_id: '22222222-2222-2222-2222-222222222222',
    drug_name: 'Paracetamol',
    drug_name_validation: 'matched',
    frequency_code: 'TWICE_DAILY',
    times_per_day: 2,
    timing_anchors: ['AFTER_MEAL'],
    dose_amount: { kind: 'integer', value: 1 },
    dose_unit: 'tablet',
    dose_strength_value: 500,
    dose_strength_unit: 'mg',
    duration_value: 1,
    duration_unit: 'day',
    duration_indefinite: false,
    as_needed: false,
    total_doses: 2,
    recurring: true,
    immediate: false,
    schedule_derivable: true,
    verifier_action_required: false,
    max_doses_per_day: null,
    min_interval_hours: null,
    parse_result: null,
    verification_status: 'confirmed',
    verified_by: '33333333-3333-3333-3333-333333333333',
    verified_at: new Date('2026-08-30T10:00:00Z'),
    lifecycle_state: 'active',
    superseded_by: null,
    lifecycle_reason: null,
    lifecycle_changed_at: new Date('2026-08-30T10:00:00Z'),
    created_at: new Date('2026-08-30T09:00:00Z'),
  };

  const defaultMealTimes: PatientMealTimes = {
    breakfast: '08:00',
    lunch: '13:00',
    dinner: '20:00',
    bedtime: '22:00',
  };

  const fixedStartDate = '2026-08-30';

  it('1. ONCE_DAILY medication produces 1 reminder per day at breakfast (08:00 IST)', () => {
    const med: MedicationRecord = {
      ...baseActiveMedication,
      frequency_code: 'ONCE_DAILY',
      times_per_day: 1,
      duration_value: 1,
    };

    const reminders = scheduleReminders(med, defaultMealTimes, { startDate: fixedStartDate });
    expect(reminders).toHaveLength(1);
    expect(reminders[0].scheduled_time).toBe('2026-08-30T08:00:00+05:30');
    expect(reminders[0].medication_id).toBe(med.id);
  });

  it('2. TWICE_DAILY medication produces 2 reminders per day at breakfast and dinner (08:00 and 20:00 IST)', () => {
    const med: MedicationRecord = {
      ...baseActiveMedication,
      frequency_code: 'TWICE_DAILY',
      times_per_day: 2,
      duration_value: 1,
    };

    const reminders = scheduleReminders(med, defaultMealTimes, { startDate: fixedStartDate });
    expect(reminders).toHaveLength(2);
    expect(reminders[0].scheduled_time).toBe('2026-08-30T08:00:00+05:30');
    expect(reminders[1].scheduled_time).toBe('2026-08-30T20:00:00+05:30');
  });

  it('3. THRICE_DAILY medication produces 3 reminders per day (08:00, 13:00, 20:00 IST)', () => {
    const med: MedicationRecord = {
      ...baseActiveMedication,
      frequency_code: 'THRICE_DAILY',
      times_per_day: 3,
      duration_value: 1,
    };

    const reminders = scheduleReminders(med, defaultMealTimes, { startDate: fixedStartDate });
    expect(reminders).toHaveLength(3);
    expect(reminders[0].scheduled_time).toBe('2026-08-30T08:00:00+05:30');
    expect(reminders[1].scheduled_time).toBe('2026-08-30T13:00:00+05:30');
    expect(reminders[2].scheduled_time).toBe('2026-08-30T20:00:00+05:30');
  });

  it('4. FOUR_TIMES_DAILY medication produces 4 reminders per day (06:00, 12:00, 18:00, 22:00 IST)', () => {
    const med: MedicationRecord = {
      ...baseActiveMedication,
      frequency_code: 'FOUR_TIMES_DAILY',
      times_per_day: 4,
      duration_value: 1,
    };

    const reminders = scheduleReminders(med, defaultMealTimes, { startDate: fixedStartDate });
    expect(reminders).toHaveLength(4);
    expect(reminders[0].scheduled_time).toBe('2026-08-30T06:00:00+05:30');
    expect(reminders[1].scheduled_time).toBe('2026-08-30T12:00:00+05:30');
    expect(reminders[2].scheduled_time).toBe('2026-08-30T18:00:00+05:30');
    expect(reminders[3].scheduled_time).toBe('2026-08-30T22:00:00+05:30');
  });

  it('5. uses patient-configured meal times instead of defaults when provided', () => {
    const customMealTimes: PatientMealTimes = {
      breakfast: '09:15',
      lunch: '14:00',
      dinner: '21:30',
      bedtime: '23:00',
    };

    const med: MedicationRecord = {
      ...baseActiveMedication,
      frequency_code: 'TWICE_DAILY',
      times_per_day: 2,
      duration_value: 1,
    };

    const reminders = scheduleReminders(med, customMealTimes, { startDate: fixedStartDate });
    expect(reminders).toHaveLength(2);
    expect(reminders[0].scheduled_time).toBe('2026-08-30T09:15:00+05:30');
    expect(reminders[1].scheduled_time).toBe('2026-08-30T21:30:00+05:30');
  });

  it('6. timing anchor BEDTIME schedules at patient bedtime', () => {
    const med: MedicationRecord = {
      ...baseActiveMedication,
      frequency_code: 'ONCE_DAILY',
      times_per_day: 1,
      timing_anchors: ['BEDTIME'],
      duration_value: 1,
    };

    const reminders = scheduleReminders(med, defaultMealTimes, { startDate: fixedStartDate });
    expect(reminders).toHaveLength(1);
    expect(reminders[0].scheduled_time).toBe('2026-08-30T22:00:00+05:30');
  });

  it('7. multiday duration generates reminders across each day in IST', () => {
    const med: MedicationRecord = {
      ...baseActiveMedication,
      frequency_code: 'ONCE_DAILY',
      times_per_day: 1,
      duration_value: 3,
      duration_unit: 'day',
    };

    const reminders = scheduleReminders(med, defaultMealTimes, { startDate: fixedStartDate });
    expect(reminders).toHaveLength(3);
    expect(reminders[0].scheduled_time).toBe('2026-08-30T08:00:00+05:30');
    expect(reminders[1].scheduled_time).toBe('2026-08-31T08:00:00+05:30');
    expect(reminders[2].scheduled_time).toBe('2026-09-01T08:00:00+05:30');
  });

  it('8. week duration generates 7 days per week of reminders', () => {
    const med: MedicationRecord = {
      ...baseActiveMedication,
      frequency_code: 'ONCE_DAILY',
      times_per_day: 1,
      duration_value: 1,
      duration_unit: 'week',
    };

    const reminders = scheduleReminders(med, defaultMealTimes, { startDate: fixedStartDate });
    expect(reminders).toHaveLength(7);
    expect(reminders[0].scheduled_time).toBe('2026-08-30T08:00:00+05:30');
    expect(reminders[6].scheduled_time).toBe('2026-09-05T08:00:00+05:30');
  });

  it('9. timestamps are explicitly Asia/Kolkata (+05:30) and timezone-safe', () => {
    const med: MedicationRecord = {
      ...baseActiveMedication,
      frequency_code: 'ONCE_DAILY',
    };

    const reminders = scheduleReminders(med, defaultMealTimes, { startDate: '2026-12-15' });
    expect(reminders[0].scheduled_time).toBe('2026-12-15T08:00:00+05:30');
    expect(reminders[0].scheduled_time.endsWith('+05:30')).toBe(true);
  });

  it('10. refuses unverified medication (verification_status: pending) returning empty schedule (SI-01, SI-02)', () => {
    const unverifiedMed: MedicationRecord = {
      ...baseActiveMedication,
      verification_status: 'pending',
      lifecycle_state: null,
    };

    const reminders = scheduleReminders(unverifiedMed, defaultMealTimes, { startDate: fixedStartDate });
    expect(reminders).toEqual([]);
  });

  it('11. refuses rejected medication (verification_status: rejected) returning empty schedule (SI-01, SI-02)', () => {
    const rejectedMed: MedicationRecord = {
      ...baseActiveMedication,
      verification_status: 'rejected',
      lifecycle_state: null,
    };

    const reminders = scheduleReminders(rejectedMed, defaultMealTimes, { startDate: fixedStartDate });
    expect(reminders).toEqual([]);
  });

  it('12. refuses inactive or stopped medication returning empty schedule (SI-02, SI-10)', () => {
    const stoppedMed: MedicationRecord = {
      ...baseActiveMedication,
      lifecycle_state: 'stopped',
    };

    const reminders = scheduleReminders(stoppedMed, defaultMealTimes, { startDate: fixedStartDate });
    expect(reminders).toEqual([]);
  });

  it('13. refuses conditional PRN/SOS medication with schedule_derivable === false (SI-03)', () => {
    const sosMed: MedicationRecord = {
      ...baseActiveMedication,
      as_needed: true,
      schedule_derivable: false,
    };

    const reminders = scheduleReminders(sosMed, defaultMealTimes, { startDate: fixedStartDate });
    expect(reminders).toEqual([]);
  });

  it('14. refuses STAT single-dose medication with schedule_derivable === false (SI-03, SI-09)', () => {
    const statMed: MedicationRecord = {
      ...baseActiveMedication,
      immediate: true,
      recurring: false,
      schedule_derivable: false,
    };

    const reminders = scheduleReminders(statMed, defaultMealTimes, { startDate: fixedStartDate });
    expect(reminders).toEqual([]);
  });

  it('15. refuses unpromoted/ambiguous schedule_derivable === null returning empty schedule (SI-03)', () => {
    const nullSchedMed: MedicationRecord = {
      ...baseActiveMedication,
      schedule_derivable: null,
    };

    const reminders = scheduleReminders(nullSchedMed, defaultMealTimes, { startDate: fixedStartDate });
    expect(reminders).toEqual([]);
  });

  it('16. preserves dose_amount, dose_unit, and medication_id in every generated reminder', () => {
    const med: MedicationRecord = {
      ...baseActiveMedication,
      dose_amount: { kind: 'fraction', numerator: 1, denominator: 2 },
      dose_unit: 'tablet',
    };

    const reminders = scheduleReminders(med, defaultMealTimes, { startDate: fixedStartDate });
    expect(reminders).toHaveLength(2);
    expect(reminders[0].dose_amount).toEqual({ kind: 'fraction', numerator: 1, denominator: 2 });
    expect(reminders[0].dose_unit).toBe('tablet');
    expect(reminders[0].medication_id).toBe(med.id);
  });

  it('17. pure function behavior: identical inputs always produce identical outputs', () => {
    const res1 = scheduleReminders(baseActiveMedication, defaultMealTimes, { startDate: fixedStartDate });
    const res2 = scheduleReminders(baseActiveMedication, defaultMealTimes, { startDate: fixedStartDate });
    expect(res1).toEqual(res2);
  });

  it('18. deduplicates identical timestamps if anchors overlap', () => {
    const med: MedicationRecord = {
      ...baseActiveMedication,
      frequency_code: 'ONCE_DAILY',
      timing_anchors: ['BEFORE_MEAL', 'AFTER_MEAL'],
    };

    const reminders = scheduleReminders(med, defaultMealTimes, { startDate: fixedStartDate });
    const times = reminders.map((r) => r.scheduled_time);
    const uniqueTimes = Array.from(new Set(times));
    expect(times.length).toBe(uniqueTimes.length);
  });
});
