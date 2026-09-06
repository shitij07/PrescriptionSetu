import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UploadPrescriptionModal } from '../components/UploadPrescriptionModal';
import PrescriptionsQueuePage from '../app/prescriptions/page';
import { api, ApiClientError } from '../lib/api';
import { DEFAULT_CAREGIVER_ID } from '../components/DevBanner';

// Mock useRouter
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
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
    getPatients: jest.fn(),
    getPendingPrescriptions: jest.fn(),
    uploadPrescription: jest.fn(),
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

const mockPatients = [
  {
    id: 'patient-uuid-1',
    full_name: 'Asha Suresh Patil',
    phone_number: '+910000000019',
    preferred_language: 'mr',
  },
  {
    id: 'patient-uuid-2',
    full_name: 'Ganpatrao More',
    phone_number: '+910000000020',
    preferred_language: 'mr',
  },
];

const mockUploadResponse = {
  prescription: {
    id: 'rx-new-12345',
    patient_id: 'patient-uuid-1',
    status: 'pending_verification' as const,
    raw_ocr_text: 'Tab Amoxicillin 500mg 1 tab TDS',
    ocr_confidence: 0.95,
    ocr_metadata: null,
    image_storage_key: null,
    uploaded_by: DEFAULT_CAREGIVER_ID,
    verified_by: null,
    verified_at: null,
    created_at: '2026-09-05T21:00:00.000Z',
    updated_at: '2026-09-05T21:00:00.000Z',
  },
  medications: [
    {
      id: 'med-new-1',
      prescription_id: 'rx-new-12345',
      raw_line_text: 'Tab Amoxicillin 500mg 1 tab TDS',
      verification_status: 'pending',
      lifecycle_state: null,
    },
  ],
  unparsed_fragments: [],
};

describe('UploadPrescriptionModal Component', () => {
  const mockOnClose = jest.fn();
  const mockOnSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (api.getPatients as jest.Mock).mockResolvedValue({ patients: mockPatients });
    (api.getPendingPrescriptions as jest.Mock).mockResolvedValue({ prescriptions: [] });
    (api.uploadPrescription as jest.Mock).mockResolvedValue(mockUploadResponse);
  });

  it('1. Does not render when isOpen is false', () => {
    render(
      <UploadPrescriptionModal
        isOpen={false}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('2. Renders all fields, tabs, and loads patient list when isOpen is true', async () => {
    render(
      <UploadPrescriptionModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Upload & Ingest Prescription')).toBeInTheDocument();
    expect(screen.getByText('Synthetic Fixture')).toBeInTheDocument();
    expect(screen.getByText('Direct Shorthand Text')).toBeInTheDocument();

    await waitFor(() => {
      expect(api.getPatients).toHaveBeenCalledTimes(1);
    });

    const select = screen.getByLabelText(/Select Enrolled Patient/i);
    expect(select).toBeInTheDocument();
    expect(screen.getByText(/Asha Suresh Patil/i)).toBeInTheDocument();
    expect(screen.getByText(/Ganpatrao More/i)).toBeInTheDocument();
  });

  it('3. Preselects patient if preselectedPatientId is provided', async () => {
    render(
      <UploadPrescriptionModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
        preselectedPatientId="patient-uuid-2"
      />,
    );

    await waitFor(() => {
      const select = screen.getByLabelText(/Select Enrolled Patient/i) as HTMLSelectElement;
      expect(select.value).toBe('patient-uuid-2');
    });
  });

  it('4. Switches between Synthetic Fixture and Direct Shorthand modes', async () => {
    render(
      <UploadPrescriptionModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Select Enrolled Patient/i)).toBeInTheDocument();
    });

    // Initial state is fixture mode
    expect(screen.getByLabelText(/Corpus Fixture Preset/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Prescription Shorthand Text/i)).not.toBeInTheDocument();

    // Click Direct Shorthand tab
    fireEvent.click(screen.getByText('Direct Shorthand Text'));

    expect(screen.queryByLabelText(/Corpus Fixture Preset/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Prescription Shorthand Text/i)).toBeInTheDocument();

    // Click back to Fixture mode
    fireEvent.click(screen.getByText('Synthetic Fixture'));
    expect(screen.getByLabelText(/Corpus Fixture Preset/i)).toBeInTheDocument();
  });

  it('5. Validates empty shorthand text in Direct mode before calling API', async () => {
    render(
      <UploadPrescriptionModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    await waitFor(() => {
      expect(api.getPatients).toHaveBeenCalled();
    });

    // Switch to direct mode
    fireEvent.click(screen.getByText('Direct Shorthand Text'));

    const submitBtn = screen.getByRole('button', { name: /Upload & Parse Prescription/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Please enter raw prescription shorthand text.')).toBeInTheDocument();
    expect(api.uploadPrescription).not.toHaveBeenCalled();
  });

  it('6. Submits synthetic fixture payload and routes to /prescriptions/[id]', async () => {
    render(
      <UploadPrescriptionModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    await waitFor(() => {
      expect(api.getPatients).toHaveBeenCalled();
    });

    const submitBtn = screen.getByRole('button', { name: /Upload & Parse Prescription/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.uploadPrescription).toHaveBeenCalledWith({
        patient_id: 'patient-uuid-1',
        caregiver_id: DEFAULT_CAREGIVER_ID,
        fixture_key: 'amoxicillin_500mg_tds',
      });
    });

    expect(mockOnSuccess).toHaveBeenCalledWith(mockUploadResponse.prescription);
    expect(mockOnClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/prescriptions/rx-new-12345');
  });

  it('7. Submits direct text payload and routes to /prescriptions/[id]', async () => {
    render(
      <UploadPrescriptionModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    await waitFor(() => {
      expect(api.getPatients).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Direct Shorthand Text'));
    const textarea = screen.getByLabelText(/Prescription Shorthand Text/i);
    fireEvent.change(textarea, {
      target: { value: 'Tab Metformin 500mg 1 tab BD\nTab Paracetamol 500mg 1 tab SOS' },
    });

    const submitBtn = screen.getByRole('button', { name: /Upload & Parse Prescription/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.uploadPrescription).toHaveBeenCalledWith({
        patient_id: 'patient-uuid-1',
        caregiver_id: DEFAULT_CAREGIVER_ID,
        raw_text: 'Tab Metformin 500mg 1 tab BD\nTab Paracetamol 500mg 1 tab SOS',
      });
    });

    expect(mockPush).toHaveBeenCalledWith('/prescriptions/rx-new-12345');
  });

  it('8. Displays error banner when API returns ApiClientError', async () => {
    (api.uploadPrescription as jest.Mock).mockRejectedValueOnce(
      new ApiClientError(400, {
        code: 'FIXTURE_NOT_FOUND',
        message: 'OCR fixture not found for key',
      }),
    );

    render(
      <UploadPrescriptionModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    await waitFor(() => {
      expect(api.getPatients).toHaveBeenCalled();
    });

    const submitBtn = screen.getByRole('button', { name: /Upload & Parse Prescription/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/OCR fixture not found for key/i)).toBeInTheDocument();
    expect(mockOnClose).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('9. PrescriptionsQueuePage opens modal when clicking "+ Upload Prescription"', async () => {
    render(<PrescriptionsQueuePage />);

    const uploadBtn = await screen.findByRole('button', { name: /\+ Upload Prescription/i });
    expect(uploadBtn).toBeInTheDocument();
    expect(uploadBtn).not.toBeDisabled();

    fireEvent.click(uploadBtn);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Upload & Ingest Prescription')).toBeInTheDocument();
  });
});
