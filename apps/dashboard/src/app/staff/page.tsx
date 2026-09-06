'use client';

import React, { useState } from 'react';
import { SearchFilterBar } from '../../components/SearchFilterBar';
import { BadgePill } from '../../components/ui/BadgePill';
import { UserCheck, ShieldCheck, Mail, Phone, Hospital } from 'lucide-react';

interface StaffMember {
  id: string;
  name: string;
  role: 'Primary Verifier' | 'Clinical Reviewer' | 'Pharmacist Verifier';
  facility: string;
  phone: string;
  email: string;
  assigned_patients: number;
  verifications_completed: number;
  status: 'active' | 'offline';
}

const mockStaff: StaffMember[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Dr. Ananya Patil',
    role: 'Primary Verifier',
    facility: 'KEM Hospital & Research Centre, Pune',
    phone: '+91 98230 11223',
    email: 'dr.ananya.patil@prescriptionsetu.org',
    assigned_patients: 18,
    verifications_completed: 142,
    status: 'active',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Dr. Rohit Joshi',
    role: 'Clinical Reviewer',
    facility: 'Sassoon General Hospital, Pune',
    phone: '+91 98230 22334',
    email: 'dr.rohit.joshi@prescriptionsetu.org',
    assigned_patients: 12,
    verifications_completed: 89,
    status: 'active',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Pooja Deshpande, PharmD',
    role: 'Pharmacist Verifier',
    facility: 'Sahyadri Specialty Hospital, Pune',
    phone: '+91 98230 33445',
    email: 'pooja.deshpande@prescriptionsetu.org',
    assigned_patients: 14,
    verifications_completed: 95,
    status: 'active',
  },
];

export default function StaffDirectoryPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = mockStaff.filter((s) => {
    return (
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.facility.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.role.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <UserCheck className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">Staff & Caregiver Directory</h1>
          </div>
          <p className="text-xs text-slate-500">
            Authorized medical staff and clinical caregivers executing SI-01 prescription verifications.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs text-slate-600 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>
            <strong className="text-slate-900">{mockStaff.length}</strong> Authorized Verifiers
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search staff by name, facility, or clinical role..."
      />

      {/* Staff Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {filtered.map((staff) => (
          <div
            key={staff.id}
            className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-700 font-bold text-xs shrink-0">
                    {staff.name
                      .replace('Dr. ', '')
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm">{staff.name}</h3>
                    <p className="text-[11px] text-brand-700 font-medium">{staff.role}</p>
                  </div>
                </div>

                <BadgePill variant="confirmed">Active</BadgePill>
              </div>

              <div className="space-y-2 text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                <div className="flex items-center space-x-2 text-[11px] text-slate-600 truncate">
                  <Hospital className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{staff.facility}</span>
                </div>
                <div className="flex items-center space-x-2 text-[11px] text-slate-600 font-mono">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{staff.phone}</span>
                </div>
                <div className="flex items-center space-x-2 text-[11px] text-slate-600 truncate">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{staff.email}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-center text-xs">
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-mono">Patients</span>
                <span className="font-bold text-slate-900 text-sm">{staff.assigned_patients}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-mono">Verified Rx</span>
                <span className="font-bold text-emerald-700 text-sm">{staff.verifications_completed}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
