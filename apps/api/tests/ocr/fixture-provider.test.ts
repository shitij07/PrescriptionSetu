/**
 * Fixture OCR Provider Contract Tests.
 * Authoritative sources: `docs/API_CONTRACTS.md` §13.1, `BUILD_ORDER.md` Step 3.
 */

import { FixtureOcrProvider } from '../../src/ocr/fixture-provider';
import { OcrError } from '../../src/ocr/types';

describe('FixtureOcrProvider', () => {
  let provider: FixtureOcrProvider;

  beforeEach(() => {
    provider = new FixtureOcrProvider();
  });

  it('1. resolves a valid registered fixture returning exact OcrResult', async () => {
    provider.registerFixture('amoxicillin_500mg_tds', {
      raw_ocr_text: 'Tab Amoxicillin 500mg 1 tab TDS',
      confidence: 0.96,
      metadata: { source: 'sample_01.png', engine: 'cloud_vision_fixture' },
    });

    const result = await provider.processImage('amoxicillin_500mg_tds');
    expect(result.raw_ocr_text).toBe('Tab Amoxicillin 500mg 1 tab TDS');
    expect(result.confidence).toBe(0.96);
    expect(result.metadata).toEqual({ source: 'sample_01.png', engine: 'cloud_vision_fixture' });
  });

  it('2. throws OcrError with FIXTURE_NOT_FOUND when fixture is unregistered', async () => {
    await expect(provider.processImage('non_existent_fixture')).rejects.toThrow(OcrError);

    try {
      await provider.processImage('non_existent_fixture');
    } catch (err: any) {
      expect(err).toBeInstanceOf(OcrError);
      expect(err.code).toBe('FIXTURE_NOT_FOUND');
      expect(err.message).toBe('OCR fixture not found for key');
    }
  });

  it('3. preserves exact raw OCR text without trimming or altering casing/delimiters', async () => {
    const rawText = '  Tab Paracetamol 500mg 1 tab BD.  ';
    provider.registerFixture('raw_casing', {
      raw_ocr_text: rawText,
      confidence: 0.88,
    });

    const result = await provider.processImage('raw_casing');
    expect(result.raw_ocr_text).toBe(rawText);
  });

  it('4. preserves Unicode characters and non-BMP symbols faithfully', async () => {
    const rawText = 'Tab Paracetamol 500mg ½ tab BD\nऔषध १ गोळी';
    provider.registerFixture('unicode_fixture', {
      raw_ocr_text: rawText,
      confidence: 0.92,
    });

    const result = await provider.processImage('unicode_fixture');
    expect(result.raw_ocr_text).toBe(rawText);
  });

  it('5. preserves multiline newlines (LF, CRLF, CR) exactly', async () => {
    const rawText = 'Line 1\r\nLine 2\nLine 3\rLine 4';
    provider.registerFixture('multiline_fixture', {
      raw_ocr_text: rawText,
      confidence: 0.90,
    });

    const result = await provider.processImage('multiline_fixture');
    expect(result.raw_ocr_text).toBe(rawText);
  });

  it('6. preserves confidence and arbitrary perception metadata exactly', async () => {
    const metadata = {
      block_count: 3,
      languages: ['en', 'mr'],
      bounding_boxes: [{ x: 10, y: 20, w: 100, h: 40 }],
    };

    provider.registerFixture('metadata_fixture', {
      raw_ocr_text: 'Tab Metformin 500mg BD',
      confidence: 0.74,
      metadata,
    });

    const result = await provider.processImage({ fixture_key: 'metadata_fixture' });
    expect(result.confidence).toBe(0.74);
    expect(result.metadata).toEqual(metadata);
  });
});
