import { segmentOcrText } from '../lib/span-highlighter';

describe('Unicode Span Highlighter Utility', () => {
  it('correctly slices and highlights active span within OCR text', () => {
    const rawText = 'Tab Metformin 500mg 1 tab BD';
    // BD is at code points 26..28
    const activeSpan = { start: 26, end: 28 };
    const segments = segmentOcrText(rawText, activeSpan);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({
      text: 'Tab Metformin 500mg 1 tab ',
      isHighlighted: false,
      isUnparsed: false,
      span: { start: 0, end: 26 },
    });
    expect(segments[1]).toEqual({
      text: 'BD',
      isHighlighted: true,
      isUnparsed: false,
      span: { start: 26, end: 28 },
    });
  });

  it('correctly handles unparsed fragment spans', () => {
    const rawText = 'Tab Metformin 500mg 1 tab BD';
    const unparsedSpans = [{ start: 0, end: 13 }]; // 'Tab Metformin'
    const segments = segmentOcrText(rawText, null, unparsedSpans);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({
      text: 'Tab Metformin',
      isHighlighted: false,
      isUnparsed: true,
      span: { start: 0, end: 13 },
    });
    expect(segments[1]).toEqual({
      text: ' 500mg 1 tab BD',
      isHighlighted: false,
      isUnparsed: false,
      span: { start: 13, end: 28 },
    });
  });

  it('handles empty input text gracefully', () => {
    expect(segmentOcrText('')).toEqual([]);
  });
});
