/**
 * Translation Provider Seam Types.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 6, `PercriptionSetuMASTERPLAN.md` §18.7, `SAFETY_INVARIANTS.md` SI-16.
 */

export type HttpTransport = (
  url: string,
  options: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{
  status: number;
  ok: boolean;
  json: () => Promise<any>;
}>;

export interface TranslationResult {
  success: boolean;
  translated_text: string;
  source_language: string;
  target_language: string;
  provider: string;
  error_code?: string | undefined;
}

/**
 * Pluggable provider seam for translating reminder and medical text.
 * Implementations:
 * - `PassthroughProvider` for zero-dependency baseline/testing.
 * - `GoogleTranslateProvider` for fallback machine translation.
 * - `BhashiniProvider` for primary Indian-language NMT translation.
 */
export interface TranslationProvider {
  readonly providerName: string;
  translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<TranslationResult>;
}
