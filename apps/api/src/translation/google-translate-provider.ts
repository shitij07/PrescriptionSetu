/**
 * Google Translate Provider Seam.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 6, `PercriptionSetuMASTERPLAN.md` §18.7, `SAFETY_INVARIANTS.md` SI-16.
 */

import type { TranslationProvider, TranslationResult, HttpTransport } from './types';

export interface GoogleTranslateProviderOptions {
  apiKey?: string | undefined;
  endpointUrl?: string | undefined;
  transport?: HttpTransport | undefined;
}

export class GoogleTranslateProvider implements TranslationProvider {
  public readonly providerName = 'google_translate';
  private readonly apiKey?: string | undefined;
  private readonly endpointUrl: string;
  private readonly transport: HttpTransport;

  constructor(options: GoogleTranslateProviderOptions = {}) {
    this.apiKey = options.apiKey || process.env.GOOGLE_TRANSLATE_API_KEY;
    this.endpointUrl =
      options.endpointUrl || 'https://translation.googleapis.com/language/translate/v2';
    this.transport = options.transport || (typeof fetch !== 'undefined' ? (fetch as any) : undefined);
  }

  async translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<TranslationResult> {
    if (!this.apiKey) {
      return {
        success: false,
        translated_text: text,
        source_language: sourceLanguage,
        target_language: targetLanguage,
        provider: this.providerName,
        error_code: 'MISSING_CONFIGURATION',
      };
    }

    if (!this.transport) {
      return {
        success: false,
        translated_text: text,
        source_language: sourceLanguage,
        target_language: targetLanguage,
        provider: this.providerName,
        error_code: 'NO_TRANSPORT_AVAILABLE',
      };
    }

    const url = `${this.endpointUrl}?key=${encodeURIComponent(this.apiKey)}`;

    try {
      const response = await this.transport(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: sourceLanguage,
          target: targetLanguage,
          format: 'text',
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          translated_text: text,
          source_language: sourceLanguage,
          target_language: targetLanguage,
          provider: this.providerName,
          error_code: `GOOGLE_TRANSLATE_API_ERROR_${response.status}`,
        };
      }

      const data = await response.json();
      const translatedText = data?.data?.translations?.[0]?.translatedText;

      if (!translatedText || typeof translatedText !== 'string') {
        return {
          success: false,
          translated_text: text,
          source_language: sourceLanguage,
          target_language: targetLanguage,
          provider: this.providerName,
          error_code: 'INVALID_API_RESPONSE',
        };
      }

      return {
        success: true,
        translated_text: translatedText,
        source_language: sourceLanguage,
        target_language: targetLanguage,
        provider: this.providerName,
      };
    } catch {
      return {
        success: false,
        translated_text: text,
        source_language: sourceLanguage,
        target_language: targetLanguage,
        provider: this.providerName,
        error_code: 'GOOGLE_TRANSLATE_NETWORK_ERROR',
      };
    }
  }
}
