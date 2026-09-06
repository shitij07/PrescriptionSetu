'use client';

/**
 * Clinical Audit Workstation (/audit).
 * Authoritative sources: `SAFETY_INVARIANTS.md` SI-14, SI-16, `docs/DECISIONS.md` D-033, D-034,
 * `.stitch/SCREENS.md` screen `064280f7673e4be4a21370a31f968915`.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api, AuditEventRecord, AuditSummaryMetrics } from '../../lib/api';
import { AlertBanner } from '../../components/AlertBanner';
import { SearchFilterBar } from '../../components/SearchFilterBar';
import { BadgePill, BadgeVariant } from '../../components/ui/BadgePill';
import { StatCard } from '../../components/ui/StatCard';
import {
  ShieldCheck,
  Edit3,
  XCircle,
  StopCircle,
  Trash2,
  CheckCircle,
  UserCheck,
  FileText,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  Calendar,
} from 'lucide-react';

function formatAuditTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return (
      d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }) + ' IST'
    );
  } catch {
    return isoString;
  }
}

function getEventBadge(event: AuditEventRecord) {
  if (event.reason === 'PATIENT_ERASURE_REQUEST') {
    return { variant: 'urgent' as BadgeVariant, label: 'DPDP Erasure', icon: Trash2 };
  }
  switch (event.event_type) {
    case 'confirmed':
      return { variant: 'confirmed' as BadgeVariant, label: 'Confirmed', icon: CheckCircle };
    case 'corrected':
      return { variant: 'corrected' as BadgeVariant, label: 'Corrected (SI-14)', icon: Edit3 };
    case 'rejected':
      return { variant: 'rejected' as BadgeVariant, label: 'Rejected', icon: XCircle };
    case 'stopped':
      return { variant: 'stopped' as BadgeVariant, label: 'Stopped (SI-10)', icon: StopCircle };
    case 'parsed':
      return { variant: 'default' as BadgeVariant, label: 'Parsed (Deterministic)', icon: FileText };
    default:
      return { variant: 'default' as BadgeVariant, label: event.event_type, icon: ShieldCheck };
  }
}

function getEventDescription(event: AuditEventRecord): string {
  if (event.reason === 'PATIENT_ERASURE_REQUEST') {
    return 'DPDP Right to Erasure executed. Patient PII scrubbed, active medications halted, and pending reminders purged.';
  }
  switch (event.event_type) {
    case 'confirmed':
      return 'Medication instructions confirmed without modification by clinical verifier.';
    case 'corrected':
      return 'Clinical instruction fields corrected from parsed OCR shorthand. Human verification override applied.';
    case 'rejected':
      return 'Medication candidate rejected by clinical verifier. Line will not be activated or generate reminders.';
    case 'stopped':
      return 'Medication course transitioned to stopped. All pending reminders cancelled atomically.';
    case 'parsed':
      return 'Initial deterministic shorthand parsing completed. Awaiting human verification sign-off.';
    default:
      return `Audit event recorded for ${event.drug_name}.`;
  }
}

export default function ClinicalAuditPage() {
  const [events, setEvents] = useState<AuditEventRecord[]>([]);
  const [summary, setSummary] = useState<AuditSummaryMetrics>({
    total_events: 0,
    corrections_count: 0,
    stops_count: 0,
    rejections_count: 0,
    confirmations_count: 0,
    erasures_count: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});

  const fetchAuditEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAuditEvents({
        event_type: typeFilter !== 'all' ? typeFilter : undefined,
        search: searchQuery.trim() || undefined,
        limit: 100,
      });
      setEvents(res.events || []);
      if (res.summary) {
        setSummary(res.summary);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load clinical audit events from server');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, searchQuery]);

  useEffect(() => {
    fetchAuditEvents();
  }, [fetchAuditEvents]);

  const toggleDiff = (id: string) => {
    setExpandedDiffs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const getChangedFields = (oldVal: any, newVal: any) => {
    if (!oldVal || !newVal || typeof oldVal !== 'object' || typeof newVal !== 'object') {
      return [];
    }
    const keys = Array.from(new Set([...Object.keys(oldVal), ...Object.keys(newVal)]));
    const ignoredKeys = new Set(['created_at', 'updated_at', 'verified_at', 'id', 'prescription_id', 'parse_result']);
    const changes: { field: string; from: any; to: any }[] = [];

    for (const k of keys) {
      if (ignoredKeys.has(k)) continue;
      const v1 = JSON.stringify(oldVal[k]);
      const v2 = JSON.stringify(newVal[k]);
      if (v1 !== v2) {
        changes.push({
          field: k,
          from: oldVal[k] !== undefined && oldVal[k] !== null ? String(oldVal[k]) : 'empty',
          to: newVal[k] !== undefined && newVal[k] !== null ? String(newVal[k]) : 'empty',
        });
      }
    }
    return changes;
  };

  return (
    <div className="space-y-6">
      {/* Top Header Metrics (D-034 Light Health-Tech) */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Audit Events"
          value={loading ? '...' : summary.total_events}
          subtitle="Immutable SI-14 record log"
          accentColor="brand"
          icon={ShieldCheck}
        />
        <StatCard
          label="Clinical Corrections"
          value={loading ? '...' : summary.corrections_count}
          subtitle="With verified clinical reasons"
          accentColor="amber"
          icon={Edit3}
        />
        <StatCard
          label="Medication Stops"
          value={loading ? '...' : summary.stops_count}
          subtitle="Atomic reminder cancellation"
          accentColor="mint"
          icon={StopCircle}
        />
        <StatCard
          label="DPDP Erasures"
          value={loading ? '...' : summary.erasures_count}
          subtitle="Compliance scrub events"
          accentColor="rose"
          icon={Trash2}
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1">
          <SearchFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Search audit events by medication, patient, action, or reason..."
            filterValue={typeFilter}
            onFilterChange={setTypeFilter}
            filterOptions={[
              { label: 'All Event Types', value: 'all' },
              { label: 'Confirmations', value: 'confirmed' },
              { label: 'Clinical Corrections', value: 'corrected' },
              { label: 'Rejections', value: 'rejected' },
              { label: 'Medication Stops', value: 'stopped' },
              { label: 'DPDP Erasures', value: 'erasure' },
              { label: 'Deterministic Parsed', value: 'parsed' },
            ]}
          />
        </div>
        <button
          onClick={fetchAuditEvents}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold shadow-2xs transition-colors self-start sm:self-auto disabled:opacity-50"
          title="Refresh audit records"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-brand-600' : 'text-slate-500'}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Error State */}
      {error && (
        <AlertBanner
          type="error"
          title="Audit Trail Synchronization Error"
          message={error}
        />
      )}

      {/* Loading Skeleton */}
      {loading && events.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs animate-pulse space-y-3">
              <div className="h-4 bg-slate-100 rounded w-1/3" />
              <div className="h-3 bg-slate-100 rounded w-2/3" />
              <div className="h-8 bg-slate-50 rounded w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && events.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center shadow-2xs space-y-2">
          <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">No Audit Events Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No clinical audit events match your current filter and search criteria.
          </p>
        </div>
      )}

      {/* Live Audit Log List */}
      <div className="space-y-3">
        {events.map((event) => {
          const badge = getEventBadge(event);
          const isExpanded = !!expandedDiffs[event.id];
          const changedFields = event.event_type === 'corrected' ? getChangedFields(event.old_value, event.new_value) : [];

          return (
            <div
              key={event.id}
              className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-xl p-5 transition-all shadow-2xs space-y-3"
            >
              {/* Header Row: Badge, Drug Name, Patient, Actor, Timestamp */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <BadgePill variant={badge.variant}>{badge.label}</BadgePill>
                  <span className="font-mono text-xs font-semibold text-slate-900">
                    {event.drug_name}
                  </span>
                  {event.patient_id && (
                    <span className="text-[11px] text-slate-500 font-sans">
                      for{' '}
                      <Link
                        href={`/patients/${event.patient_id}`}
                        className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
                      >
                        {event.patient_name}
                      </Link>
                    </span>
                  )}
                  {event.prescription_id && (
                    <Link
                      href={`/prescriptions/${event.prescription_id}`}
                      className="inline-flex items-center gap-0.5 font-mono text-[10px] text-slate-400 hover:text-brand-600 ml-1"
                      title="View Prescription"
                    >
                      <span>Rx: {event.prescription_id.slice(0, 8)}...</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </Link>
                  )}
                </div>

                <div className="flex items-center space-x-4 text-[11px] text-slate-500 font-mono self-end sm:self-auto">
                  <span className="flex items-center space-x-1">
                    <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-700">{event.actor_name}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{formatAuditTimestamp(event.created_at)}</span>
                  </span>
                </div>
              </div>

              {/* Action Description */}
              <p className="text-xs text-slate-700 font-sans leading-relaxed">
                {getEventDescription(event)}
              </p>

              {/* Audited Reason Box */}
              {event.reason && (
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-lg p-3 text-xs text-amber-900 font-mono">
                  <strong className="text-amber-800 font-semibold">Audited Reason:</strong>{' '}
                  {event.reason}
                </div>
              )}

              {/* Clinical Field Diff for Corrections (SI-14 Before vs After) */}
              {event.event_type === 'corrected' && (
                <div className="pt-1">
                  <button
                    onClick={() => toggleDiff(event.id)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                  >
                    <span>{isExpanded ? 'Hide Before & After Values' : 'View Before & After Clinical Values'}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                      <div className="font-semibold text-[11px] text-slate-700 uppercase tracking-wider">
                        Field-Level Clinical Changes (SI-14)
                      </div>
                      {changedFields.length > 0 ? (
                        <div className="space-y-1.5 font-mono text-[11px]">
                          {changedFields.map((change) => (
                            <div key={change.field} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                              <span className="font-semibold text-slate-600 min-w-[130px]">{change.field}:</span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="line-through text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                  {change.from}
                                </span>
                                <span className="text-slate-400">→</span>
                                <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-semibold">
                                  {change.to}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                          <div className="p-2 bg-white rounded border border-slate-200">
                            <span className="font-semibold text-slate-500 block mb-1">Old Value Snapshot:</span>
                            <pre className="text-[10px] text-slate-700 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(event.old_value, null, 2)}
                            </pre>
                          </div>
                          <div className="p-2 bg-white rounded border border-slate-200">
                            <span className="font-semibold text-slate-500 block mb-1">New Value Snapshot:</span>
                            <pre className="text-[10px] text-slate-700 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(event.new_value, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
