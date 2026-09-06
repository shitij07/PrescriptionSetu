'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, FileUp, Loader2, AlertCircle, FileText, Code2 } from 'lucide-react';
import { api, ApiClientError, UploadPrescriptionPayload } from '../lib/api';
import { PrescriptionRecord } from '../lib/types';
import { DEFAULT_CAREGIVER_ID } from './DevBanner';

interface PatientOption {
  id: string;
  full_name: string;
  phone_number: string | null;
}

interface FixtureItem {
  id: string;
  name: string;
  category: string;
  text: string;
}

const PRESET_FIXTURES: FixtureItem[] = [
  // Common Outpatient Test Fixtures
  {
    id: 'amoxicillin_500mg_tds',
    name: 'Amoxicillin 500mg TDS (Sample 01)',
    category: 'Standard Outpatient Samples',
    text: 'Tab Amoxicillin 500mg 1 tab TDS',
  },
  {
    id: 'paracetamol_bd_5days',
    name: 'Paracetamol 500mg BD x 5 days (Sample 02)',
    category: 'Standard Outpatient Samples',
    text: 'Tab Paracetamol 500mg 1 tab BD x 5 days',
  },
  {
    id: 'metformin_paracetamol_multiline',
    name: 'Metformin BD + Paracetamol SOS (Sample 03)',
    category: 'Standard Outpatient Samples',
    text: 'Tab Metformin 500mg BD\nTab Paracetamol 500mg 1 tab SOS',
  },

  // 28 Synthetic Benchmark Corpus Fixtures (SYN-01 to SYN-28)
  { id: 'SYN-01', name: 'SYN-01: Metformin 500mg 1 tab BD', category: 'Synthetic Benchmark Corpus', text: 'Tab Metformin 500mg 1 tab BD' },
  { id: 'SYN-02', name: 'SYN-02: Amoxicillin 500mg 1 tab TDS x 7 days', category: 'Synthetic Benchmark Corpus', text: 'Tab Amoxicillin 500 mg 1 tab TDS x 7 days' },
  { id: 'SYN-03', name: 'SYN-03: Telmisartan 40mg 1 tab OD pc', category: 'Synthetic Benchmark Corpus', text: 'Tab Telmisartan 40mg 1 tab OD pc' },
  { id: 'SYN-04', name: 'SYN-04: Clonazepam 0.5mg 1 tab HS', category: 'Synthetic Benchmark Corpus', text: 'Tab Clonazepam 0.5mg 1 tab HS' },
  { id: 'SYN-05', name: 'SYN-05: Pantoprazole 40mg 1 tab OD ac', category: 'Synthetic Benchmark Corpus', text: 'Tab Pantoprazole 40mg 1 tab OD ac' },
  { id: 'SYN-06', name: 'SYN-06: Paracetamol 650mg 1 tab SOS', category: 'Synthetic Benchmark Corpus', text: 'Tab Paracetamol 650mg 1 tab SOS' },
  { id: 'SYN-07', name: 'SYN-07: Paracetamol 500mg 1 tab stat', category: 'Synthetic Benchmark Corpus', text: 'Tab Paracetamol 500mg 1 tab stat' },
  { id: 'SYN-08', name: 'SYN-08: Syr Promethazine 5ml QID x 3 days', category: 'Synthetic Benchmark Corpus', text: 'Syr Promethazine 5ml QID x 3 days' },
  { id: 'SYN-09', name: 'SYN-09: Metformin BD + Glimepiride OD ac', category: 'Synthetic Benchmark Corpus', text: 'Tab Metformin 500mg 1 tab BD\nTab Glimepiride 1mg 1 tab OD ac' },
  { id: 'SYN-10', name: 'SYN-10: Telmisartan + Amlodipine + Rosuvastatin', category: 'Synthetic Benchmark Corpus', text: 'Tab Telmisartan 40mg 1 tab OD\nTab Amlodipine 5mg 1 tab OD\nTab Rosuvastatin 10mg 1 tab HS' },
  { id: 'SYN-11', name: 'SYN-11: Augmentin BD + Paracetamol SOS + Omeprazole OD ac', category: 'Synthetic Benchmark Corpus', text: 'Tab Augmentin 625mg 1 tab BD x 5 days\nTab Paracetamol 650mg 1 tab SOS\nCap Omeprazole 20mg 1 cap OD ac' },
  { id: 'SYN-12', name: 'SYN-12: Thyronorm OD ac + Calcium OD pc', category: 'Synthetic Benchmark Corpus', text: 'Tab Thyronorm 50mcg 1 tab OD ac\nTab Calcium 500mg 1 tab OD pc' },
  { id: 'SYN-13', name: 'SYN-13: Ciprofloxacin 500mg BD x 2 weeks', category: 'Synthetic Benchmark Corpus', text: 'Tab Ciprofloxacin 500mg 1 tab BD x 2 weeks' },
  { id: 'SYN-14', name: 'SYN-14: Azithromycin 500mg OD x 3/7', category: 'Synthetic Benchmark Corpus', text: 'Tab Azithromycin 500mg 1 tab OD x 3/7' },
  { id: 'SYN-15', name: 'SYN-15: Ecosprin OD pc + Clopidogrel OD pc + Atorvastatin HS', category: 'Synthetic Benchmark Corpus', text: 'Tab Ecosprin 75mg 1 tab OD pc\nTab Clopidogrel 75mg 1 tab OD pc\nTab Atorvastatin 20mg 1 tab HS' },
  { id: 'SYN-16', name: 'SYN-16: Levocetirizine HS + Syr Ambroxol TDS', category: 'Synthetic Benchmark Corpus', text: 'Tab Levocetirizine 5mg 1 tab HS x 10 days\nSyr Ambroxol 10ml TDS' },
  { id: 'SYN-17', name: 'SYN-17: Thyroxine 12.5mcg 1/2 tab OD (Fraction)', category: 'Synthetic Benchmark Corpus', text: 'Tab Thyroxine 12.5mcg 1/2 tab OD' },
  { id: 'SYN-18', name: 'SYN-18: Clonazepam 0.25mg ½ tab HS (Fraction)', category: 'Synthetic Benchmark Corpus', text: 'Tab Clonazepam 0.25mg ½ tab HS' },
  { id: 'SYN-19', name: 'SYN-19: Metformin 500mg BD continue (Bare Duration)', category: 'Synthetic Benchmark Corpus', text: 'Tab Metformin 500mg 1 tab BD continue' },
  { id: 'SYN-20', name: 'SYN-20: Multivitamin 1 tab OD x 10 (Bare Count)', category: 'Synthetic Benchmark Corpus', text: 'Tab Multivitamin 1 tab OD x 10' },
  { id: 'SYN-21', name: 'SYN-21: Syr CoughSyrup 10mL TDS x 5 days', category: 'Synthetic Benchmark Corpus', text: 'Syr CoughSyrup 10mL TDS x 5 days' },
  { id: 'SYN-22', name: 'SYN-22: Ibuprofen 400mg 1 tab PRN (As Needed)', category: 'Synthetic Benchmark Corpus', text: 'Tab Ibuprofen 400mg 1 tab PRN' },
  { id: 'SYN-23', name: 'SYN-23: Metformin 500mg 1 tab BD OD (Contradiction)', category: 'Synthetic Benchmark Corpus', text: 'Tab Metformin 500mg 1 tab BD OD' },
  { id: 'SYN-24', name: 'SYN-24: Atorvastatin 20mg 1 tab BD', category: 'Synthetic Benchmark Corpus', text: 'Tab Atorvastatin 20mg 1 tab BD' },
  { id: 'SYN-25', name: 'SYN-25: UnknownDrug 500mg BD (Unparsed)', category: 'Synthetic Benchmark Corpus', text: 'Tab UnknownDrug 500mg BD' },
  { id: 'SYN-26', name: 'SYN-26: Consultation Only (No Meds)', category: 'Synthetic Benchmark Corpus', text: 'Rx Consultation Only\nPatient Advised Bed Rest\nFollow up after blood test' },
  { id: 'SYN-27', name: 'SYN-27: Amoxicillin TDS + CorruptedLine 8D', category: 'Synthetic Benchmark Corpus', text: 'Tab Amoxicillin 500mg 1 tab TDS\nTab CorruptedLine 500mg 8D' },
  { id: 'SYN-28', name: 'SYN-28: Metformin BD + Paracetamol TDS', category: 'Synthetic Benchmark Corpus', text: 'Tab Metformin 500mg 1 tab BD\nTab Paracetamol 500mg 1 tab TDS' },
];

export interface UploadPrescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedPatientId?: string;
  onSuccess?: (prescription: PrescriptionRecord) => void;
}

export function UploadPrescriptionModal({
  isOpen,
  onClose,
  preselectedPatientId,
  onSuccess,
}: UploadPrescriptionModalProps) {
  const router = useRouter();

  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(preselectedPatientId || '');
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);

  const [mode, setMode] = useState<'fixture' | 'direct'>('fixture');
  const [fixtureKey, setFixtureKey] = useState<string>('amoxicillin_500mg_tds');
  const [rawText, setRawText] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load patients when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsSubmitting(false);
      if (preselectedPatientId) {
        setSelectedPatientId(preselectedPatientId);
      }

      const fetchPatients = async () => {
        setIsLoadingPatients(true);
        try {
          const res = await api.getPatients();
          const patientList = res.patients || [];
          setPatients(patientList);
          if (!preselectedPatientId && patientList.length > 0 && !selectedPatientId) {
            setSelectedPatientId(patientList[0].id);
          }
        } catch {
          // Keep patient list empty; error handled on submit if none available
        } finally {
          setIsLoadingPatients(false);
        }
      };

      fetchPatients();
    }
  }, [isOpen, preselectedPatientId]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const selectedFixture = PRESET_FIXTURES.find((f) => f.id === fixtureKey) || PRESET_FIXTURES[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedPatientId) {
      setError('Please select a patient for this prescription.');
      return;
    }

    if (mode === 'direct' && !rawText.trim()) {
      setError('Please enter raw prescription shorthand text.');
      return;
    }

    const payload: UploadPrescriptionPayload = {
      patient_id: selectedPatientId,
      caregiver_id: DEFAULT_CAREGIVER_ID,
      ...(mode === 'fixture' ? { fixture_key: fixtureKey } : { raw_text: rawText.trim() }),
    };

    try {
      setIsSubmitting(true);
      const res = await api.uploadPrescription(payload);
      if (onSuccess) {
        onSuccess(res.prescription);
      }
      onClose();
      router.push(`/prescriptions/${res.prescription.id}`);
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError(err.message || 'Failed to upload and parse prescription. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-prescription-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4 mb-5">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600 shrink-0">
              <FileUp className="w-5 h-5" />
            </div>
            <div>
              <h2 id="upload-prescription-title" className="text-base font-bold text-slate-900">
                Upload & Ingest Prescription
              </h2>
              <p className="text-xs text-slate-500">
                Runs OCR perception and deterministic shorthand parsing into the SI-01 Verification Gate.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-start space-x-2.5 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span className="font-semibold leading-relaxed">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4 text-xs">
          {/* Patient Selector */}
          <div>
            <label htmlFor="upload-patient-select" className="block text-slate-700 font-semibold mb-1">
              Select Enrolled Patient <span className="text-rose-600">*</span>
            </label>
            {isLoadingPatients ? (
              <div className="flex items-center space-x-2 text-slate-500 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                <span>Loading active patients...</span>
              </div>
            ) : (
              <select
                id="upload-patient-select"
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                disabled={isSubmitting || patients.length === 0}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-xs transition-all disabled:opacity-60"
              >
                {patients.length === 0 ? (
                  <option value="">No registered patients found. Please add a patient first.</option>
                ) : (
                  <>
                    <option value="">-- Choose an enrolled patient --</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} {p.phone_number ? `(${p.phone_number})` : '(No Phone)'}
                      </option>
                    ))}
                  </>
                )}
              </select>
            )}
            <p className="mt-1 text-[11px] text-slate-500">
              The prescription and all candidate medication rows will be attached to this patient record.
            </p>
          </div>

          {/* Ingestion Mode Tabs */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1.5">
              Ingestion Mode
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100/80 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setMode('fixture')}
                disabled={isSubmitting}
                className={`py-2 px-3 rounded-lg font-medium text-xs flex items-center justify-center space-x-1.5 transition-all ${
                  mode === 'fixture'
                    ? 'bg-white text-brand-700 shadow-xs border border-slate-200/80 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Synthetic Fixture</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('direct')}
                disabled={isSubmitting}
                className={`py-2 px-3 rounded-lg font-medium text-xs flex items-center justify-center space-x-1.5 transition-all ${
                  mode === 'direct'
                    ? 'bg-white text-brand-700 shadow-xs border border-slate-200/80 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Direct Shorthand Text</span>
              </button>
            </div>
          </div>

          {/* Mode 1: Synthetic Fixture Selector */}
          {mode === 'fixture' && (
            <div className="space-y-3">
              <div>
                <label htmlFor="upload-fixture-select" className="block text-slate-700 font-semibold mb-1">
                  Corpus Fixture Preset
                </label>
                <select
                  id="upload-fixture-select"
                  value={fixtureKey}
                  onChange={(e) => setFixtureKey(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-xs transition-all disabled:opacity-60"
                >
                  <optgroup label="Standard Outpatient Samples">
                    {PRESET_FIXTURES.filter((f) => f.category === 'Standard Outpatient Samples').map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Synthetic Benchmark Corpus (SYN-01 to SYN-28)">
                    {PRESET_FIXTURES.filter((f) => f.category === 'Synthetic Benchmark Corpus').map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Fixture OCR Preview Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
                  <span className="font-semibold uppercase tracking-wider text-slate-600">
                    Simulated OCR Perception Output
                  </span>
                  <span className="font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    Confidence: 95%
                  </span>
                </div>
                <pre className="font-mono text-xs text-slate-800 bg-white p-2.5 rounded-lg border border-slate-200 overflow-x-auto whitespace-pre-wrap">
                  {selectedFixture.text}
                </pre>
              </div>
            </div>
          )}

          {/* Mode 2: Direct Shorthand Textarea */}
          {mode === 'direct' && (
            <div>
              <label htmlFor="upload-raw-text" className="block text-slate-700 font-semibold mb-1">
                Prescription Shorthand Text <span className="text-rose-600">*</span>
              </label>
              <textarea
                id="upload-raw-text"
                rows={4}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="e.g. Tab Metformin 500mg 1 tab BD&#10;Tab Paracetamol 500mg 1 tab SOS"
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-xs transition-all disabled:opacity-60"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Directly parsed through PrescriptionSetu's deterministic shorthand engine.
              </p>
            </div>
          )}

          {/* Safety Notice */}
          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 leading-relaxed">
            <span className="font-bold">SI-01 Safety Invariant:</span> Uploaded prescriptions enter{' '}
            <span className="font-mono font-semibold">pending_verification</span>. Zero medication instructions or
            WhatsApp reminders reach the patient until confirmed by a clinician in the Verification Workstation.
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (patients.length === 0 && !selectedPatientId)}
              className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold flex items-center space-x-2 shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing OCR & Parser...</span>
                </>
              ) : (
                <>
                  <FileUp className="w-4 h-4" />
                  <span>Upload & Parse Prescription</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
