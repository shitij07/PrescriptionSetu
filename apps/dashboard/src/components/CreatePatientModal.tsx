'use client';

import React, { useState, useEffect } from 'react';
import { X, UserPlus, Loader2, AlertCircle, Clock } from 'lucide-react';
import { api, ApiClientError, CreatePatientPayload } from '../lib/api';

interface CreatePatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newPatient: any) => void;
}

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export function CreatePatientModal({
  isOpen,
  onClose,
  onSuccess,
}: CreatePatientModalProps) {
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<'mr' | 'en'>('mr');
  const [breakfastTime, setBreakfastTime] = useState('08:00');
  const [lunchTime, setLunchTime] = useState('13:00');
  const [dinnerTime, setDinnerTime] = useState('20:00');
  const [bedtime, setBedtime] = useState('22:00');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFullName('');
      setPhoneNumber('');
      setPreferredLanguage('mr');
      setBreakfastTime('08:00');
      setLunchTime('13:00');
      setDinnerTime('20:00');
      setBedtime('22:00');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError('Patient full name is required.');
      return;
    }

    const trimmedPhone = phoneNumber.trim();
    if (trimmedPhone && !E164_REGEX.test(trimmedPhone)) {
      setError('Phone number must be in E.164 format (e.g. +910000000019).');
      return;
    }

    const payload: CreatePatientPayload = {
      full_name: trimmedName,
      phone_number: trimmedPhone ? trimmedPhone : null,
      preferred_language: preferredLanguage,
      meal_times: {
        breakfast: breakfastTime || '08:00',
        lunch: lunchTime || '13:00',
        dinner: dinnerTime || '20:00',
        bedtime: bedtime || '22:00',
      },
    };

    try {
      setIsSubmitting(true);
      const res = await api.createPatient(payload);
      onSuccess(res.patient);
      onClose();
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError(err.message || 'Failed to register patient. Please try again.');
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
      aria-labelledby="create-patient-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4 mb-5">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600 shrink-0">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 id="create-patient-title" className="text-base font-bold text-slate-900">
                Register New Patient
              </h2>
              <p className="text-xs text-slate-500">
                Enrolls an outpatient for automated Marathi WhatsApp medication reminders.
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
          {/* Full Name */}
          <div>
            <label htmlFor="patient-full-name" className="block text-slate-700 font-semibold mb-1">
              Full Name <span className="text-rose-600">*</span>
            </label>
            <input
              id="patient-full-name"
              type="text"
              required
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Shakuntala Devi Kulkarni"
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-xs transition-all disabled:opacity-60"
            />
          </div>

          {/* WhatsApp Phone Number */}
          <div>
            <label htmlFor="patient-phone-number" className="block text-slate-700 font-semibold mb-1">
              WhatsApp Phone Number <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              id="patient-phone-number"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+910000000019"
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-xs transition-all disabled:opacity-60"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Include country code in E.164 format (e.g. <span className="font-mono text-slate-700">+910000000019</span>).
            </p>
          </div>

          {/* Preferred Language */}
          <div>
            <label htmlFor="patient-language" className="block text-slate-700 font-semibold mb-1">
              Reminder Delivery Language
            </label>
            <select
              id="patient-language"
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value as 'mr' | 'en')}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-xs transition-all disabled:opacity-60"
            >
              <option value="mr">Marathi (मराठी) — MVP Target</option>
              <option value="en">English</option>
            </select>
          </div>

          {/* Daily Routine / Meal Anchors */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center space-x-2 text-slate-800 font-semibold">
              <Clock className="w-3.5 h-3.5 text-brand-600" />
              <span>Daily Routine & Meal Anchors (IST)</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Used to calculate concrete reminder times in Asia/Kolkata (+05:30 IST) for before/after meal dosing.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div>
                <label htmlFor="meal-breakfast" className="block text-[11px] font-medium text-slate-600 mb-1">
                  Breakfast
                </label>
                <input
                  id="meal-breakfast"
                  type="time"
                  value={breakfastTime}
                  onChange={(e) => setBreakfastTime(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs font-mono focus:outline-none focus:border-brand-500 disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="meal-lunch" className="block text-[11px] font-medium text-slate-600 mb-1">
                  Lunch
                </label>
                <input
                  id="meal-lunch"
                  type="time"
                  value={lunchTime}
                  onChange={(e) => setLunchTime(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs font-mono focus:outline-none focus:border-brand-500 disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="meal-dinner" className="block text-[11px] font-medium text-slate-600 mb-1">
                  Dinner
                </label>
                <input
                  id="meal-dinner"
                  type="time"
                  value={dinnerTime}
                  onChange={(e) => setDinnerTime(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs font-mono focus:outline-none focus:border-brand-500 disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="meal-bedtime" className="block text-[11px] font-medium text-slate-600 mb-1">
                  Bedtime
                </label>
                <input
                  id="meal-bedtime"
                  type="time"
                  value={bedtime}
                  onChange={(e) => setBedtime(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs font-mono focus:outline-none focus:border-brand-500 disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 min-h-[44px] text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 min-h-[44px] text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-xs flex items-center space-x-2 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Registering...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Register Patient</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
