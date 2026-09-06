/**
 * Deterministic In-Memory Fixture OCR Provider.
 * Authoritative sources: `docs/API_CONTRACTS.md` §13.1, `BUILD_ORDER.md` Step 3.
 */

import { OcrError, OcrInput, OcrProvider, OcrResult } from './types';

export class FixtureOcrProvider implements OcrProvider {
  private readonly fixtures: Map<string, OcrResult> = new Map();

  constructor() {
    this.registerDefaultFixtures();
  }

  /**
   * Registers or overrides an in-memory OCR fixture.
   */
  public registerFixture(key: string, result: OcrResult): void {
    this.fixtures.set(key, result);
  }

  /**
   * Processes input image/key and returns deterministic OCR result.
   */
  public async processImage(input: OcrInput): Promise<OcrResult> {
    // 1. Direct raw text input support
    if (typeof input === 'object' && !Buffer.isBuffer(input) && input.raw_text !== undefined) {
      if (!input.raw_text.trim()) {
        throw new OcrError('EMPTY_OCR_RESULT', 'OCR resulted in empty text');
      }
      return {
        raw_ocr_text: input.raw_text,
        confidence: 1.0,
        metadata: { provider: 'direct_raw_text' },
      };
    }

    // 2. Resolve fixture key
    let key: string | undefined;
    if (typeof input === 'string') {
      key = input;
    } else if (typeof input === 'object' && !Buffer.isBuffer(input) && input.fixture_key) {
      key = input.fixture_key;
    }

    if (!key || !this.fixtures.has(key)) {
      throw new OcrError('FIXTURE_NOT_FOUND', 'OCR fixture not found for key');
    }

    const fixture = this.fixtures.get(key)!;
    if (!fixture.raw_ocr_text || !fixture.raw_ocr_text.trim()) {
      throw new OcrError('EMPTY_OCR_RESULT', 'OCR fixture contains empty text');
    }

    return {
      raw_ocr_text: fixture.raw_ocr_text,
      confidence: fixture.confidence,
      metadata: fixture.metadata ? { ...fixture.metadata } : null,
    };
  }

  private registerDefaultFixtures(): void {
    this.registerFixture('amoxicillin_500mg_tds', {
      raw_ocr_text: 'Tab Amoxicillin 500mg 1 tab TDS',
      confidence: 0.95,
      metadata: { source: 'sample_corpus_01.png', engine: 'cloud_vision_fixture' },
    });

    this.registerFixture('paracetamol_bd_5days', {
      raw_ocr_text: 'Tab Paracetamol 500mg 1 tab BD x 5 days',
      confidence: 0.92,
      metadata: { source: 'sample_corpus_02.png', engine: 'cloud_vision_fixture' },
    });

    this.registerFixture('metformin_paracetamol_multiline', {
      raw_ocr_text: 'Tab Metformin 500mg BD\nTab Paracetamol 500mg 1 tab SOS',
      confidence: 0.91,
      metadata: { source: 'sample_corpus_03.png', engine: 'cloud_vision_fixture' },
    });

    // 28 Synthetic Benchmark Corpus Fixtures (BUILD_ORDER.md §2.1)
    const corpusData = [
      { id: 'SYN-01', text: 'Tab Metformin 500mg 1 tab BD' },
      { id: 'SYN-02', text: 'Tab Amoxicillin 500 mg 1 tab TDS x 7 days' },
      { id: 'SYN-03', text: 'Tab Telmisartan 40mg 1 tab OD pc' },
      { id: 'SYN-04', text: 'Tab Clonazepam 0.5mg 1 tab HS' },
      { id: 'SYN-05', text: 'Tab Pantoprazole 40mg 1 tab OD ac' },
      { id: 'SYN-06', text: 'Tab Paracetamol 650mg 1 tab SOS' },
      { id: 'SYN-07', text: 'Tab Paracetamol 500mg 1 tab stat' },
      { id: 'SYN-08', text: 'Syr Promethazine 5ml QID x 3 days' },
      { id: 'SYN-09', text: 'Tab Metformin 500mg 1 tab BD\nTab Glimepiride 1mg 1 tab OD ac' },
      { id: 'SYN-10', text: 'Tab Telmisartan 40mg 1 tab OD\nTab Amlodipine 5mg 1 tab OD\nTab Rosuvastatin 10mg 1 tab HS' },
      { id: 'SYN-11', text: 'Tab Augmentin 625mg 1 tab BD x 5 days\nTab Paracetamol 650mg 1 tab SOS\nCap Omeprazole 20mg 1 cap OD ac' },
      { id: 'SYN-12', text: 'Tab Thyronorm 50mcg 1 tab OD ac\nTab Calcium 500mg 1 tab OD pc' },
      { id: 'SYN-13', text: 'Tab Ciprofloxacin 500mg 1 tab BD x 2 weeks' },
      { id: 'SYN-14', text: 'Tab Azithromycin 500mg 1 tab OD x 3/7' },
      { id: 'SYN-15', text: 'Tab Ecosprin 75mg 1 tab OD pc\nTab Clopidogrel 75mg 1 tab OD pc\nTab Atorvastatin 20mg 1 tab HS' },
      { id: 'SYN-16', text: 'Tab Levocetirizine 5mg 1 tab HS x 10 days\nSyr Ambroxol 10ml TDS' },
      { id: 'SYN-17', text: 'Tab Thyroxine 12.5mcg 1/2 tab OD' },
      { id: 'SYN-18', text: 'Tab Clonazepam 0.25mg ½ tab HS' },
      { id: 'SYN-19', text: 'Tab Metformin 500mg 1 tab BD continue' },
      { id: 'SYN-20', text: 'Tab Multivitamin 1 tab OD x 10' },
      { id: 'SYN-21', text: 'Syr CoughSyrup 10mL TDS x 5 days' },
      { id: 'SYN-22', text: 'Tab Ibuprofen 400mg 1 tab PRN' },
      { id: 'SYN-23', text: 'Tab Metformin 500mg 1 tab BD OD' },
      { id: 'SYN-24', text: 'Tab Atorvastatin 20mg 1 tab BD' },
      { id: 'SYN-25', text: 'Tab UnknownDrug 500mg BD' },
      { id: 'SYN-26', text: 'Rx Consultation Only\nPatient Advised Bed Rest\nFollow up after blood test' },
      { id: 'SYN-27', text: 'Tab Amoxicillin 500mg 1 tab TDS\nTab CorruptedLine 500mg 8D' },
      { id: 'SYN-28', text: 'Tab Metformin 500mg 1 tab BD\nTab Paracetamol 500mg 1 tab TDS' },
    ];

    for (const sample of corpusData) {
      this.registerFixture(sample.id, {
        raw_ocr_text: sample.text,
        confidence: 0.95,
        metadata: { sample_id: sample.id, source: 'synthetic_corpus' },
      });
    }
  }
}
