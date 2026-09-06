/**
 * Reminder Scheduling Types.
 * Authoritative sources: `PercriptionSetuMASTERPLAN.md` §18.6, `docs/SCHEMA.md`, `SAFETY_INVARIANTS.md`.
 */

export interface PatientMealTimes {
  breakfast?: string; // HH:mm format, e.g. "08:00"
  lunch?: string;     // HH:mm format, e.g. "13:00"
  dinner?: string;    // HH:mm format, e.g. "20:00"
  bedtime?: string;   // HH:mm format, e.g. "22:00"
}

export interface ScheduledReminder {
  medication_id: string;
  scheduled_time: string; // ISO 8601 string with IST (+05:30) offset
  dose_amount: unknown | null;
  dose_unit: 'tablet' | 'ml' | null;
  timing_anchor?: string | null;
}

export interface ScheduleOptions {
  startDate?: string; // YYYY-MM-DD or ISO string
  daysToSchedule?: number;
}
