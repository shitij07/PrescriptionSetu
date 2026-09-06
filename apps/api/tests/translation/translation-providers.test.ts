/**
 * Translation Provider Seam Unit Tests.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 6, `PercriptionSetuMASTERPLAN.md` §18.7, `SAFETY_INVARIANTS.md` SI-16.
 */

import { PassthroughProvider } from '../../src/translation/passthrough-provider';
import { GoogleTranslateProvider } from '../../src/translation/google-translate-provider';
import { BhashiniProvider } from '../../src/translation/bhashini-provider';
import type { HttpTransport } from '../../src/translation/types';

describe('Translation Providers', () => {
  describe('PassthroughProvider', () => {
    it('returns input text unchanged and preserves language metadata', async () => {
      const provider = new PassthroughProvider();
      const result = await provider.translate('Take 1 tablet after meals', 'en', 'mr');

      expect(result).toEqual({
        success: true,
        translated_text: 'Take 1 tablet after meals',
        source_language: 'en',
        target_language: 'mr',
        provider: 'passthrough',
      });
    });

    it('handles Marathi text passthrough identically without network activity', async () => {
      const provider = new PassthroughProvider();
      const marathiText = 'जेवणानंतर १ गोळी घ्या';
      const result = await provider.translate(marathiText, 'mr', 'mr');

      expect(result.success).toBe(true);
      expect(result.translated_text).toBe(marathiText);
      expect(result.provider).toBe('passthrough');
    });
  });

  describe('GoogleTranslateProvider', () => {
    it('successfully translates text via injected HTTP transport', async () => {
      const mockTransport: HttpTransport = jest.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          data: {
            translations: [
              {
                translatedText: 'जेवणानंतर १ गोळी घ्या',
              },
            ],
          },
        }),
      });

      const provider = new GoogleTranslateProvider({
        apiKey: 'test-google-key',
        transport: mockTransport,
      });

      const result = await provider.translate('Take 1 tablet after meals', 'en', 'mr');

      expect(result).toEqual({
        success: true,
        translated_text: 'जेवणानंतर १ गोळी घ्या',
        source_language: 'en',
        target_language: 'mr',
        provider: 'google_translate',
      });

      expect(mockTransport).toHaveBeenCalledTimes(1);
      const [url, options] = (mockTransport as jest.Mock).mock.calls[0];
      expect(url).toContain('googleapis.com');
      expect(options.method).toBe('POST');
      const parsedBody = JSON.parse(options.body);
      expect(parsedBody.q).toBe('Take 1 tablet after meals');
      expect(parsedBody.target).toBe('mr');
      expect(parsedBody.source).toBe('en');
    });

    it('returns structured failure when API returns non-200 error', async () => {
      const mockTransport: HttpTransport = jest.fn().mockResolvedValue({
        status: 403,
        ok: false,
        json: async () => ({
          error: {
            code: 403,
            message: 'API key not valid',
          },
        }),
      });

      const provider = new GoogleTranslateProvider({
        apiKey: 'invalid-key',
        transport: mockTransport,
      });

      const result = await provider.translate('Take 1 tablet', 'en', 'mr');

      expect(result.success).toBe(false);
      expect(result.translated_text).toBe('Take 1 tablet'); // falls back to input text
      expect(result.error_code).toBe('GOOGLE_TRANSLATE_API_ERROR_403');
      expect(result.provider).toBe('google_translate');
    });

    it('returns structured failure when network throws an exception', async () => {
      const mockTransport: HttpTransport = jest.fn().mockRejectedValue(new Error('Network timeout'));

      const provider = new GoogleTranslateProvider({
        apiKey: 'test-key',
        transport: mockTransport,
      });

      const result = await provider.translate('Take 1 tablet', 'en', 'mr');

      expect(result.success).toBe(false);
      expect(result.translated_text).toBe('Take 1 tablet');
      expect(result.error_code).toBe('GOOGLE_TRANSLATE_NETWORK_ERROR');
    });

    it('gracefully handles missing API key configuration without making network calls', async () => {
      const mockTransport = jest.fn();
      const provider = new GoogleTranslateProvider({
        apiKey: undefined,
        transport: mockTransport,
      });

      const result = await provider.translate('Take 1 tablet', 'en', 'mr');

      expect(result).toEqual({
        success: false,
        translated_text: 'Take 1 tablet',
        source_language: 'en',
        target_language: 'mr',
        provider: 'google_translate',
        error_code: 'MISSING_CONFIGURATION',
      });
      expect(mockTransport).not.toHaveBeenCalled();
    });
  });

  describe('BhashiniProvider', () => {
    it('successfully translates text via injected HTTP transport using ULCA NMT format', async () => {
      const mockTransport: HttpTransport = jest.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          pipelineResponse: [
            {
              taskType: 'translation',
              output: [
                {
                  source: 'Take 1 tablet after meals',
                  target: 'जेवणानंतर १ गोळी घ्या',
                },
              ],
            },
          ],
        }),
      });

      const provider = new BhashiniProvider({
        apiKey: 'test-bhashini-key',
        pipelineId: 'test-pipeline-123',
        transport: mockTransport,
      });

      const result = await provider.translate('Take 1 tablet after meals', 'en', 'mr');

      expect(result).toEqual({
        success: true,
        translated_text: 'जेवणानंतर १ गोळी घ्या',
        source_language: 'en',
        target_language: 'mr',
        provider: 'bhashini',
      });

      expect(mockTransport).toHaveBeenCalledTimes(1);
      const [url, options] = (mockTransport as jest.Mock).mock.calls[0];
      expect(url).toContain('bhashini');
      expect(options.headers['Authorization']).toBe('test-bhashini-key');
      const body = JSON.parse(options.body);
      expect(body.pipelineId).toBe('test-pipeline-123');
      expect(body.inputData.input[0].source).toBe('Take 1 tablet after meals');
      expect(body.pipelineTasks[0].config.language.sourceLanguage).toBe('en');
      expect(body.pipelineTasks[0].config.language.targetLanguage).toBe('mr');
    });

    it('returns structured failure when Bhashini API returns an error response', async () => {
      const mockTransport: HttpTransport = jest.fn().mockResolvedValue({
        status: 500,
        ok: false,
        json: async () => ({ message: 'Inference pipeline failure' }),
      });

      const provider = new BhashiniProvider({
        apiKey: 'test-bhashini-key',
        pipelineId: 'test-pipeline-123',
        transport: mockTransport,
      });

      const result = await provider.translate('Take 1 tablet', 'en', 'mr');

      expect(result.success).toBe(false);
      expect(result.translated_text).toBe('Take 1 tablet');
      expect(result.error_code).toBe('BHASHINI_API_ERROR_500');
      expect(result.provider).toBe('bhashini');
    });

    it('returns structured failure when transport throws', async () => {
      const mockTransport: HttpTransport = jest.fn().mockRejectedValue(new Error('Connection reset'));

      const provider = new BhashiniProvider({
        apiKey: 'test-key',
        pipelineId: 'test-pipeline',
        transport: mockTransport,
      });

      const result = await provider.translate('Take 1 tablet', 'en', 'mr');

      expect(result.success).toBe(false);
      expect(result.translated_text).toBe('Take 1 tablet');
      expect(result.error_code).toBe('BHASHINI_NETWORK_ERROR');
    });

    it('gracefully handles missing API key or pipeline ID configuration', async () => {
      const mockTransport = jest.fn();
      const provider = new BhashiniProvider({
        apiKey: undefined,
        pipelineId: undefined,
        transport: mockTransport,
      });

      const result = await provider.translate('Take 1 tablet', 'en', 'mr');

      expect(result).toEqual({
        success: false,
        translated_text: 'Take 1 tablet',
        source_language: 'en',
        target_language: 'mr',
        provider: 'bhashini',
        error_code: 'MISSING_CONFIGURATION',
      });
      expect(mockTransport).not.toHaveBeenCalled();
    });
  });
});
