import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { GateStatusBar } from '../components/GateStatusBar';
import { FormattedMedication } from '../lib/types';

describe('GateStatusBar Component (SI-01 Gate Enforcement)', () => {
  const createMedication = (id: string, status: any): FormattedMedication => ({
    id,
    prescription_id: 'p-1',
    drug_name: `Drug ${id}`,
    drug_name_validation: null,
    verification_status: status,
    lifecycle_state: null,
    effective_fields: {} as any,
    display_expansions: [],
    candidate_readings: [],
    missing_fields: [],
    unparsed_fragments: [],
  });

  it('disables Verify button when candidates are pending', () => {
    const meds = [
      createMedication('1', 'confirmed'),
      createMedication('2', 'pending'),
    ];

    render(<GateStatusBar medications={meds} onVerify={jest.fn()} />);

    const verifyBtn = screen.getByRole('button', { name: /Verify Prescription/i });
    expect(verifyBtn).toBeDisabled();
    expect(screen.getByText(/1 pending review/i)).toBeInTheDocument();
  });

  it('disables Verify button when any candidate is rejected (SI-01)', () => {
    const meds = [
      createMedication('1', 'confirmed'),
      createMedication('2', 'rejected'),
    ];

    render(<GateStatusBar medications={meds} onVerify={jest.fn()} />);

    const verifyBtn = screen.getByRole('button', { name: /Verify Prescription/i });
    expect(verifyBtn).toBeDisabled();
    expect(screen.getByText(/1 rejected \(blocks verification\)/i)).toBeInTheDocument();
  });

  it('enables Verify button and triggers onVerify when all candidates are confirmed/corrected', () => {
    const onVerify = jest.fn();
    const meds = [
      createMedication('1', 'confirmed'),
      createMedication('2', 'corrected'),
    ];

    render(<GateStatusBar medications={meds} onVerify={onVerify} />);

    const verifyBtn = screen.getByRole('button', { name: /Verify Prescription/i });
    expect(verifyBtn).not.toBeDisabled();

    fireEvent.click(verifyBtn);
    expect(onVerify).toHaveBeenCalledTimes(1);
  });
});
