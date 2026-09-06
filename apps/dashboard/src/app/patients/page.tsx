'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { SearchFilterBar } from '../../components/SearchFilterBar';
import { BadgePill } from '../../components/ui/BadgePill';
import { Users, Phone, ArrowRight, HeartPulse, FileText, AlertCircle, Loader2, Plus, X } from 'lucide-react';
import { api } from '../../lib/api';
import { CreatePatientModal } from '../../components/CreatePatientModal';

export interface PatientSummary {
  id: string;
  full_name: string;
  phone_number: string | null;
  preferred_language: string;
  // These fields are not provided by /api/patients currently
  age?: number;
  gender?: string;
  active_prescriptions_count?: number;
  adherence_rate?: number;
  status?: 'active' | 'attention';
}

export default function PatientsDirectoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadPatients = async () => {
    try {
      setIsLoading(true);
      const res = await api.getPatients();
      setPatients(res.patients || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load patients');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
  }, []);

  const handlePatientCreated = (newPatient: any) => {
    setPatients((prev) => [newPatient, ...prev]);
    setSuccessMessage(`Patient "${newPatient.full_name}" registered successfully.`);
    setTimeout(() => {
      setSuccessMessage(null);
    }, 6000);
  };

  const filtered = patients.filter((p) => {
    const matchesQuery =
      p.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.phone_number && p.phone_number.includes(searchQuery)) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesQuery) return false;
    if (statusFilter === 'active') return p.status === 'active';
    if (statusFilter === 'attention') return p.status === 'attention';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600">
              <Users className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">Patient Directory</h1>
          </div>
          <p className="text-xs text-slate-500">
            Active Marathi-speaking elderly patients enrolled for automated WhatsApp medication reminders.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-xs text-slate-600 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200">
            <HeartPulse className="w-4 h-4 text-emerald-600" />
            <span>
              <strong className="text-slate-900">{patients.length}</strong> Registered Patients
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold px-3.5 py-2 min-h-[44px] rounded-xl shadow-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ New Patient</span>
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by patient name, phone, or UUID..."
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={[
          { label: 'All Patients', value: 'all' },
          { label: 'Good Adherence (≥ 80%)', value: 'active' },
          { label: 'Requires Attention (< 80%)', value: 'attention' },
        ]}
      />

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center space-x-2">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-semibold">{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center justify-between text-xs animate-in fade-in duration-200">
          <div className="flex items-center space-x-2">
            <HeartPulse className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold">{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-900 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
          <p className="text-slate-500 text-sm">Loading patient directory...</p>
        </div>
      ) : filtered.length === 0 && !error ? (
        <div className="text-center py-20 bg-slate-50 border border-slate-200 border-dashed rounded-xl">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-900 mb-1">No patients found</h3>
          <p className="text-xs text-slate-500">
            {searchQuery ? 'No patients matched your search criteria.' : 'The patient directory is currently empty.'}
          </p>
        </div>
      ) : (
        /* Patient Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((patient) => {
            const isAttention = patient.status === 'attention';

            return (
              <Link
                key={patient.id}
                href={`/patients/${patient.id}`}
                className="bg-white hover:bg-slate-50/60 border border-slate-200/90 hover:border-brand-300 rounded-xl p-5 transition-all group shadow-2xs flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm shrink-0 group-hover:border-brand-300">
                        {patient.full_name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .substring(0, 2)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900 text-sm group-hover:text-brand-600 transition-colors">
                          {patient.full_name}
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          {patient.age ? `${patient.age} yrs` : 'Age N/A'} • {patient.gender || 'Gender N/A'} • {patient.preferred_language}
                        </p>
                      </div>
                    </div>

                    {patient.status ? (
                      <BadgePill variant={isAttention ? 'pending' : 'active'}>
                        {isAttention ? 'Adherence Alert' : 'Adherence Stable'}
                      </BadgePill>
                    ) : (
                      <BadgePill variant="neutral">Status N/A</BadgePill>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200/80 text-xs mt-3">
                    <div className="flex items-center space-x-2 text-slate-600">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {patient.active_prescriptions_count !== undefined ? (
                          <strong className="text-slate-900">{patient.active_prescriptions_count}</strong>
                        ) : (
                          <span className="text-slate-400 font-mono">--</span>
                        )}{' '}
                        Active Rx
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-slate-600">
                      <HeartPulse className={`w-3.5 h-3.5 ${isAttention ? 'text-amber-500' : 'text-slate-400'}`} />
                      <span>
                        {patient.adherence_rate !== undefined ? (
                          <strong className={isAttention ? 'text-amber-700' : 'text-emerald-700'}>
                            {patient.adherence_rate}%
                          </strong>
                        ) : (
                          <span className="text-slate-400 font-mono">--</span>
                        )}{' '}
                        Adherence
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                  <span className="flex items-center space-x-1 font-mono">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span>{patient.phone_number || 'No Phone'}</span>
                  </span>

                  <span className="flex items-center space-x-1 text-slate-500 group-hover:text-brand-600 font-semibold transition-colors">
                    <span>View Details</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <CreatePatientModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handlePatientCreated}
      />
    </div>
  );
}

