import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ClinicalAuditPage from '../app/audit/page';
import { api, AuditEventRecord, GetAuditEventsResponse } from '../lib/api';

jest.mock('../lib/api', () => ({
  api: {
    getAuditEvents: jest.fn(),
    getAuditEvent: jest.fn(),
  },
}));

const mockAuditEvents: AuditEventRecord[] = [
  {
    id: 'aud-uuid-1',
    medication_id: 'med-uuid-1',
    prescription_id: 'rx-uuid-1',
    patient_id: 'patient-uuid-1',
    patient_name: 'Ganpatrao More',
    drug_name: 'Telmisartan 40mg',
    event_type: 'corrected',
    field_name: null,
    old_value: {
      frequency_code: 'ONCE_DAILY',
      times_per_day: 1,
    },
    new_value: {
      frequency_code: 'THRICE_DAILY',
      times_per_day: 3,
    },
    actor_caregiver_id: 'cg-uuid-1',
    actor_name: 'Dr. Ananya Patil',
    reason: 'Adjusted to TDS per telephone confirmation with patient.',
    created_at: '2026-09-06T06:00:00.000Z',
  },
  {
    id: 'aud-uuid-2',
    medication_id: 'med-uuid-2',
    prescription_id: 'rx-uuid-2',
    patient_id: 'patient-uuid-2',
    patient_name: 'Savitri Patil',
    drug_name: 'Metformin 500mg',
    event_type: 'confirmed',
    field_name: null,
    old_value: null,
    new_value: null,
    actor_caregiver_id: 'cg-uuid-1',
    actor_name: 'Dr. Ananya Patil',
    reason: null,
    created_at: '2026-09-06T05:30:00.000Z',
  },
  {
    id: 'aud-uuid-3',
    medication_id: 'med-uuid-3',
    prescription_id: 'rx-uuid-3',
    patient_id: 'patient-uuid-3',
    patient_name: '[DELETED_PATIENT]',
    drug_name: 'Aspirin 75mg',
    event_type: 'stopped',
    field_name: 'lifecycle_state',
    old_value: { lifecycle_state: 'active' },
    new_value: { lifecycle_state: 'stopped' },
    actor_caregiver_id: 'cg-uuid-1',
    actor_name: 'Dr. Ananya Patil',
    reason: 'PATIENT_ERASURE_REQUEST',
    created_at: '2026-09-06T05:00:00.000Z',
  },
];

const mockResponse: GetAuditEventsResponse = {
  events: mockAuditEvents,
  total: 3,
  summary: {
    total_events: 3,
    corrections_count: 1,
    stops_count: 1,
    rejections_count: 0,
    confirmations_count: 1,
    erasures_count: 1,
  },
};

describe('Clinical Audit Page (/audit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('1. Renders live audit events with badges, target names, actor names, and reasons', async () => {
    (api.getAuditEvents as jest.Mock).mockResolvedValueOnce(mockResponse);

    render(<ClinicalAuditPage />);

    // Check loading indicator or wait for load
    await waitFor(() => {
      expect(screen.getByText('Telmisartan 40mg')).toBeInTheDocument();
    });

    expect(screen.getByText('Metformin 500mg')).toBeInTheDocument();
    expect(screen.getByText('Aspirin 75mg')).toBeInTheDocument();

    // Check badges
    expect(screen.getByText('Corrected (SI-14)')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('DPDP Erasure')).toBeInTheDocument();

    // Check actors
    const actorElements = screen.getAllByText('Dr. Ananya Patil');
    expect(actorElements.length).toBeGreaterThanOrEqual(3);

    // Check audited reasons
    expect(screen.getByText(/Adjusted to TDS per telephone confirmation/)).toBeInTheDocument();
    expect(screen.getByText(/PATIENT_ERASURE_REQUEST/)).toBeInTheDocument();
  });

  it('2. Displays KPI metrics cards matching the summary response', async () => {
    (api.getAuditEvents as jest.Mock).mockResolvedValueOnce(mockResponse);

    render(<ClinicalAuditPage />);

    await waitFor(() => {
      expect(screen.getByText('Total Audit Events')).toBeInTheDocument();
    });

    // Check stat card values
    expect(screen.getByText('3')).toBeInTheDocument(); // total events
    expect(screen.getAllByText('Clinical Corrections').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Medication Stops').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('DPDP Erasures').length).toBeGreaterThanOrEqual(1);
  });

  it('3. Toggles before and after clinical values diff for corrected events (SI-14)', async () => {
    (api.getAuditEvents as jest.Mock).mockResolvedValueOnce(mockResponse);

    render(<ClinicalAuditPage />);

    await waitFor(() => {
      expect(screen.getByText('View Before & After Clinical Values')).toBeInTheDocument();
    });

    // Click toggle button to expand diff
    const toggleBtn = screen.getByText('View Before & After Clinical Values');
    fireEvent.click(toggleBtn);

    // Verify diff content appears
    expect(screen.getByText('Field-Level Clinical Changes (SI-14)')).toBeInTheDocument();
    expect(screen.getByText('frequency_code:')).toBeInTheDocument();
    expect(screen.getByText('ONCE_DAILY')).toBeInTheDocument();
    expect(screen.getByText('THRICE_DAILY')).toBeInTheDocument();

    // Click again to hide
    fireEvent.click(screen.getByText('Hide Before & After Values'));
    expect(screen.queryByText('Field-Level Clinical Changes (SI-14)')).not.toBeInTheDocument();
  });

  it('4. Renders links to patient profile and prescription', async () => {
    (api.getAuditEvents as jest.Mock).mockResolvedValueOnce(mockResponse);

    render(<ClinicalAuditPage />);

    await waitFor(() => {
      expect(screen.getByText('Ganpatrao More')).toBeInTheDocument();
    });

    const patientLink = screen.getByText('Ganpatrao More').closest('a');
    expect(patientLink).toHaveAttribute('href', '/patients/patient-uuid-1');

    const rxLinks = screen.getAllByTitle('View Prescription');
    expect(rxLinks[0]).toHaveAttribute('href', '/prescriptions/rx-uuid-1');
  });

  it('5. Renders error alert banner when API request fails', async () => {
    (api.getAuditEvents as jest.Mock).mockRejectedValueOnce(new Error('Network connection timeout'));

    render(<ClinicalAuditPage />);

    await waitFor(() => {
      expect(screen.getByText('Audit Trail Synchronization Error')).toBeInTheDocument();
    });
    expect(screen.getByText('Network connection timeout')).toBeInTheDocument();
  });

  it('6. Renders empty state when no audit events match', async () => {
    (api.getAuditEvents as jest.Mock).mockResolvedValueOnce({
      events: [],
      total: 0,
      summary: {
        total_events: 0,
        corrections_count: 0,
        stops_count: 0,
        rejections_count: 0,
        confirmations_count: 0,
        erasures_count: 0,
      },
    });

    render(<ClinicalAuditPage />);

    await waitFor(() => {
      expect(screen.getByText('No Audit Events Found')).toBeInTheDocument();
    });
    expect(screen.getByText(/No clinical audit events match your current filter/)).toBeInTheDocument();
  });
});
