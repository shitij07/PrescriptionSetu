/**
 * Unicode Code-Point Span Slicing & Highlighting Utility.
 * Authoritative sources: `docs/API_CONTRACTS.md` §5.1, `docs/DECISIONS.md` D-023.
 */

import { SourceSpan } from './types';

export interface TextSegment {
  text: string;
  isHighlighted: boolean;
  isUnparsed: boolean;
  ruleId?: string;
  span: SourceSpan;
}

/**
 * Splits raw OCR text into contiguous segments based on active highlighted spans.
 */
export function segmentOcrText(
  rawText: string,
  activeHighlightSpan: SourceSpan | null = null,
  unparsedSpans: SourceSpan[] = [],
): TextSegment[] {
  if (!rawText) return [];

  // Convert to Unicode code points array for exact index matching
  const codePoints = Array.from(rawText);
  const segments: TextSegment[] = [];

  let currentIndex = 0;

  while (currentIndex < codePoints.length) {
    // Check if currentIndex matches activeHighlightSpan start
    if (
      activeHighlightSpan &&
      currentIndex >= activeHighlightSpan.start &&
      currentIndex < activeHighlightSpan.end
    ) {
      const segText = codePoints.slice(activeHighlightSpan.start, activeHighlightSpan.end).join('');
      segments.push({
        text: segText,
        isHighlighted: true,
        isUnparsed: false,
        span: { start: activeHighlightSpan.start, end: activeHighlightSpan.end },
      });
      currentIndex = activeHighlightSpan.end;
      continue;
    }

    // Check if currentIndex matches any unparsedSpan start
    const unparsed = unparsedSpans.find(
      (u) => currentIndex >= u.start && currentIndex < u.end,
    );
    if (unparsed) {
      const segText = codePoints.slice(unparsed.start, unparsed.end).join('');
      segments.push({
        text: segText,
        isHighlighted: false,
        isUnparsed: true,
        span: { start: unparsed.start, end: unparsed.end },
      });
      currentIndex = unparsed.end;
      continue;
    }

    // Otherwise, consume regular characters until the next boundary
    let nextBoundary = codePoints.length;
    if (activeHighlightSpan && activeHighlightSpan.start > currentIndex) {
      nextBoundary = Math.min(nextBoundary, activeHighlightSpan.start);
    }
    for (const u of unparsedSpans) {
      if (u.start > currentIndex) {
        nextBoundary = Math.min(nextBoundary, u.start);
      }
    }

    const segText = codePoints.slice(currentIndex, nextBoundary).join('');
    segments.push({
      text: segText,
      isHighlighted: false,
      isUnparsed: false,
      span: { start: currentIndex, end: nextBoundary },
    });
    currentIndex = nextBoundary;
  }

  return segments;
}
