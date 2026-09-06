/**
 * Passthrough Translation Provider.
 * Returns text unchanged with zero network calls and deterministic execution.
 * Authoritative source: `BUILD_ORDER.md` §4 Step 6.
 */

import type { TranslationProvider, TranslationResult } from './types';

export class PassthroughProvider implements TranslationProvider {
  public readonly providerName = 'passthrough';

  async translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<TranslationResult> {
    return {
      success: true,
      translated_text: text,
      source_language: sourceLanguage,
      target_language: targetLanguage,
      provider: this.providerName,
    };
  }
}
