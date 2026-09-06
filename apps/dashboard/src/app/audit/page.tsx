'use client';

import React, { useState } from 'react';
import { SearchFilterBar } from '../../components/SearchFilterBar';
import { BadgePill, BadgeVariant } from '../../components/ui/BadgePill';
import { StatCard } from '../../components/ui/StatCard';
import { ShieldCheck, Edit3, XCircle, StopCircle, Trash2, CheckCircle, UserCheck } from 'lucide-react';

interface AuditEvent {
  id: string;
  event_type: 'medication_confirmed' | 'medication_corrected' | 'medication_rejected' | 'medication_stopped' | 'patient_erased';
  timestamp: string;
  target_id: string;
  verifier_id: string;
  verifier_name: string;
  details: string;
  reason?: string;
}

const mockAuditEvents: AuditEvent[] = [
  {
    id: 'aud-001',
    event_type: 'medication_corrected',
    timestamp: '2026-08-30 14:15:22 IST',
    target_id: 'med-84920-02 (Telmisartan 40mg)',
    verifier_id: '00000000-0000-0000-0000-000000000001',
    verifier_name: 'Dr. Ananya Patil',
    details: 'Modified timing anchor: Unanchored OD → Morning (08:00 AM)',
    reason: 'Resolved morning timing ambiguity with patient telephone confirmation.',
  },
  {
    id: 'aud-002',
    event_type: 'medication_confirmed',
    timestamp: '2026-08-30 14:12:05 IST',
    target_id: 'med-84920-01 (Metformin 500mg)',
    verifier_id: '00000000-0000-0000-0000-000000000001',
    verifier_name: 'Dr. Ananya Patil',
    details: 'Confirmed 1 tab 500mg BD x 30 days pc per source span [17, 19)',
  },
  {
    id: 'aud-003',
    event_type: 'medication_stopped',
    timestamp: '2026-08-30 11:30:10 IST',
    target_id: 'med-71203-01 (Aspirin 75mg)',
    verifier_id: '00000000-0000-0000-0000-000000000001',
    verifier_name: 'Dr. Ananya Patil',
    details: 'Lifecycle transitioned active → stopped. 14 pending reminders cancelled.',
    reason: 'Patient reported mild gastric discomfort; doctor recommended temporary suspension.',
  },
  {
    id: 'aud-004',
    event_type: 'medication_rejected',
    timestamp: '2026-08-30 09:45:18 IST',
    target_id: 'med-60912-03 (Unreadable notation)',
    verifier_id: '00000000-0000-0000-0000-000000000001',
    verifier_name: 'Dr. Ananya Patil',
    details: 'Rejected candidate OCR fragment "T05 x 5"',
    reason: 'Unresolvable handwriting smudge on dosage column; scheduled doctor re-scan.',
  },
  {
    id: 'aud-005',
    event_type: 'patient_erased',
    timestamp: '2026-08-29 16:20:00 IST',
    target_id: 'patient-40912-99',
    verifier_id: '00000000-0000-0000-0000-000000000001',
    verifier_name: 'Dr. Ananya Patil',
    details: 'DPDP Right to Erasure executed. PII scrubbed, caregiver links severed, reminders purged.',
    reason: 'Formal patient request under DPDP Act 2023 §12.',
  },
];

export default function ClinicalAuditPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const filtered = mockAuditEvents.filter((e) => {
    const matchesSearch =
      e.target_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.reason && e.reason.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (typeFilter !== 'all' && e.event_type !== typeFilter) return false;
    return true;
  });

  const getEventBadge = (type: AuditEvent['event_type']) => {
    switch (type) {
      case 'medication_confirmed':
        return { variant: 'confirmed' as BadgeVariant, label: 'Confirmed', icon: CheckCircle };
      case 'medication_corrected':
        return { variant: 'corrected' as BadgeVariant, label: 'Corrected (SI-14)', icon: Edit3 };
      case 'medication_rejected':
        return { variant: 'rejected' as BadgeVariant, label: 'Rejected', icon: XCircle };
      case 'medication_stopped':
        return { variant: 'stopped' as BadgeVariant, label: 'Stopped (SI-10)', icon: StopCircle };
      case 'patient_erased':
        return { variant: 'urgent' as BadgeVariant, label: 'DPDP Erasure', icon: Trash2 };
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Audit Events"
          value={mockAuditEvents.length}
          subtitle="Immutable SI-14 record log"
          accentColor="brand"
          icon={ShieldCheck}
        />
        <StatCard
          label="Clinical Corrections"
          value="1"
          subtitle="With verified clinical reasons"
          accentColor="amber"
          icon={Edit3}
        />
        <StatCard
          label="Medication Stops"
          value="1"
          subtitle="Atomic reminder cancellation"
          accentColor="mint"
          icon={StopCircle}
        />
        <StatCard
          label="DPDP Erasures"
          value="1"
          subtitle="Compliance scrub events"
          accentColor="rose"
          icon={Trash2}
        />
      </div>

      {/* Filter and Search */}
      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search audit events by target, action, or reason..."
        filterValue={typeFilter}
        onFilterChange={setTypeFilter}
        filterOptions={[
          { label: 'All Event Types', value: 'all' },
          { label: 'Confirmations', value: 'medication_confirmed' },
          { label: 'Clinical Corrections', value: 'medication_corrected' },
          { label: 'Rejections', value: 'medication_rejected' },
          { label: 'Stops', value: 'medication_stopped' },
          { label: 'DPDP Erasures', value: 'patient_erased' },
        ]}
      />

      {/* Audit Log List */}
      <div className="space-y-3">
        {filtered.map((event) => {
          const badge = getEventBadge(event.event_type);

          return (
            <div
              key={event.id}
              className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-xl p-5 transition-all shadow-2xs space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2.5">
                  <BadgePill variant={badge.variant}>{badge.label}</BadgePill>
                  <span className="font-mono text-xs font-semibold text-slate-900">
                    {event.target_id}
                  </span>
                </div>
                <div className="flex items-center space-x-4 text-[11px] text-slate-500 font-mono">
                  <span className="flex items-center space-x-1">
                    <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-700">{event.verifier_name}</span>
                  </span>
                  <span>{event.timestamp}</span>
                </div>
              </div>

              <p className="text-xs text-slate-700 font-sans leading-relaxed">{event.details}</p>

              {event.reason && (
                <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 font-mono">
                  <strong className="text-amber-800 font-semibold">Audited Reason:</strong>{' '}
                  {event.reason}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
