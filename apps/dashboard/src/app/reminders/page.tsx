'use client';

import React, { useState } from 'react';
import { SearchFilterBar } from '../../components/SearchFilterBar';
import { BadgePill } from '../../components/ui/BadgePill';
import { StatCard } from '../../components/ui/StatCard';
import { Clock, MessageSquare, Send, CheckCircle2, Sun, Moon, Sunrise, Sunset } from 'lucide-react';

interface ReminderItem {
  id: string;
  patient_name: string;
  patient_phone: string;
  drug_name: string;
  dosage: string;
  scheduled_time: string;
  time_bucket: 'Morning' | 'Afternoon' | 'Evening' | 'Bedtime';
  status: 'sent' | 'pending' | 'delivered' | 'failed';
  language: string;
  message_preview: string;
}

const mockReminders: ReminderItem[] = [
  {
    id: 'rem-001',
    patient_name: 'Ganpatrao More',
    patient_phone: '+91 98220 12345',
    drug_name: 'Metformin 500mg',
    dosage: '1 tablet after breakfast',
    scheduled_time: '08:00 AM Today',
    time_bucket: 'Morning',
    status: 'delivered',
    language: 'Marathi (मराठी)',
    message_preview: 'नमस्कार गणपतरावजी, डॉक्टर जोशींच्या सल्ल्यानुसार तुमची Metformin 500mg (१ गोळी) नाश्त्यानंतर घेण्याची वेळ झाली आहे.',
  },
  {
    id: 'rem-002',
    patient_name: 'Sunita Kulkarni',
    patient_phone: '+91 98220 23456',
    drug_name: 'Telmisartan 40mg',
    dosage: '1 tablet in morning',
    scheduled_time: '08:30 AM Today',
    time_bucket: 'Morning',
    status: 'delivered',
    language: 'Marathi (मराठी)',
    message_preview: 'नमस्कार सुनिताजी, सकाळची Telmisartan 40mg (१ गोळी) घेण्याची वेळ झाली आहे.',
  },
  {
    id: 'rem-003',
    patient_name: 'Ganpatrao More',
    patient_phone: '+91 98220 12345',
    drug_name: 'Metformin 500mg',
    dosage: '1 tablet after dinner',
    scheduled_time: '08:00 PM Today',
    time_bucket: 'Evening',
    status: 'pending',
    language: 'Marathi (मराठी)',
    message_preview: 'नमस्कार गणपतरावजी, रात्रीच्या जेवणानंतर Metformin 500mg (१ गोळी) घेण्याची आठवण.',
  },
  {
    id: 'rem-004',
    patient_name: 'Dattatray Shinde',
    patient_phone: '+91 98220 34567',
    drug_name: 'Amlodipine 5mg',
    dosage: '1 tablet at bedtime',
    scheduled_time: '09:30 PM Today',
    time_bucket: 'Bedtime',
    status: 'pending',
    language: 'Marathi (मराठी)',
    message_preview: 'नमस्कार दत्तात्रयजी, झोपण्यापूर्वी Amlodipine 5mg गोळी घेण्याची वेळ झाली आहे.',
  },
  {
    id: 'rem-005',
    patient_name: 'Shakuntala Deshmukh',
    patient_phone: '+91 98220 45678',
    drug_name: 'Pantoprazole 40mg',
    dosage: '1 tablet before breakfast',
    scheduled_time: '07:30 AM Tomorrow',
    time_bucket: 'Morning',
    status: 'pending',
    language: 'Marathi (मराठी)',
    message_preview: 'नमस्कार शकुंतलाजी, सकाळी उपाशीपोटी Pantoprazole 40mg (१ गोळी) घेण्याची वेळ झाली आहे.',
  },
];

export default function RemindersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = mockReminders.filter((r) => {
    const matchesSearch =
      r.patient_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.drug_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.message_preview.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  });

  const getBucketIcon = (bucket: ReminderItem['time_bucket']) => {
    switch (bucket) {
      case 'Morning':
        return Sunrise;
      case 'Afternoon':
        return Sun;
      case 'Evening':
        return Sunset;
      case 'Bedtime':
        return Moon;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Reminders Dispatched Today"
          value="2"
          subtitle="Delivered via WhatsApp WABA"
          accentColor="mint"
          icon={Send}
        />
        <StatCard
          label="Upcoming Reminders (Today)"
          value="3"
          subtitle="Scheduled to patient meal anchors"
          accentColor="amber"
          icon={Clock}
        />
        <StatCard
          label="Delivery Success Rate"
          value="100%"
          subtitle="0 failed message dispatches"
          accentColor="brand"
          icon={CheckCircle2}
        />
      </div>

      {/* Filter and Search */}
      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by patient, medication, or message text..."
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={[
          { label: 'All Reminders', value: 'all' },
          { label: 'Pending Dispatch', value: 'pending' },
          { label: 'Delivered', value: 'delivered' },
        ]}
      />

      {/* Reminders List */}
      <div className="space-y-4">
        {filtered.map((r) => {
          const isDelivered = r.status === 'delivered';
          const BucketIcon = getBucketIcon(r.time_bucket);

          return (
            <div
              key={r.id}
              className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-xl p-5 transition-all shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full text-[11px] font-medium text-slate-700">
                    <BucketIcon className="w-3.5 h-3.5 text-brand-600" />
                    <span>{r.time_bucket}</span>
                  </div>

                  <span className="font-semibold text-slate-900 text-sm">{r.patient_name}</span>
                  <span className="text-[11px] text-slate-500 font-mono">({r.patient_phone})</span>
                  <BadgePill variant={isDelivered ? 'confirmed' : 'pending'}>
                    {isDelivered ? 'Delivered' : 'Scheduled'}
                  </BadgePill>
                  <span className="text-[10px] text-brand-700 font-medium bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
                    {r.language}
                  </span>
                </div>

                <div className="flex items-center space-x-3 text-xs text-slate-700">
                  <span className="font-semibold text-brand-700">{r.drug_name}</span>
                  <span>•</span>
                  <span className="text-slate-600">{r.dosage}</span>
                  <span>•</span>
                  <span className="flex items-center space-x-1 font-mono text-slate-500">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>{r.scheduled_time}</span>
                  </span>
                </div>

                {/* Rendered WhatsApp Body Box */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 text-xs text-slate-800 font-sans leading-relaxed">
                  <div className="text-[10px] text-slate-500 font-mono uppercase mb-1 flex items-center space-x-1">
                    <MessageSquare className="w-3 h-3 text-emerald-600" />
                    <span>WhatsApp Delivery Payload (Marathi)</span>
                  </div>
                  <p>{r.message_preview}</p>
                </div>
              </div>

              <div className="shrink-0 flex items-center md:flex-col justify-between md:items-end gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-mono block">Channel</span>
                  <span className="text-xs font-semibold text-emerald-700 font-mono">WhatsApp WABA</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
