import React from 'react';
import Link from 'next/link';
import { PrescriptionRecord } from '../lib/types';
import { FileText, ArrowRight, Clock, User, ShieldAlert } from 'lucide-react';

interface PendingQueueProps {
  prescriptions: PrescriptionRecord[];
  isLoading?: boolean;
}

export function PendingQueue({ prescriptions, isLoading }: PendingQueueProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse h-24"
          />
        ))}
      </div>
    );
  }

  if (!prescriptions || prescriptions.length === 0) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-xl p-12 text-center shadow-xs">
        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-800">No Pending Prescriptions</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          All uploaded prescriptions have been reviewed and verified, or no new prescriptions are currently queued.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {prescriptions.map((p) => {
        const preview = p.raw_ocr_text.split('\n')[0] || 'Prescription Image';
        const formattedDate = new Date(p.created_at).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        const isLowConfidence = (p.ocr_confidence || 0) < 0.85;

        return (
          <Link
            key={p.id}
            href={`/prescriptions/${p.id}`}
            className="bg-white hover:bg-slate-50/80 border border-slate-200/90 hover:border-brand-300 rounded-xl p-5 flex items-center justify-between transition-all group shadow-2xs block"
          >
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0 mt-0.5 group-hover:border-brand-300 transition-colors">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2.5">
                  <h4 className="font-semibold text-slate-900 text-sm group-hover:text-brand-600 transition-colors font-mono">
                    Prescription {p.id.slice(0, 8)}...
                  </h4>
                  <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-mono px-2.5 py-0.5 rounded-full font-medium">
                    Awaiting Verification
                  </span>
                  {isLowConfidence && (
                    <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-mono px-2 py-0.5 rounded-full font-medium flex items-center space-x-1">
                      <ShieldAlert className="w-3 h-3 text-rose-600" />
                      <span>Low OCR Confidence</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1 font-mono line-clamp-1">{preview}</p>
                <div className="flex items-center space-x-4 text-[11px] text-slate-500 mt-2">
                  <span className="flex items-center space-x-1">
                    <User className="w-3 h-3 text-slate-400" />
                    <span>Patient: {p.patient_id.slice(0, 8)}...</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>{formattedDate}</span>
                  </span>
                  {p.ocr_confidence && (
                    <span className="text-slate-500 font-mono">
                      OCR Match: {(p.ocr_confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-slate-500 group-hover:text-brand-600 text-xs font-semibold shrink-0">
              <span className="hidden sm:inline">Review & Verify</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
