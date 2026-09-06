import React, { useState } from 'react';
import { FormattedMedication, EffectiveClinicalFields } from '../lib/types';
import { X, Check } from 'lucide-react';

interface CorrectionModalProps {
  medication: FormattedMedication | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (corrections: Partial<EffectiveClinicalFields>, reason?: string) => Promise<void>;
  isProcessing?: boolean;
}

export function CorrectionModal({
  medication,
  isOpen,
  onClose,
  onSubmit,
  isProcessing,
}: CorrectionModalProps) {
  if (!isOpen || !medication) return null;

  const ef = medication.effective_fields;

  const formatInitialNumber = (val: unknown): string => {
    if (val === null || val === undefined || val === '') return '';
    const num = typeof val === 'number' ? val : Number(val);
    return isNaN(num) ? String(val) : String(num);
  };

  const [drugName, setDrugName] = useState(medication.drug_name || '');
  const [frequencyCode, setFrequencyCode] = useState(ef.frequency_code || '');
  const [timesPerDay, setTimesPerDay] = useState(formatInitialNumber(ef.times_per_day));
  const [doseAmount, setDoseAmount] = useState(
    typeof ef.dose_amount === 'object' && ef.dose_amount && 'value' in ef.dose_amount
      ? formatInitialNumber(ef.dose_amount.value)
      : formatInitialNumber(ef.dose_amount),
  );
  const [doseUnit, setDoseUnit] = useState<NonNullable<EffectiveClinicalFields['dose_unit']>>(
    ef.dose_unit || 'tablet',
  );
  const [strengthValue, setStrengthValue] = useState(formatInitialNumber(ef.dose_strength_value));
  const [strengthUnit, setStrengthUnit] = useState<NonNullable<EffectiveClinicalFields['dose_strength_unit']>>(
    ef.dose_strength_unit || 'mg',
  );
  const [durationValue, setDurationValue] = useState(formatInitialNumber(ef.duration_value));
  const [durationUnit, setDurationUnit] = useState<NonNullable<EffectiveClinicalFields['duration_unit']>>(
    ef.duration_unit || 'day',
  );
  const [asNeeded, setAsNeeded] = useState(Boolean(ef.as_needed));
  const [reason, setReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const corrections: Partial<EffectiveClinicalFields> = {};

    if (drugName.trim()) (corrections as any).drug_name = drugName.trim();
    if (frequencyCode) corrections.frequency_code = frequencyCode as any;
    if (timesPerDay) corrections.times_per_day = Number(timesPerDay);
    if (doseAmount) corrections.dose_amount = Number(doseAmount) as any;
    if (doseUnit) corrections.dose_unit = doseUnit;
    if (strengthValue) corrections.dose_strength_value = Number(strengthValue);
    if (strengthUnit) corrections.dose_strength_unit = strengthUnit;
    if (durationValue) corrections.duration_value = Number(durationValue);
    if (durationUnit) corrections.duration_unit = durationUnit;
    corrections.as_needed = asNeeded;

    await onSubmit(corrections, reason.trim() || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h3 className="text-base font-semibold text-slate-900">
            Correct Medication Clinical Fields
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 font-medium mb-1">Drug Name</label>
            <input
              type="text"
              value={drugName}
              onChange={(e) => setDrugName(e.target.value)}
              placeholder="e.g. Metformin"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-brand-500 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-medium mb-1">Frequency Code</label>
              <select
                value={frequencyCode}
                onChange={(e) => setFrequencyCode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-brand-500 focus:bg-white font-medium"
              >
                <option value="">Select frequency</option>
                <option value="ONCE_DAILY">ONCE DAILY (OD)</option>
                <option value="TWICE_DAILY">TWICE DAILY (BD)</option>
                <option value="THRICE_DAILY">THRICE DAILY (TDS)</option>
                <option value="FOUR_TIMES_DAILY">FOUR TIMES DAILY (QID)</option>
                <option value="BEDTIME">BEDTIME (HS)</option>
                <option value="AS_NEEDED">AS NEEDED (SOS/PRN)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">Times Per Day</label>
              <input
                type="number"
                value={timesPerDay}
                onChange={(e) => setTimesPerDay(e.target.value)}
                placeholder="e.g. 2"
                min={1}
                max={12}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-brand-500 focus:bg-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-medium mb-1">Dose Amount</label>
              <input
                type="number"
                step="any"
                value={doseAmount}
                onChange={(e) => setDoseAmount(e.target.value)}
                placeholder="e.g. 1"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-brand-500 focus:bg-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">Dose Unit</label>
              <select
                value={doseUnit}
                onChange={(e) => setDoseUnit(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-brand-500 focus:bg-white"
              >
                <option value="tablet">tablet</option>
                <option value="ml">ml</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-medium mb-1">Strength Value</label>
              <input
                type="number"
                step="any"
                value={strengthValue}
                onChange={(e) => setStrengthValue(e.target.value)}
                placeholder="e.g. 500"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-brand-500 focus:bg-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">Strength Unit</label>
              <select
                value={strengthUnit}
                onChange={(e) => setStrengthUnit(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-brand-500 focus:bg-white"
              >
                <option value="mg">mg</option>
                <option value="g">g</option>
                <option value="mcg">mcg</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-medium mb-1">Duration Value</label>
              <input
                type="number"
                value={durationValue}
                onChange={(e) => setDurationValue(e.target.value)}
                placeholder="e.g. 30"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-brand-500 focus:bg-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">Duration Unit</label>
              <select
                value={durationUnit}
                onChange={(e) => setDurationUnit(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-brand-500 focus:bg-white"
              >
                <option value="day">day</option>
                <option value="week">week</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="asNeededCheck"
              checked={asNeeded}
              onChange={(e) => setAsNeeded(e.target.checked)}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="asNeededCheck" className="text-slate-700 font-medium cursor-pointer">
              As needed / SOS / PRN
            </label>
          </div>
          {asNeeded && frequencyCode && frequencyCode !== 'AS_NEEDED' && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded-lg">
              <strong>Clinical notice:</strong> Marking &quot;As needed (SOS/PRN)&quot; alongside a recurring frequency ({frequencyCode}) creates conflicting scheduling instructions. Scheduled WhatsApp reminders will not be generated for PRN/SOS medications (SI-08).
            </p>
          )}

          <div className="pt-2 border-t border-slate-100">
            <label className="block text-slate-700 font-medium mb-1">
              Audit Reason <span className="text-slate-400 font-normal">(Optional explanation for clinical record)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Corrected OD to BD per doctor telephone confirmation"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-brand-500 focus:bg-white"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm shadow-brand-500/20"
            >
              <Check className="w-4 h-4" />
              <span>{isProcessing ? 'Saving...' : 'Apply Correction'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
