import React from 'react';
import { FormattedMedication, SourceSpan } from '../lib/types';
import {
  Check,
  Edit2,
  X,
  AlertTriangle,
  Clock,
  Pill,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface CandidateCardProps {
  medication: FormattedMedication;
  onHoverSpan: (span: SourceSpan | null) => void;
  onConfirm: (id: string) => void;
  onOpenCorrect: (med: FormattedMedication) => void;
  onOpenReject: (med: FormattedMedication) => void;
  isProcessing?: boolean;
}

export function CandidateCard({
  medication,
  onHoverSpan,
  onConfirm,
  onOpenCorrect,
  onOpenReject,
  isProcessing,
}: CandidateCardProps) {
  const { effective_fields, display_expansions, verification_status } = medication;

  const statusBadge = {
    pending: 'bg-amber-50 text-amber-800 border-amber-200',
    confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    corrected: 'bg-brand-50 text-brand-700 border-brand-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  }[verification_status];

  // Helper to format dose string
  let doseStr = 'Not stated';
  if (effective_fields.dose_amount) {
    if (typeof effective_fields.dose_amount === 'object') {
      if ('value' in effective_fields.dose_amount) {
        doseStr = `${effective_fields.dose_amount.value} ${effective_fields.dose_unit || ''}`;
      } else if ('numerator' in effective_fields.dose_amount) {
        doseStr = `${effective_fields.dose_amount.numerator}/${effective_fields.dose_amount.denominator} ${effective_fields.dose_unit || ''}`;
      }
    } else {
      doseStr = `${effective_fields.dose_amount} ${effective_fields.dose_unit || ''}`;
    }
  }

  // Helper to format strength string
  const strengthStr =
    effective_fields.dose_strength_value !== null
      ? `${effective_fields.dose_strength_value}${effective_fields.dose_strength_unit || ''}`
      : 'Not stated';

  // Helper to format frequency
  const freqStr = effective_fields.frequency_code
    ? effective_fields.frequency_code.replace(/_/g, ' ')
    : 'Not stated';

  // Helper to format duration
  const durStr =
    effective_fields.duration_value !== null
      ? `${effective_fields.duration_value} ${effective_fields.duration_unit || ''}(s)`
      : effective_fields.duration_indefinite
      ? 'Indefinite (Continuous)'
      : 'Not stated';

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors">
      <div>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h4 className="font-semibold text-slate-900 text-base flex items-center space-x-2">
              <span>{medication.drug_name || 'Extracted Medication Line'}</span>
              {effective_fields.as_needed && (
                <span className="text-[10px] bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200 font-medium">
                  SOS / PRN (As Needed)
                </span>
              )}
            </h4>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
              Candidate ID: {medication.id.slice(0, 8)}...
            </p>
          </div>
          <span
            className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-medium capitalize border ${statusBadge}`}
          >
            {verification_status}
          </span>
        </div>

        {/* Ambiguity / Action Required Alert */}
        {effective_fields.verifier_action_required && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center space-x-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Review Required:</strong> Ambiguous shorthand notation or missing clinical fields.
            </span>
          </div>
        )}

        {/* Clinical Fields Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200/80 text-xs">
          <div>
            <div className="flex items-center space-x-1 text-slate-500 mb-1">
              <Pill className="w-3.5 h-3.5 text-brand-600" />
              <span className="text-[11px] font-medium">Dose Amount</span>
            </div>
            <p className="font-semibold text-slate-900 font-mono">{doseStr}</p>
          </div>
          <div>
            <div className="flex items-center space-x-1 text-slate-500 mb-1">
              <Layers className="w-3.5 h-3.5 text-brand-600" />
              <span className="text-[11px] font-medium">Strength</span>
            </div>
            <p className="font-semibold text-slate-900 font-mono">{strengthStr}</p>
          </div>
          <div>
            <div className="flex items-center space-x-1 text-slate-500 mb-1">
              <Clock className="w-3.5 h-3.5 text-brand-600" />
              <span className="text-[11px] font-medium">Frequency</span>
            </div>
            <p className="font-semibold text-slate-900 font-mono">{freqStr}</p>
          </div>
          <div>
            <div className="flex items-center space-x-1 text-slate-500 mb-1">
              <Calendar className="w-3.5 h-3.5 text-brand-600" />
              <span className="text-[11px] font-medium">Duration</span>
            </div>
            <p className="font-semibold text-slate-900 font-mono">{durStr}</p>
          </div>
        </div>

        {/* Display Expansions & Provenance Pills */}
        {display_expansions && display_expansions.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] text-slate-500 mb-1.5 font-medium">Matched Shorthand Provenance (Hover to inspect source):</p>
            <div className="flex flex-wrap gap-1.5">
              {display_expansions.map((exp, idx) => (
                <button
                  key={idx}
                  type="button"
                  onMouseEnter={() => onHoverSpan(exp.source_span)}
                  onMouseLeave={() => onHoverSpan(null)}
                  className="bg-white hover:bg-brand-50 border border-slate-200 hover:border-brand-300 text-slate-700 text-xs px-2.5 py-1 rounded-full transition-colors text-left flex items-center space-x-1.5 font-mono shadow-2xs"
                >
                  <span className="font-semibold text-brand-600">{exp.matched_literal}</span>
                  <ArrowRight className="w-3 h-3 text-slate-400" />
                  <span className="text-slate-600">{exp.canonical_expansion}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
        <button
          type="button"
          disabled={isProcessing || verification_status === 'rejected'}
          onClick={() => onOpenReject(medication)}
          className="px-3.5 py-1.5 rounded-full border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 text-xs font-medium flex items-center space-x-1.5 transition-colors disabled:opacity-50"
        >
          <X className="w-3.5 h-3.5" />
          <span>Reject</span>
        </button>

        <button
          type="button"
          disabled={isProcessing}
          onClick={() => onOpenCorrect(medication)}
          className="px-3.5 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center space-x-1.5 transition-colors disabled:opacity-50 shadow-2xs"
        >
          <Edit2 className="w-3.5 h-3.5" />
          <span>Correct</span>
        </button>

        <button
          type="button"
          disabled={isProcessing || verification_status === 'confirmed'}
          onClick={() => onConfirm(medication.id)}
          className="px-4 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50 shadow-xs"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Confirm</span>
        </button>
      </div>
    </div>
  );
}
