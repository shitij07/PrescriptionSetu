'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiClientError } from '../../../lib/api';
import {
  PrescriptionRecord,
  FormattedMedication,
  SourceSpan,
  EffectiveClinicalFields,
} from '../../../lib/types';
import { DEFAULT_CAREGIVER_ID } from '../../../components/DevBanner';
import { OcrViewer } from '../../../components/OcrViewer';
import { CandidateCard } from '../../../components/CandidateCard';
import { CorrectionModal } from '../../../components/CorrectionModal';
import { RejectionDialog } from '../../../components/RejectionDialog';
import { GateStatusBar } from '../../../components/GateStatusBar';
import { AlertBanner } from '../../../components/AlertBanner';
import {
  ArrowLeft,
  RefreshCw,
  User,
  Calendar,
  Loader2,
  ChevronRight,
  Info,
  ShieldCheck,
  CheckCircle,
} from 'lucide-react';

export default function PrescriptionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const [prescription, setPrescription] = useState<PrescriptionRecord | null>(null);
  const [medications, setMedications] = useState<FormattedMedication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeSpan, setActiveSpan] = useState<SourceSpan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals state
  const [correctMedication, setCorrectMedication] = useState<FormattedMedication | null>(null);
  const [rejectMedication, setRejectMedication] = useState<FormattedMedication | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getPrescriptionDetail(id);
      setPrescription(data.prescription);
      setMedications(data.medications || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch prescription details');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleConfirm = async (medId: string) => {
    if (isVerified) return;
    setIsProcessing(true);
    setError(null);
    try {
      await api.confirmMedication(medId, DEFAULT_CAREGIVER_ID);
      await fetchDetail();
      setSuccessMsg('Medication candidate confirmed.');
    } catch (err: any) {
      setError(err.message || 'Failed to confirm medication candidate');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenCorrect = (med: FormattedMedication) => {
    if (isVerified) return;
    setCorrectMedication(med);
  };

  const handleOpenReject = (med: FormattedMedication) => {
    if (isVerified) return;
    setRejectMedication(med);
  };

  const handleSaveCorrection = async (
    corrections: Partial<EffectiveClinicalFields>,
    reason?: string,
  ) => {
    if (!correctMedication || isVerified) return;
    setIsProcessing(true);
    setError(null);
    try {
      await api.correctMedication(
        correctMedication.id,
        DEFAULT_CAREGIVER_ID,
        corrections,
        reason,
      );
      setCorrectMedication(null);
      await fetchDetail();
      setSuccessMsg('Medication candidate corrected and audited.');
    } catch (err: any) {
      setError(err.message || 'Failed to save correction');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmReject = async (reason: string) => {
    if (!rejectMedication || isVerified) return;
    setIsProcessing(true);
    setError(null);
    try {
      await api.rejectMedication(rejectMedication.id, DEFAULT_CAREGIVER_ID, reason);
      setRejectMedication(null);
      await fetchDetail();
      setSuccessMsg('Medication candidate rejected.');
    } catch (err: any) {
      setError(err.message || 'Failed to reject candidate');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerifyPrescription = async () => {
    if (!id) return;
    setIsProcessing(true);
    setError(null);
    try {
      await api.verifyPrescription(id, DEFAULT_CAREGIVER_ID);
      await fetchDetail();
      setSuccessMsg('Prescription verified! Medication reminders have been generated and activated.');
    } catch (err: any) {
      if (err instanceof ApiClientError && err.code === 'VERIFICATION_GATE_REJECTED') {
        setError(
          'Verification blocked by SI-01 Safety Gate: all medication candidates must be confirmed or corrected. Rejections or pending candidates are not permitted.',
        );
      } else {
        setError(err.message || 'Verification failed');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading && !prescription) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-3">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        <p className="text-sm font-medium text-slate-600">Loading prescription verification workstation...</p>
      </div>
    );
  }

  if (!prescription) {
    return (
      <div className="space-y-4">
        <AlertBanner
          type="error"
          title="Prescription Not Found"
          message={error || 'The requested prescription record could not be loaded.'}
        />
        <Link
          href="/prescriptions"
          className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center space-x-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Prescription Queue</span>
        </Link>
      </div>
    );
  }

  const isVerified = prescription.status === 'verified';

  return (
    <div className="space-y-6">
      {/* 5-Step Pipeline Breadcrumb & Top Bar */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-xs text-slate-500 mb-1">
            <Link href="/prescriptions" className="hover:text-brand-600 transition-colors">
              Prescription Queue
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-brand-600 font-semibold">Verification Workstation</span>
          </div>

          <h1 className="text-xl font-bold text-slate-900 flex items-center space-x-3">
            <span>Prescription #{prescription.id.slice(0, 8)}</span>
            <span
              className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-medium capitalize border ${
                isVerified
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {prescription.status.replace(/_/g, ' ')}
            </span>
          </h1>

          <div className="flex items-center space-x-4 text-xs text-slate-500 pt-1 font-mono">
            <span className="flex items-center space-x-1">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Patient: {prescription.patient_id.slice(0, 8)}...</span>
            </span>
            <span className="flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {new Date(prescription.created_at).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </span>
          </div>
        </div>

        {/* 5-Step Pipeline Tracker */}
        <div className="flex items-center gap-1.5 text-xs font-mono bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-slate-500 self-start lg:self-auto">
          <span>Upload</span> <span className="text-slate-300">→</span>
          <span>OCR</span> <span className="text-slate-300">→</span>
          <span>Parse</span> <span className="text-slate-300">→</span>
          <span className="text-brand-600 font-bold bg-brand-50 px-1.5 py-0.5 rounded border border-brand-200">
            [Review]
          </span>{' '}
          <span className="text-slate-300">→</span>
          <span>Activate</span>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <AlertBanner
          type="error"
          title="Operation Blocked"
          message={error}
          onClose={() => setError(null)}
        />
      )}
      {successMsg && (
        <AlertBanner
          type="success"
          title="Success"
          message={successMsg}
          onClose={() => setSuccessMsg(null)}
        />
      )}

      {/* Two-Column Workstation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Raw OCR Perception & Provenance Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <OcrViewer
            rawOcrText={prescription.raw_ocr_text}
            activeSpan={activeSpan}
            unparsedFragments={[]}
            confidence={prescription.ocr_confidence}
          />

          {/* Dedicated Provenance Inspector Box */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs space-y-2">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-800">
              <Info className="w-4 h-4 text-brand-600" />
              <span>Shorthand Provenance Inspector (SI-04)</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Hovering over any candidate expansion token highlights its exact source code-point
              span in the OCR transcription.
            </p>
          </div>
        </div>

        {/* Right Column: Candidate Medications (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm">
              Extracted Medication Candidates ({medications.length})
            </h3>
            <button
              type="button"
              onClick={fetchDetail}
              disabled={isProcessing}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center space-x-1"
            >
              <RefreshCw className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>Reload</span>
            </button>
          </div>

          <div className="space-y-4">
            {medications.map((med) => (
              <CandidateCard
                key={med.id}
                medication={med}
                onHoverSpan={setActiveSpan}
                onConfirm={handleConfirm}
                onOpenCorrect={handleOpenCorrect}
                onOpenReject={handleOpenReject}
                isProcessing={isProcessing}
                isVerified={isVerified}
              />
            ))}
          </div>

          {/* Bottom SI-01 Gate Status Bar */}
          <div className="pt-2">
            <GateStatusBar
              medications={medications}
              onVerify={handleVerifyPrescription}
              isProcessing={isProcessing}
              isVerified={isVerified}
            />
          </div>
        </div>
      </div>

      {/* Modals */}
      <CorrectionModal
        medication={correctMedication}
        isOpen={Boolean(correctMedication)}
        onClose={() => setCorrectMedication(null)}
        onSubmit={handleSaveCorrection}
        isProcessing={isProcessing}
      />

      <RejectionDialog
        medication={rejectMedication}
        isOpen={Boolean(rejectMedication)}
        onClose={() => setRejectMedication(null)}
        onConfirmReject={handleConfirmReject}
        isProcessing={isProcessing}
      />
    </div>
  );
}
