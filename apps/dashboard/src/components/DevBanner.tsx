import React from 'react';
import { ShieldCheck, UserCheck } from 'lucide-react';

export const DEFAULT_CAREGIVER_ID = '00000000-0000-0000-0000-000000000001';

interface DevBannerProps {
  caregiverId?: string;
  caregiverName?: string;
}

export function DevBanner({
  caregiverId = DEFAULT_CAREGIVER_ID,
  caregiverName = 'Dr. Kshitij Thopate (Caregiver Session)',
}: DevBannerProps) {
  return (
    <div className="bg-slate-100/90 border-b border-slate-200 text-slate-700 text-xs px-4 py-1.5 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center space-x-2">
        <span className="bg-amber-100 text-amber-800 font-semibold text-[10px] px-2 py-0.5 rounded-full border border-amber-200">
          DEVELOPMENT MODE
        </span>
        <span className="hidden sm:inline text-slate-500 text-[11px]">
          PrescriptionSetu Caregiver Verification Workstation
        </span>
      </div>
      <div className="flex items-center space-x-4 text-[11px]">
        <div className="flex items-center space-x-1.5 text-slate-700">
          <UserCheck className="w-3.5 h-3.5 text-brand-600" />
          <span className="font-medium">{caregiverName}</span>
          <span className="font-mono text-slate-400">({caregiverId.slice(0, 8)}...)</span>
        </div>
        <div className="flex items-center space-x-1 text-emerald-700 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>SI-01 Gate Active</span>
        </div>
      </div>
    </div>
  );
}
