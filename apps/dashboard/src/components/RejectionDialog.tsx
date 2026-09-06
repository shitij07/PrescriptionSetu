import React, { useState } from 'react';
import { FormattedMedication } from '../lib/types';
import { X, AlertTriangle } from 'lucide-react';

interface RejectionDialogProps {
  medication: FormattedMedication | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmReject: (reason: string) => Promise<void>;
  isProcessing?: boolean;
}

export function RejectionDialog({
  medication,
  isOpen,
  onClose,
  onConfirmReject,
  isProcessing,
}: RejectionDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !medication) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A rejection reason is required for the clinical audit trail.');
      return;
    }
    setError(null);
    await onConfirmReject(reason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center space-x-2 text-rose-600">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="text-base font-semibold text-slate-900">
              Reject Medication Candidate
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            Rejecting this medication candidate marks it as rejected. Under safety invariant SI-01,
            the prescription <strong>cannot be verified</strong> until this candidate is resolved
            or corrected.
          </p>

          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl font-mono">
            <span className="text-slate-500 text-[10px] block uppercase">Medication Candidate</span>
            <span className="text-slate-900 font-semibold text-xs">
              {medication.drug_name || 'Extracted Medication Line'}
            </span>
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-1">
              Rejection Reason <span className="text-rose-600">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Unreadable handwriting smudge on dosage; cannot confirm 1 tab vs 2 tab"
              className="w-full bg-slate-50 border border-slate-200 focus:bg-white rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-rose-500"
            />
            {error && <p className="text-rose-600 text-[11px] mt-1 font-medium">{error}</p>}
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs"
            >
              {isProcessing ? 'Rejecting...' : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
