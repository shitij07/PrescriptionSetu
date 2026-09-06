/**
 * OCR Perception Boundary Interfaces.
 * Authoritative sources: `docs/API_CONTRACTS.md` §13.1, `PercriptionSetuMASTERPLAN.md` §18.1, §20.
 *
 * CRITICAL BOUNDARY:
 * OCR performs PERCEPTION ONLY (pixels -> text + confidence).
 * It NEVER parses shorthand, interprets medical semantics, repairs tokens, or guesses meanings.
 */

export interface OcrResult {
  raw_ocr_text: string;
  confidence: number | null;
  metadata?: Record<string, unknown> | null;
}

export type OcrInput =
  | Buffer
  | string
  | {
      fixture_key?: string;
      image_bytes?: Buffer;
      raw_text?: string;
    };

export type OcrErrorCode =
  | 'FIXTURE_NOT_FOUND'
  | 'EMPTY_OCR_RESULT'
  | 'IMAGE_UNREADABLE'
  | 'PROVIDER_ERROR';

export class OcrError extends Error {
  public readonly code: OcrErrorCode;

  constructor(code: OcrErrorCode, message: string) {
    super(message);
    this.name = 'OcrError';
    this.code = code;
    Object.setPrototypeOf(this, OcrError.prototype);
  }
}

export interface OcrProvider {
  processImage(input: OcrInput): Promise<OcrResult>;
}
