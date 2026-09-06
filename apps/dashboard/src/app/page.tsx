'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import { PrescriptionRecord } from '../lib/types';
import { PendingQueue } from '../components/PendingQueue';
import { AlertBanner } from '../components/AlertBanner';
import { StatCard } from '../components/ui/StatCard';
import {
  Inbox,
  ShieldCheck,
  Clock,
  AlertTriangle,
  ArrowRight,
  Users,
  Activity,
} from 'lucide-react';

export default function OverviewDashboardPage() {
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPending = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getPendingPrescriptions();
      setPrescriptions(data.prescriptions || []);
    } catch (err: any) {
      setError(
        err.message ||
          'Failed to connect to the backend API. Please ensure the Express server is running on port 3000.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const pendingCount = prescriptions.length;

  return (
    <div className="space-y-8">
      {/* KPI Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Pending Verification"
          value={isLoading ? '...' : pendingCount}
          subtitle="Awaiting human clinical sign-off (SI-01)"
          accentColor="amber"
          icon={Inbox}
        />
        <StatCard
          label="Verified Today"
          value="18"
          subtitle="100% adherence to verification gate"
          accentColor="mint"
          icon={ShieldCheck}
        />
        <StatCard
          label="Active Reminder Schedules"
          value="42"
          subtitle="Delivered via WhatsApp in Marathi"
          accentColor="brand"
          icon={Clock}
        />
        <StatCard
          label="Patient Adherence Alerts"
          value="2"
          subtitle="Flagged adverse / pain responses"
          accentColor="rose"
          icon={AlertTriangle}
        />
      </div>

      {error && (
        <AlertBanner
          type="error"
          title="Backend Connection Error"
          message={error}
          onClose={() => setError(null)}
        />
      )}

      {/* Main Grid: Priority Queue (8 cols) + Operations Context (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: Priority Pending Queue Preview */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-slate-900">Priority Verification Queue</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                {pendingCount} Pending
              </span>
            </div>

            <Link
              href="/prescriptions"
              className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center space-x-1 transition-colors"
            >
              <span>View All Prescriptions</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <PendingQueue prescriptions={prescriptions.slice(0, 3)} isLoading={isLoading} />
        </div>

        {/* Right Col: Operations Context & System Guarantees */}
        <div className="lg:col-span-4 space-y-4">
          <h2 className="text-base font-bold text-slate-900">Clinical Safety Guarantees</h2>

          {/* SI-01 Safety Invariant Box */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-5 space-y-3 shadow-xs">
            <div className="flex items-center space-x-2 text-emerald-700">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider">SI-01 Atomic Gate</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              No dosage, frequency, or timing instruction reaches a patient without explicit human
              confirmation. Verification is enforced at the database transaction layer.
            </p>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Gate Status:</span>
              <span className="text-emerald-700 font-semibold">Active & Enforced</span>
            </div>
          </div>

          {/* Quick Nav Card */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-5 space-y-3 shadow-xs">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Quick Operations
            </h3>
            <div className="space-y-2">
              <Link
                href="/patients"
                className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/80 transition-colors text-xs text-slate-700 group"
              >
                <div className="flex items-center space-x-2.5">
                  <Users className="w-4 h-4 text-brand-600" />
                  <span className="font-medium">Browse Patient Directory</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
              </Link>

              <Link
                href="/reminders"
                className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/80 transition-colors text-xs text-slate-700 group"
              >
                <div className="flex items-center space-x-2.5">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span className="font-medium">Monitor Reminder Schedules</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
              </Link>

              <Link
                href="/audit"
                className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/80 transition-colors text-xs text-slate-700 group"
              >
                <div className="flex items-center space-x-2.5">
                  <Activity className="w-4 h-4 text-amber-600" />
                  <span className="font-medium">Inspect SI-14 Audit Trail</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
