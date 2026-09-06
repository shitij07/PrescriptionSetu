'use client';
import React from 'react';
import { usePathname } from 'next/navigation';
import { ShieldCheck, Search, Bell } from 'lucide-react';

const routeTitles: Record<string, { title: string; subtitle: string }> = {
  '/': {
    title: 'Clinical Operations Overview',
    subtitle: 'Real-time overview of verification queues, active schedules, and patient adherence',
  },
  '/prescriptions': {
    title: 'Prescription Verification Queue',
    subtitle: 'Human verification required before reminder activation (SI-01 Gate)',
  },
  '/patients': {
    title: 'Patient Directory',
    subtitle: 'Outpatient profiles, preferred languages, meal times, and active regimens',
  },
  '/reminders': {
    title: 'Medication Reminders Monitor',
    subtitle: 'Scheduled WhatsApp reminder dispatching and delivery timeline',
  },
  '/audit': {
    title: 'Clinical Audit Log',
    subtitle: 'Immutable record of confirmations, corrections, stops, and DPDP erasures (SI-14)',
  },
  '/staff': {
    title: 'Staff & Caregiver Directory',
    subtitle: 'Authorized healthcare verifiers, assigned patients, and session roles',
  },
};

export function AppHeader() {
  const pathname = usePathname();

  let currentInfo = routeTitles[pathname];
  if (!currentInfo) {
    if (pathname.startsWith('/prescriptions/')) {
      currentInfo = {
        title: 'Prescription Review Workstation',
        subtitle: 'Compare raw OCR evidence with extracted candidates and enforce SI-01 gate',
      };
    } else if (pathname.startsWith('/patients/')) {
      currentInfo = {
        title: 'Patient Clinical Profile',
        subtitle: 'Medication regimens, adherence history, and meal-time delivery anchors',
      };
    } else {
      currentInfo = {
        title: 'Caregiver Portal',
        subtitle: 'PrescriptionSetu clinical management platform',
      };
    }
  }

  return (
    <header className="h-16 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-6 flex items-center justify-between sticky top-0 z-20">
      <div>
        <h1 className="text-sm font-bold text-slate-900 tracking-tight flex items-center space-x-2">
          <span>{currentInfo.title}</span>
        </h1>
        <p className="text-[11px] text-slate-500 hidden sm:block truncate max-w-md">
          {currentInfo.subtitle}
        </p>
      </div>

      <div className="flex items-center space-x-3">
        {/* Search Bar with ⌘K cue */}
        <div className="relative hidden md:flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-3 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search patient, drug, or ID..."
            className="w-64 bg-slate-50 border border-slate-200 focus:border-brand-500 focus:bg-white rounded-full pl-8 pr-10 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none transition-colors"
          />
          <kbd className="absolute right-2.5 px-1.5 py-0.5 text-[9px] font-mono text-slate-400 bg-white border border-slate-200 rounded shadow-2xs pointer-events-none">
            ⌘K
          </kbd>
        </div>

        {/* Global SI-01 Status Pill */}
        <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="hidden sm:inline">SI-01 Gate Active</span>
        </div>
      </div>
    </header>
  );
}
