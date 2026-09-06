import React from 'react';
import { FormattedMedication } from '../lib/types';
import { ShieldCheck, ShieldAlert, ArrowRight, Loader2, Lock } from 'lucide-react';

interface GateStatusBarProps {
  medications: FormattedMedication[];
  onVerify: () => Promise<void>;
  isProcessing?: boolean;
  isVerified?: boolean;
}

export function GateStatusBar({
  medications,
  onVerify,
  isProcessing,
  isVerified,
}: GateStatusBarProps) {
  const total = medications.length;
  const confirmedCount = medications.filter(
    (m) => m.verification_status === 'confirmed' || m.verification_status === 'corrected',
  ).length;
  const pendingCount = medications.filter((m) => m.verification_status === 'pending').length;
  const rejectedCount = medications.filter((m) => m.verification_status === 'rejected').length;

  const isGateSatisfied = total > 0 && pendingCount === 0 && rejectedCount === 0;

  if (isVerified) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between shadow-xs">
        <div className="flex items-center space-x-3 text-emerald-800">
          <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
          <div>
            <h4 className="font-semibold text-sm">Prescription Verified & Reminders Active</h4>
            <p className="text-xs text-emerald-700">
              All {total} medications are confirmed/corrected and scheduled for WhatsApp reminder delivery.
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold px-3 py-1 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-full font-mono">
          STATUS: VERIFIED
        </span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
      <div className="flex items-start space-x-3">
        {isGateSatisfied ? (
          <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <ShieldAlert className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
        )}
        <div>
          <div className="flex items-center space-x-2">
            <h4 className="font-semibold text-sm text-slate-900">
              Mandatory Human Verification Gate (SI-01)
            </h4>
            <span
              className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-semibold border ${
                isGateSatisfied
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {confirmedCount} of {total} Ready
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            {isGateSatisfied
              ? 'All medication candidates are confirmed. Ready to activate reminder schedules.'
              : `Verification locked: ${
                  pendingCount > 0 ? `${pendingCount} pending review. ` : ''
                }${rejectedCount > 0 ? `${rejectedCount} rejected (blocks verification).` : ''}`}
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={!isGateSatisfied || isProcessing}
        onClick={onVerify}
        className={`px-5 py-2.5 rounded-full font-semibold text-xs flex items-center space-x-2 transition-all shadow-xs ${
          isGateSatisfied
            ? 'bg-brand-500 hover:bg-brand-600 text-white cursor-pointer shadow-brand-500/20'
            : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
        }`}
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Verifying...</span>
          </>
        ) : (
          <>
            {!isGateSatisfied && <Lock className="w-3.5 h-3.5" />}
            <span>Verify Prescription & Activate</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  );
}
