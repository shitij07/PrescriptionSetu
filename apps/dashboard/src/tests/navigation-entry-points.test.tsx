import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import PatientsDirectoryPage from '../app/patients/page';
import PrescriptionsQueuePage from '../app/prescriptions/page';
import { api } from '../lib/api';

// Mock useRouter
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
}));

// Mock api client to avoid unhandled fetches
jest.mock('../lib/api', () => ({
  api: {
    getPatients: jest.fn(),
    getPendingPrescriptions: jest.fn(),
  },
}));

describe('Slice 2 Entry Points (+ New Patient and + Upload Prescription)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.getPatients as jest.Mock).mockResolvedValue({ patients: [] });
    (api.getPendingPrescriptions as jest.Mock).mockResolvedValue({ prescriptions: [] });
  });

  it('renders enabled "+ New Patient" entry-point button on /patients', async () => {
    render(<PatientsDirectoryPage />);

    const button = await screen.findByRole('button', { name: /\+ New Patient/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    expect(button.className).toContain('min-h-[44px]');
  });

  it('renders enabled "+ Upload Prescription" entry-point button on /prescriptions', async () => {
    render(<PrescriptionsQueuePage />);

    const button = await screen.findByRole('button', { name: /\+ Upload Prescription/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    expect(button.className).toContain('min-h-[44px]');
  });
});
