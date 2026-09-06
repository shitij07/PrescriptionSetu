import React from 'react';
import { SourceSpan, UnparsedFragment } from '../lib/types';
import { segmentOcrText } from '../lib/span-highlighter';
import { FileText, Sparkles } from 'lucide-react';

interface OcrViewerProps {
  rawOcrText: string;
  activeSpan: SourceSpan | null;
  unparsedFragments: UnparsedFragment[];
  confidence?: number | null;
}

export function OcrViewer({
  rawOcrText,
  activeSpan,
  unparsedFragments,
  confidence,
}: OcrViewerProps) {
  const unparsedSpans = unparsedFragments.map((u) => u.source_span);
  const segments = segmentOcrText(rawOcrText, activeSpan, unparsedSpans);

  // Split lines for gutter display while preserving character offsets
  const lines = rawOcrText.split('\n');

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-brand-600" />
          <h3 className="font-semibold text-slate-900 text-sm">Raw Prescription OCR Perception</h3>
        </div>
        {confidence !== undefined && confidence !== null && (
          <div className="flex items-center space-x-1.5 text-xs text-slate-600 font-mono bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>Match: {(confidence * 100).toFixed(0)}%</span>
          </div>
        )}
      </div>

      <div className="bg-slate-50/80 border border-slate-200/80 rounded-lg p-4 font-mono text-sm leading-relaxed text-slate-800 whitespace-pre-wrap flex-1 overflow-auto select-text shadow-inner">
        {segments.map((seg, idx) => {
          if (seg.isHighlighted) {
            return (
              <mark
                key={idx}
                className="bg-brand-100 text-brand-800 border border-brand-300 font-semibold px-1 py-0.5 rounded transition-colors shadow-2xs"
                title={`Selected span: [${seg.span.start}, ${seg.span.end})`}
              >
                {seg.text}
              </mark>
            );
          }
          if (seg.isUnparsed) {
            return (
              <span
                key={idx}
                className="bg-amber-50 text-amber-900 px-1 py-0.5 rounded border-b border-amber-300"
                title={`Unparsed clinical text: [${seg.span.start}, ${seg.span.end})`}
              >
                {seg.text}
              </span>
            );
          }
          return <span key={idx}>{seg.text}</span>;
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded bg-brand-100 border border-brand-400 inline-block" />
            <span>Active Field Span</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded bg-amber-50 border border-amber-300 inline-block" />
            <span>Unparsed Fragment</span>
          </span>
        </div>
        <span className="font-mono text-slate-400">SI-04 Character Provenance</span>
      </div>
    </div>
  );
}
