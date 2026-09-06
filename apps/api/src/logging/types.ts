/**
 * Structured Logging & Redaction Types (SI-16).
 * Authoritative sources: `SAFETY_INVARIANTS.md` SI-16, `BUILD_ORDER.md` Step 8, `PercriptionSetuMASTERPLAN.md` §26.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface SafeLogContext {
  prescription_id?: string | undefined;
  medication_id?: string | undefined;
  reminder_id?: string | undefined;
  patient_id?: string | undefined;
  caregiver_id?: string | undefined;
  adherence_log_id?: string | undefined;
  error_code?: string | undefined;
  status_code?: number | undefined;
  http_method?: string | undefined;
  path?: string | undefined;
  duration_ms?: number | undefined;
  attempt_count?: number | undefined;
  rule_id?: string | undefined;
  dictionary_version?: string | undefined;
  module?: string | undefined;
  action?: string | undefined;
  success?: boolean | undefined;
  count?: number | undefined;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  [key: string]: unknown;
}

export interface LogStream {
  write(message: string): void;
}

export interface LoggerOptions {
  level?: LogLevel | undefined;
  stream?: LogStream | undefined;
  serviceName?: string | undefined;
}
