import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import PatientDetailPage from '../app/patients/[id]/page';
import { api } from '../lib/api';
import { FormattedMedication } from '../lib/types';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'test-patient-uuid-1' }),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
}));

// Mock api
jest.mock('../lib/api', () => ({
  api: {
    getPatient: jest.fn(),
    getPatientAdherence: jest.fn(),
    deletePatient: jest.fn(),
  },
}));

const mockPatientBase = {
  id: 'test-patient-uuid-1',
  full_name: 'Asha Suresh Patil',
  phone_number: '+910000000019',
  preferred_language: 'mr',
  meal_times: {
    breakfast: '08:30',
    lunch: '13:00',
    dinner: '20:30',
    bedtime: '22:00',
  },
  created_at: '2026-09-05T20:00:00.000Z',
  updated_at: '2026-09-05T20:00:00.000Z',
};

const mockActiveMedication1: FormattedMedication = {
  id: 'med-uuid-1',
  prescription_id: 'rx-amox-12345',
  drug_name: 'Amoxicillin',
  drug_name_validation: 'matched',
  verification_status: 'confirmed',
  lifecycle_state: 'active',
  effective_fields: {
    frequency_code: 'THRICE_DAILY',
    times_per_day: 3,
    timing_anchors: ['AFTER_MEAL'],
    dose_amount: 1,
    dose_unit: 'tablet',
    dose_strength_value: 500,
    dose_strength_unit: 'mg',
    duration_value: 5,
    duration_unit: 'day',
    duration_indefinite: false,
    as_needed: false,
    total_doses: 15,
    recurring: true,
    immediate: false,
    schedule_derivable: true,
    verifier_action_required: false,
    max_doses_per_day: null,
    min_interval_hours: null,
  },
  display_expansions: [
    {
      rule_id: 'FREQ-TDS-001',
      matched_literal: 'TDS',
      canonical_expansion: 'thrice daily',
      source_span: { start: 20, end: 23 },
    },
  ],
  candidate_readings: [],
  missing_fields: [],
  unparsed_fragments: [],
};

const mockActiveMedication2: FormattedMedication = {
  id: 'med-uuid-2',
  prescription_id: 'rx-metf-67890',
  drug_name: 'Metformin',
  drug_name_validation: 'matched',
  verification_status: 'corrected',
  lifecycle_state: 'active',
  effective_fields: {
    frequency_code: 'TWICE_DAILY',
    times_per_day: 2,
    timing_anchors: ['BEFORE_MEAL'],
    dose_amount: { kind: 'integer', value: 1 },
    dose_unit: 'tablet',
    dose_strength_value: 850,
    dose_strength_unit: 'mg',
    duration_value: null,
    duration_unit: null,
    duration_indefinite: true,
    as_needed: true,
    total_doses: null,
    recurring: true,
    immediate: false,
    schedule_derivable: true,
    verifier_action_required: false,
    max_doses_per_day: null,
    min_interval_hours: null,
  },
  display_expansions: [
    {
      rule_id: 'FREQ-BD-001',
      matched_literal: 'BD',
      canonical_expansion: 'twice daily',
      source_span: { start: 18, end: 20 },
    },
  ],
  candidate_readings: [],
  missing_fields: [],
  unparsed_fragments: [],
};

describe('Patient Profile Active Medication Regimens Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.getPatientAdherence as jest.Mock).mockResolvedValue({
      success: true,
      data: { score: 85, confirmed: 12, missed: 2, escalations: 0 },
    });
  });

  it('renders empty state when patient has no active medications', async () => {
    (api.getPatient as jest.Mock).mockResolvedValue({
      patient: mockPatientBase,
      active_prescriptions_count: 0,
      active_medications: [],
    });

    render(<PatientDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Asha Suresh Patil')).toBeInTheDocument();
    });

    expect(screen.getByText('0 Active Regimens')).toBeInTheDocument();
    expect(screen.getByText('No active medication regimens')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Medications will appear here once verified and activated through the Verification Workstation.',
      ),
    ).toBeInTheDocument();
  });

  it('renders active medication regimen cards with dosage, frequency, and display expansions', async () => {
    (api.getPatient as jest.Mock).mockResolvedValue({
      patient: mockPatientBase,
      active_prescriptions_count: 2,
      active_medications: [mockActiveMedication1, mockActiveMedication2],
    });

    render(<PatientDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Asha Suresh Patil')).toBeInTheDocument();
    });

    // Verify counter
    expect(screen.getByText('2 Active Regimens')).toBeInTheDocument();

    // Verify medication 1 (Amoxicillin)
    expect(screen.getByText('Amoxicillin')).toBeInTheDocument();
    expect(screen.getByText('500mg (1 tablet)')).toBeInTheDocument();
    expect(screen.getByText('THRICE DAILY (3x/day)')).toBeInTheDocument();
    expect(screen.getByText('5 days')).toBeInTheDocument();
    expect(screen.getByText('after meal')).toBeInTheDocument();
    expect(screen.getByText('confirmed')).toBeInTheDocument();
    expect(screen.getByText('TDS')).toBeInTheDocument();
    expect(screen.getByText('thrice daily')).toBeInTheDocument();

    // Verify medication 2 (Metformin with SOS/PRN)
    expect(screen.getByText('Metformin')).toBeInTheDocument();
    expect(screen.getByText('850mg (1 tablet)')).toBeInTheDocument();
    expect(screen.getByText('SOS / PRN')).toBeInTheDocument();
    expect(screen.getByText('corrected')).toBeInTheDocument();
    expect(screen.getByText('TWICE DAILY (2x/day)')).toBeInTheDocument();
    expect(screen.getByText('before meal')).toBeInTheDocument();
    expect(screen.getByText('Indefinite (Continuous)')).toBeInTheDocument();
    expect(screen.getByText('BD')).toBeInTheDocument();
    expect(screen.getByText('twice daily')).toBeInTheDocument();

    // Verify prescription links
    expect(screen.getByText('Prescription: RX-rx-amox-')).toBeInTheDocument();
    expect(screen.getByText('Prescription: RX-rx-metf-')).toBeInTheDocument();
  });

  it('handles API error gracefully', async () => {
    (api.getPatient as jest.Mock).mockRejectedValue(new Error('Patient not found'));

    render(<PatientDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Patient not found')).toBeInTheDocument();
    });
  });
});
