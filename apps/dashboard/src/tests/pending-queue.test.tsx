import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { PendingQueue } from '../components/PendingQueue';
import { PrescriptionRecord } from '../lib/types';

describe('PendingQueue Component', () => {
  it('renders empty state message when no prescriptions exist', () => {
    render(<PendingQueue prescriptions={[]} isLoading={false} />);
    expect(screen.getByText('No Pending Prescriptions')).toBeInTheDocument();
  });

  it('renders list of pending prescriptions with links and preview text', () => {
    const mockPrescriptions: PrescriptionRecord[] = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        patient_id: '22222222-2222-2222-2222-222222222222',
        uploaded_by: '33333333-3333-3333-3333-333333333333',
        raw_ocr_text: 'Tab Metformin 500mg 1 tab BD\nTab Glimepiride 1mg OD',
        ocr_confidence: 0.95,
        ocr_metadata: null,
        image_storage_key: null,
        status: 'pending_verification',
        verified_by: null,
        verified_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    render(<PendingQueue prescriptions={mockPrescriptions} isLoading={false} />);

    expect(screen.getByText('Prescription 11111111...')).toBeInTheDocument();
    expect(screen.getByText('Tab Metformin 500mg 1 tab BD')).toBeInTheDocument();
    expect(screen.getByText(/Awaiting Verification/i)).toBeInTheDocument();
  });
});
