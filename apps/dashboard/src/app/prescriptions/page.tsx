'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { PrescriptionRecord } from '../../lib/types';
import { PendingQueue } from '../../components/PendingQueue';
import { AlertBanner } from '../../components/AlertBanner';
import { SearchFilterBar } from '../../components/SearchFilterBar';
import { UploadPrescriptionModal } from '../../components/UploadPrescriptionModal';
import { Inbox, ShieldAlert, Plus } from 'lucide-react';

export default function PrescriptionsQueuePage() {
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

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

  // Filter prescriptions by search query and confidence
  const filtered = prescriptions.filter((p) => {
    const matchesSearch =
      p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.patient_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.raw_ocr_text.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (confidenceFilter === 'high') {
      return (p.ocr_confidence || 0) >= 0.85;
    }
    if (confidenceFilter === 'low') {
      return (p.ocr_confidence || 0) < 0.85;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <Inbox className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">Prescription Verification Queue</h1>
          </div>
          <p className="text-xs text-slate-500">
            Mandatory human verification (SI-01): verify extracted dosage, frequency, and timing before WhatsApp reminder activation.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-xs text-slate-600 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <span>
              <strong className="text-slate-900">{prescriptions.length}</strong> Prescriptions Awaiting Review
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsUploadModalOpen(true)}
            className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold px-3.5 py-2 min-h-[44px] rounded-xl shadow-xs flex items-center space-x-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Upload Prescription</span>
          </button>
        </div>
      </div>

      <UploadPrescriptionModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={(newPrescription) => {
          setPrescriptions((prev) => [newPrescription, ...prev]);
        }}
      />

      {error && (
        <AlertBanner
          type="error"
          title="Backend Connection Error"
          message={error}
          onClose={() => setError(null)}
        />
      )}

      {/* Filter and Search Bar */}
      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Filter by Prescription ID, Patient, or raw text..."
        filterValue={confidenceFilter}
        onFilterChange={setConfidenceFilter}
        filterOptions={[
          { label: 'All Confidence Scores', value: 'all' },
          { label: 'High Confidence (≥ 85%)', value: 'high' },
          { label: 'Requires Attention (< 85%)', value: 'low' },
        ]}
        onRefresh={fetchPending}
        isRefreshing={isLoading}
      />

      {/* Prescriptions List */}
      <PendingQueue prescriptions={filtered} isLoading={isLoading} />
    </div>
  );
}
