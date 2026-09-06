import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreatePatientModal } from '../components/CreatePatientModal';
import PatientsDirectoryPage from '../app/patients/page';
import { api, ApiClientError } from '../lib/api';

jest.mock('../lib/api', () => ({
  api: {
    getPatients: jest.fn(),
    createPatient: jest.fn(),
  },
  ApiClientError: class extends Error {
    public status: number;
    public code: string;
    constructor(status: number, errorData: any) {
      super(errorData.message || 'API error');
      this.status = status;
      this.code = errorData.code || 'ERROR';
    }
  },
}));

describe('CreatePatientModal Component', () => {
  const mockOnClose = jest.fn();
  const mockOnSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('1. Does not render when isOpen is false', () => {
    render(
      <CreatePatientModal
        isOpen={false}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('2. Renders all fields and default meal times when isOpen is true', () => {
    render(
      <CreatePatientModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Register New Patient')).toBeInTheDocument();
    expect(screen.getByLabelText(/Full Name/i)).toHaveValue('');
    expect(screen.getByLabelText(/WhatsApp Phone Number/i)).toHaveValue('');
    expect(screen.getByLabelText(/Reminder Delivery Language/i)).toHaveValue('mr');
    expect(screen.getByLabelText(/Breakfast/i)).toHaveValue('08:00');
    expect(screen.getByLabelText(/Lunch/i)).toHaveValue('13:00');
    expect(screen.getByLabelText(/Dinner/i)).toHaveValue('20:00');
    expect(screen.getByLabelText(/Bedtime/i)).toHaveValue('22:00');
  });

  it('3. Validates required full name before calling API', async () => {
    render(
      <CreatePatientModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: /Register Patient/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Patient full name is required.')).toBeInTheDocument();
    expect(api.createPatient).not.toHaveBeenCalled();
  });

  it('4. Validates phone number format before calling API', async () => {
    render(
      <CreatePatientModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'Asha Patil' },
    });
    fireEvent.change(screen.getByLabelText(/WhatsApp Phone Number/i), {
      target: { value: '9822000019' }, // missing leading +
    });

    fireEvent.click(screen.getByRole('button', { name: /Register Patient/i }));

    expect(
      await screen.findByText(/Phone number must be in E\.164 format/),
    ).toBeInTheDocument();
    expect(api.createPatient).not.toHaveBeenCalled();
  });

  it('5. Successfully submits valid synthetic patient data', async () => {
    const mockCreatedPatient = {
      id: '99999999-9999-9999-9999-999999999999',
      full_name: 'Asha Suresh Patil',
      phone_number: '+910000000019',
      preferred_language: 'mr',
      meal_times: {
        breakfast: '08:30',
        lunch: '13:00',
        dinner: '20:30',
        bedtime: '22:00',
      },
      created_at: '2026-09-05T20:45:00.000Z',
      updated_at: '2026-09-05T20:45:00.000Z',
    };

    (api.createPatient as jest.Mock).mockResolvedValueOnce({
      patient: mockCreatedPatient,
    });

    render(
      <CreatePatientModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'Asha Suresh Patil' },
    });
    fireEvent.change(screen.getByLabelText(/WhatsApp Phone Number/i), {
      target: { value: '+910000000019' },
    });
    fireEvent.change(screen.getByLabelText(/Breakfast/i), {
      target: { value: '08:30' },
    });
    fireEvent.change(screen.getByLabelText(/Dinner/i), {
      target: { value: '20:30' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Register Patient/i }));

    await waitFor(() => {
      expect(api.createPatient).toHaveBeenCalledWith({
        full_name: 'Asha Suresh Patil',
        phone_number: '+910000000019',
        preferred_language: 'mr',
        meal_times: {
          breakfast: '08:30',
          lunch: '13:00',
          dinner: '20:30',
          bedtime: '22:00',
        },
      });
    });

    expect(mockOnSuccess).toHaveBeenCalledWith(mockCreatedPatient);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('6. Displays error banner when API returns error', async () => {
    (api.createPatient as jest.Mock).mockRejectedValueOnce(
      new ApiClientError(400, {
        code: 'INVALID_FULL_NAME',
        message: 'Patient full name is required (1-200 characters)',
      }),
    );

    render(
      <CreatePatientModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'Valid Name' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Register Patient/i }));

    expect(
      await screen.findByText('Patient full name is required (1-200 characters)'),
    ).toBeInTheDocument();
    expect(mockOnClose).not.toHaveBeenCalled();
  });
});

describe('Patient Directory Registration Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.getPatients as jest.Mock).mockResolvedValue({ patients: [] });
  });

  it('7. Clicking "+ New Patient" opens modal, and on success prepends new patient and displays banner', async () => {
    const mockNewPatient = {
      id: '88888888-8888-8888-8888-888888888888',
      full_name: 'Asha Suresh Patil',
      phone_number: '+910000000019',
      preferred_language: 'mr',
      created_at: '2026-09-05T20:45:00.000Z',
    };

    (api.createPatient as jest.Mock).mockResolvedValueOnce({
      patient: mockNewPatient,
    });

    render(<PatientsDirectoryPage />);

    // Initially directory is empty
    expect(await screen.findByText(/The patient directory is currently empty/i)).toBeInTheDocument();

    // Click + New Patient
    const newPatientBtn = screen.getByRole('button', { name: /\+ New Patient/i });
    fireEvent.click(newPatientBtn);

    // Modal is open
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Fill form and submit
    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'Asha Suresh Patil' },
    });
    fireEvent.change(screen.getByLabelText(/WhatsApp Phone Number/i), {
      target: { value: '+910000000019' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Register Patient/i }));

    // Verify newly added patient is in the list
    expect(await screen.findByText('Asha Suresh Patil')).toBeInTheDocument();
    expect(screen.getByText('+910000000019')).toBeInTheDocument();
    expect(screen.getByText(/registered successfully/i)).toBeInTheDocument();

    // Modal closed
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
