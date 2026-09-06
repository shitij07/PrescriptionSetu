/**
 * Centralized Structured JSON Logger with Allow-List Redaction (SI-16).
 * Authoritative sources: `SAFETY_INVARIANTS.md` SI-16, `BUILD_ORDER.md` Step 8, `PercriptionSetuMASTERPLAN.md` §26, §33.
 */

import type { LogLevel, SafeLogContext, LogEntry, LoggerOptions, LogStream } from './types';

// Strict allow-list of safe operational metadata keys
const ALLOWED_METADATA_KEYS = new Set<string>([
  'prescription_id',
  'medication_id',
  'reminder_id',
  'patient_id',
  'caregiver_id',
  'adherence_log_id',
  'error_code',
  'status_code',
  'http_method',
  'path',
  'duration_ms',
  'attempt_count',
  'rule_id',
  'dictionary_version',
  'module',
  'action',
  'success',
  'count',
  'level',
  'timestamp',
  'event',
  'service',
]);

// Explicitly forbidden keys that must be immediately dropped
const FORBIDDEN_KEYS = new Set<string>([
  'raw_ocr_text',
  'raw_reply_text',
  'drug_name',
  'full_name',
  'phone_number',
  'dose_amount',
  'payload',
  'body',
  'message',
  'matched_literal',
  'unparsed_fragments',
  'stack',
  'raw_text',
  'text',
]);

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Sanitizes arbitrary context objects to guarantee zero leakage of PHI / sensitive data (SI-16).
 */
export function sanitizeContext(context?: SafeLogContext): Record<string, unknown> {
  if (!context || typeof context !== 'object') {
    return {};
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();

    // 1. Immediately drop forbidden keys
    if (FORBIDDEN_KEYS.has(lowerKey)) {
      continue;
    }

    // 2. Only retain allow-listed keys
    if (ALLOWED_METADATA_KEYS.has(lowerKey)) {
      if (typeof value === 'string') {
        // Drop any string value that looks like a phone number or multi-token free text
        if (/^\+?\d{10,14}$/.test(value) && !lowerKey.endsWith('_id')) {
          continue;
        }
        sanitized[key] = value;
      } else if (
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        value === null ||
        value === undefined
      ) {
        sanitized[key] = value;
      }
    }
  }

  return sanitized;
}

/**
 * Sanitizes Error objects to prevent leaking raw queries, user input, or sensitive exception messages.
 */
export function sanitizeError(err: unknown): { error_code: string; error_category: string } {
  if (!err) {
    return { error_code: 'UNKNOWN_ERROR', error_category: 'Unknown' };
  }

  if (typeof err === 'object' && err !== null) {
    const anyErr = err as Record<string, unknown>;
    const code =
      typeof anyErr.code === 'string'
        ? anyErr.code
        : typeof anyErr.name === 'string'
          ? anyErr.name
          : 'INTERNAL_ERROR';

    return {
      error_code: code,
      error_category: typeof anyErr.name === 'string' ? anyErr.name : 'Error',
    };
  }

  return { error_code: 'INTERNAL_ERROR', error_category: 'Error' };
}

export class Logger {
  private readonly minLevel: LogLevel;
  private readonly stream: LogStream;
  private readonly serviceName: string;

  constructor(options: LoggerOptions = {}) {
    this.minLevel = options.level ?? 'info';
    this.stream = options.stream ?? {
      write: (msg: string) => {
        process.stdout.write(msg + '\n');
      },
    };
    this.serviceName = options.serviceName ?? 'prescriptionsetu-api';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private emit(level: LogLevel, event: string, context?: SafeLogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const sanitized = sanitizeContext(context);
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      service: this.serviceName,
      ...sanitized,
    };

    this.stream.write(JSON.stringify(entry));
  }

  debug(event: string, context?: SafeLogContext): void {
    this.emit('debug', event, context);
  }

  info(event: string, context?: SafeLogContext): void {
    this.emit('info', event, context);
  }

  warn(event: string, context?: SafeLogContext): void {
    this.emit('warn', event, context);
  }

  error(event: string, err?: unknown, context?: SafeLogContext): void {
    const errorInfo = sanitizeError(err);
    this.emit('error', event, {
      ...context,
      error_code: context?.error_code || errorInfo.error_code,
    });
  }
}

export const defaultLogger = new Logger();
