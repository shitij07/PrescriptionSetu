'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { FormattedMedication } from '../../../lib/types';
import { BadgePill } from '../../../components/ui/BadgePill';
import { AlertBanner } from '../../../components/AlertBanner';
import { UploadPrescriptionModal } from '../../../components/UploadPrescriptionModal';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  HeartPulse,
  Pill,
  Trash2,
  AlertTriangle,
  Loader2,
  AlertCircle,
  Plus,
} from 'lucide-react';

interface PatientProfile {
  id: string;
  full_name: string;
  phone_number: string | null;
  preferred_language: string;
  meal_times: {
    breakfast: string;
    lunch: string;
    dinner: string;
    bedtime: string;
  } | null;
  // Missing in API response
  age?: number;
  gender?: string;
  active_prescriptions_count?: number;
  active_medications?: FormattedMedication[];
}

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [isLoadingPatient, setIsLoadingPatient] = useState(true);
  const [patientError, setPatientError] = useState<string | null>(null);

  const [adherenceData, setAdherenceData] = useState<any>(null);
  const [isLoadingAdherence, setIsLoadingAdherence] = useState(true);
  
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchPatient = async () => {
      setIsLoadingPatient(true);
      try {
        const res = await api.getPatient(rawId);
        setPatient({
          ...res.patient,
          active_prescriptions_count: res.active_prescriptions_count,
          active_medications: res.active_medications || [],
        });
      } catch (err: any) {
        setPatientError(err.message || 'Failed to load patient');
      } finally {
        setIsLoadingPatient(false);
      }
    };
    fetchPatient();
  }, [rawId]);

  useEffect(() => {
    const fetchAdherence = async () => {
      setIsLoadingAdherence(true);
      try {
        const data = await api.getPatientAdherence(rawId);
        setAdherenceData(data.data || null);
      } catch (err) {
        // Fallback gracefully
      } finally {
        setIsLoadingAdherence(false);
      }
    };
    fetchAdherence();
  }, [rawId]);

  const handleDeletePatient = async () => {
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      const res = await api.deletePatient(rawId);
      setActionNotice(
        `Patient record successfully redacted and active reminders halted under DPDP Act 2023 (${res.data.cancelled_reminders_count} reminders cancelled, ${res.data.stopped_medications_count} medications stopped).`,
      );
      setTimeout(() => {
        router.push('/patients');
      }, 2000);
    } catch (err: any) {
      setErrorMessage(
        err.message || 'DPDP Erasure failed. Please verify that the patient record exists in the database.',
      );
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (isLoadingPatient) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        <p className="text-slate-500 text-sm">Loading patient profile...</p>
      </div>
    );
  }

  if (patientError || !patient) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link
            href="/patients"
            className="text-xs text-slate-500 hover:text-brand-600 flex items-center space-x-1.5 transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Patient Directory</span>
          </Link>
        </div>
        <div className="text-center py-20 bg-slate-50 border border-slate-200 border-dashed rounded-xl">
          <AlertCircle className="w-10 h-10 text-rose-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-900 mb-1">Patient Not Found</h3>
          <p className="text-xs text-slate-500">
            {patientError || 'The requested patient profile could not be found.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/patients"
            className="text-xs text-slate-500 hover:text-brand-600 flex items-center space-x-1.5 transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Patient Directory</span>
          </Link>
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold text-slate-900">{patient.full_name}</h1>
            <BadgePill variant="active">Active Patient</BadgePill>
          </div>
          <p className="text-xs text-slate-500 font-mono">Patient UUID: {patient.id}</p>
        </div>

        <div className="flex items-center space-x-3 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="px-3.5 py-2 min-h-[44px] rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Upload Prescription</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="px-3.5 py-2 min-h-[44px] rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center space-x-2 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>DPDP Right to Erasure</span>
          </button>
        </div>
      </div>

      <UploadPrescriptionModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        preselectedPatientId={rawId}
      />

      {errorMessage && (
        <AlertBanner
          type="error"
          title="DPDP Erasure Request Failed"
          message={errorMessage}
          onClose={() => setErrorMessage(null)}
        />
      )}

      {actionNotice && (
        <AlertBanner
          type="success"
          title="Patient Compliance Action"
          message={actionNotice}
          onClose={() => setActionNotice(null)}
        />
      )}

      {/* Grid: Profile Info & Meal Times */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: Demographics & Meal Times (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Patient Card */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-5 space-y-4 shadow-xs">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Patient Demographics
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Age & Gender</span>
                <span className="font-medium text-slate-900">
                  {patient.age ? `${patient.age} yrs` : 'N/A'} • {patient.gender || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Phone Number</span>
                <span className="font-mono text-slate-900">{patient.phone_number || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Preferred Language</span>
                <span className="font-medium text-brand-700">{patient.preferred_language}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Delivery Channel</span>
                <span className="font-medium text-emerald-700">WhatsApp (WABA / Marathi)</span>
              </div>
            </div>
          </div>

          {/* Meal Times Anchor Card */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-5 space-y-3 shadow-xs">
            <div className="flex items-center space-x-2 text-brand-600">
              <Clock className="w-4 h-4" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Reminder Meal Anchors (IST)
              </h2>
            </div>
            
            {patient.meal_times ? (
              <>
                <p className="text-[11px] text-slate-500">
                  Dosage timings (ac, pc, HS) dynamically calculate from these patient meal hours:
                </p>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 block uppercase">Breakfast</span>
                    <span className="text-slate-900 font-bold">{patient.meal_times.breakfast || 'N/A'}</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 block uppercase">Lunch</span>
                    <span className="text-slate-900 font-bold">{patient.meal_times.lunch || 'N/A'}</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 block uppercase">Dinner</span>
                    <span className="text-slate-900 font-bold">{patient.meal_times.dinner || 'N/A'}</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 block uppercase">Bedtime (HS)</span>
                    <span className="text-slate-900 font-bold">{patient.meal_times.bedtime || 'N/A'}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-slate-500 italic mt-2 text-center py-2">
                No custom meal times configured.
              </p>
            )}
          </div>
        </div>

        {/* Right Col: Active Regimens & Adherence (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Adherence Summary Bar */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <HeartPulse className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Adherence Tracking (Last 30 Days)
                </h2>
              </div>
              {isLoadingAdherence ? (
                <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
              ) : adherenceData?.rate !== undefined ? (
                <BadgePill variant={adherenceData.rate >= 80 ? 'confirmed' : 'pending'}>
                  {adherenceData.rate}% Adherent
                </BadgePill>
              ) : (
                <BadgePill variant="neutral">N/A</BadgePill>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 block uppercase font-mono">Doses Confirmed</span>
                <span className="text-lg font-bold text-emerald-700">
                  {adherenceData?.confirmed ?? '--'}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 block uppercase font-mono">Doses Missed</span>
                <span className="text-lg font-bold text-rose-700">
                  {adherenceData?.missed ?? '--'}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 block uppercase font-mono">Escalations</span>
                <span className="text-lg font-bold text-amber-700">
                  {adherenceData?.escalations ?? '--'}
                </span>
              </div>
            </div>
          </div>

          {/* Active Prescriptions / Medications */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Pill className="w-4 h-4 text-brand-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Active Medication Regimens
                </h2>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {patient.active_medications
                  ? `${patient.active_medications.length} Active Regimen${patient.active_medications.length === 1 ? '' : 's'}`
                  : '0 Active Regimens'}
              </span>
            </div>

            {(!patient.active_medications || patient.active_medications.length === 0) ? (
              <div className="text-center py-8 bg-slate-50 border border-slate-200 border-dashed rounded-xl">
                <Pill className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-600">No active medication regimens</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Medications will appear here once verified and activated through the Verification Workstation.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {patient.active_medications.map((med) => {
                  const { effective_fields } = med;

                  // Helper to strip trailing decimal zeroes from numeric values or strings
                  const formatNumeric = (val: unknown): string | null => {
                    if (val === null || val === undefined) return null;
                    const num = typeof val === 'number' ? val : Number(val);
                    return isNaN(num) ? String(val) : String(num);
                  };

                  // Dose string
                  let doseStr = 'Not stated';
                  const formattedStrength = formatNumeric(effective_fields.dose_strength_value);
                  if (formattedStrength !== null) {
                    doseStr = `${formattedStrength}${effective_fields.dose_strength_unit || 'mg'}`;
                    if (effective_fields.dose_amount !== null) {
                      const amt =
                        typeof effective_fields.dose_amount === 'object' && 'value' in effective_fields.dose_amount
                          ? effective_fields.dose_amount.value
                          : effective_fields.dose_amount;
                      doseStr += ` (${amt} ${effective_fields.dose_unit || 'tablet'})`;
                    }
                  } else if (effective_fields.dose_amount !== null) {
                    const amt =
                      typeof effective_fields.dose_amount === 'object' && 'value' in effective_fields.dose_amount
                        ? effective_fields.dose_amount.value
                        : effective_fields.dose_amount;
                    doseStr = `${amt} ${effective_fields.dose_unit || 'tablet'}`;
                  }

                  // Frequency string
                  const freqStr = effective_fields.frequency_code
                    ? `${effective_fields.frequency_code.replace(/_/g, ' ')}${
                        effective_fields.times_per_day ? ` (${effective_fields.times_per_day}x/day)` : ''
                      }`
                    : 'Not stated';

                  // Duration string
                  const formattedDur = formatNumeric(effective_fields.duration_value);
                  const durStr =
                    formattedDur !== null
                      ? `${formattedDur} ${effective_fields.duration_unit || 'day'}${
                          Number(formattedDur) === 1 ? '' : 's'
                        }`
                      : effective_fields.duration_indefinite
                      ? 'Indefinite (Continuous)'
                      : 'Not stated';

                  // Timing string
                  const timingStr =
                    effective_fields.timing_anchors && effective_fields.timing_anchors.length > 0
                      ? effective_fields.timing_anchors.map((t) => t.replace(/_/g, ' ').toLowerCase()).join(', ')
                      : null;

                  return (
                    <div
                      key={med.id}
                      className="bg-slate-50/50 border border-slate-200/90 rounded-xl p-4 space-y-3 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-slate-900 text-sm flex items-center space-x-2">
                            <span>{med.drug_name || 'Extracted Medication'}</span>
                            {effective_fields.as_needed && (
                              <span className="text-[10px] bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200 font-medium">
                                SOS / PRN
                              </span>
                            )}
                          </h3>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Medication ID: {med.id.slice(0, 8)}...
                          </p>
                        </div>
                        <span
                          className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium capitalize border ${
                            med.verification_status === 'confirmed'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-brand-50 text-brand-700 border-brand-200'
                          }`}
                        >
                          {med.verification_status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                          <span className="text-[10px] uppercase font-mono text-slate-400 block">Dosage</span>
                          <span className="font-medium text-slate-800">{doseStr}</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                          <span className="text-[10px] uppercase font-mono text-slate-400 block">Frequency</span>
                          <span className="font-medium text-slate-800">{freqStr}</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                          <span className="text-[10px] uppercase font-mono text-slate-400 block">Timing</span>
                          <span className="font-medium text-slate-800">{timingStr || 'Standard'}</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                          <span className="text-[10px] uppercase font-mono text-slate-400 block">Duration</span>
                          <span className="font-medium text-slate-800">{durStr}</span>
                        </div>
                      </div>

                      {med.display_expansions && med.display_expansions.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200/60">
                          <span className="text-[10px] uppercase font-mono text-slate-400 font-semibold mr-1">
                            Expansions:
                          </span>
                          {med.display_expansions.map((exp, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded text-[11px]"
                              title={`Rule: ${exp.rule_id}`}
                            >
                              <span className="font-mono font-semibold text-slate-900">{exp.matched_literal}</span>
                              <span className="text-slate-400">→</span>
                              <span className="text-slate-600 italic">{exp.canonical_expansion}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                        <Link
                          href={`/prescriptions/${med.prescription_id}`}
                          className="font-mono text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-1"
                        >
                          <span>Prescription: RX-{med.prescription_id.slice(0, 8)}</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                        <span className="text-[10px] text-slate-400">
                          Verified & Active
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete / Erasure Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center space-x-2.5 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-bold text-slate-900">DPDP Patient Erasure</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to execute a Right to Erasure for{' '}
              <strong className="text-slate-900">{patient.full_name}</strong> under the Digital Personal Data Protection Act?
            </p>
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-800 space-y-1">
              <p>• Redacts personal identifiers (name, phone number).</p>
              <p>• Immediately cancels all pending WhatsApp reminders (SI-10, SI-11).</p>
              <p>• Logs immutable audit event in medication_audit_events.</p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeletePatient}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Erasing...' : 'Confirm DPDP Erasure'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
