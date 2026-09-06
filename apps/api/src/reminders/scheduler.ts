/**
 * Pure Reminder Scheduling Function.
 * Authoritative sources: `PercriptionSetuMASTERPLAN.md` §18.6, §30, `SAFETY_INVARIANTS.md` SI-02, SI-03.
 *
 * CRITICAL SAFETY RULES:
 * 1. PURE FUNCTION: Deterministic, no DB calls, no network, no side effects.
 * 2. EXPLICIT IST TIMEZONE: All concrete timestamps are generated in Asia/Kolkata (+05:30).
 * 3. DELIVERABILITY GUARD: Reminders are NEVER created for non-deliverable or non-schedulable medications.
 */

import type { MedicationRecord } from '../domain/types';
import { canGenerateReminders } from '../verification/guards';
import type { PatientMealTimes, ScheduledReminder, ScheduleOptions } from './types';

const DEFAULT_MEAL_TIMES: Required<PatientMealTimes> = {
  breakfast: '08:00',
  lunch: '13:00',
  dinner: '20:00',
  bedtime: '22:00',
};

const FOUR_TIMES_SLOTS = ['06:00', '12:00', '18:00', '22:00'];

/**
 * Converts a date string or Date object into a YYYY-MM-DD string in IST.
 */
function getIstDateString(dateInput?: string | Date): string {
  if (!dateInput) {
    // Current UTC time offset to IST (+5:30)
    const now = new Date();
    const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    return istTime.toISOString().slice(0, 10);
  }

  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }

  const d = new Date(dateInput);
  const istTime = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return istTime.toISOString().slice(0, 10);
}

/**
 * Adds N days to a YYYY-MM-DD date string.
 */
function addDays(baseDateStr: string, daysToAdd: number): string {
  const [year, month, day] = baseDateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + daysToAdd));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Pure function computing concrete reminder timestamps for an active, confirmed medication.
 *
 * @param medication The deliverable MedicationRecord.
 * @param patientMealTimes Configured meal and bedtime anchors.
 * @param options Optional scheduling window and start date.
 * @returns Array of concrete scheduled reminder objects.
 */
export function scheduleReminders(
  medication: MedicationRecord,
  patientMealTimes?: PatientMealTimes | null,
  options?: ScheduleOptions,
): ScheduledReminder[] {
  // 1. Enforce SI-02 / SI-03 deliverability and reminder-generation guard
  if (!canGenerateReminders(medication)) {
    return [];
  }

  // 2. Resolve meal and bedtime anchors
  const meals: Required<PatientMealTimes> = {
    breakfast: patientMealTimes?.breakfast || DEFAULT_MEAL_TIMES.breakfast,
    lunch: patientMealTimes?.lunch || DEFAULT_MEAL_TIMES.lunch,
    dinner: patientMealTimes?.dinner || DEFAULT_MEAL_TIMES.dinner,
    bedtime: patientMealTimes?.bedtime || DEFAULT_MEAL_TIMES.bedtime,
  };

  // 3. Determine daily time slots
  const timingAnchors = medication.timing_anchors || [];
  const hasBedtimeAnchor = timingAnchors.includes('BEDTIME');

  let dailySlots: string[] = [];

  if (hasBedtimeAnchor) {
    dailySlots = [meals.bedtime];
  } else {
    switch (medication.frequency_code) {
      case 'ONCE_DAILY':
        dailySlots = [meals.breakfast];
        break;
      case 'TWICE_DAILY':
        dailySlots = [meals.breakfast, meals.dinner];
        break;
      case 'THRICE_DAILY':
        dailySlots = [meals.breakfast, meals.lunch, meals.dinner];
        break;
      case 'FOUR_TIMES_DAILY':
        dailySlots = [...FOUR_TIMES_SLOTS];
        break;
      default:
        return [];
    }
  }

  // Deduplicate slots within a day
  const uniqueSlots = Array.from(new Set(dailySlots)).sort();

  // 4. Compute total duration in days
  let totalDays = 1;
  if (medication.duration_value && medication.duration_value > 0) {
    if (medication.duration_unit === 'day') {
      totalDays = medication.duration_value;
    } else if (medication.duration_unit === 'week') {
      totalDays = medication.duration_value * 7;
    }
  } else if (options?.daysToSchedule && options.daysToSchedule > 0) {
    totalDays = options.daysToSchedule;
  }

  const startDateStr = getIstDateString(options?.startDate);
  const reminders: ScheduledReminder[] = [];

  // 5. Generate concrete timestamps across the duration
  for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
    const currentDateStr = addDays(startDateStr, dayOffset);

    for (const slot of uniqueSlots) {
      const scheduledTime = `${currentDateStr}T${slot}:00+05:30`;

      reminders.push({
        medication_id: medication.id,
        scheduled_time: scheduledTime,
        dose_amount: medication.dose_amount,
        dose_unit: medication.dose_unit,
        timing_anchor: timingAnchors.length > 0 ? timingAnchors[0] : null,
      });
    }
  }

  return reminders;
}
