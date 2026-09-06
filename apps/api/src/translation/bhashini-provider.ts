/**
 * Bhashini ULCA NMT Translation Provider.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 6, `PercriptionSetuMASTERPLAN.md` §18.7, `SAFETY_INVARIANTS.md` SI-16.
 */

import type { TranslationProvider, TranslationResult, HttpTransport } from './types';

export interface BhashiniProviderOptions {
  apiKey?: string | undefined;
  pipelineId?: string | undefined;
  endpointUrl?: string | undefined;
  transport?: HttpTransport | undefined;
}

export class BhashiniProvider implements TranslationProvider {
  public readonly providerName = 'bhashini';
  private readonly apiKey?: string | undefined;
  private readonly pipelineId?: string | undefined;
  private readonly endpointUrl: string;
  private readonly transport: HttpTransport;

  constructor(options: BhashiniProviderOptions = {}) {
    this.apiKey = options.apiKey || process.env.BHASHINI_API_KEY;
    this.pipelineId = options.pipelineId || process.env.BHASHINI_PIPELINE_ID;
    this.endpointUrl =
      options.endpointUrl || 'https://dhruva-api.bhashini.gov.in/services/inference/pipeline';
    this.transport = options.transport || (typeof fetch !== 'undefined' ? (fetch as any) : undefined);
  }

  async translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<TranslationResult> {
    if (!this.apiKey || !this.pipelineId) {
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

    try {
      const payload = {
        pipelineTasks: [
          {
            taskType: 'translation',
            config: {
              language: {
                sourceLanguage,
                targetLanguage,
              },
            },
          },
        ],
        inputData: {
          input: [
            {
              source: text,
            },
          ],
        },
        pipelineId: this.pipelineId,
      };

      const response = await this.transport(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return {
          success: false,
          translated_text: text,
          source_language: sourceLanguage,
          target_language: targetLanguage,
          provider: this.providerName,
          error_code: `BHASHINI_API_ERROR_${response.status}`,
        };
      }

      const data = await response.json();
      const output = data?.pipelineResponse?.[0]?.output?.[0]?.target;

      if (!output || typeof output !== 'string') {
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
        translated_text: output,
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
        error_code: 'BHASHINI_NETWORK_ERROR',
      };
    }
  }
}
