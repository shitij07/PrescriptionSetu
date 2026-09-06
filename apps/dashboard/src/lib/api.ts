/**
 * Type-Safe API Client for PrescriptionSetu Backend.
 * Authoritative sources: `docs/API_CONTRACTS.md`, `PercriptionSetuMASTERPLAN.md` §18.5.
 */

import {
  PendingPrescriptionsResponse,
  PrescriptionDetailResponse,
  PrescriptionRecord,
  EffectiveClinicalFields,
  FormattedMedication,
  ApiError,
} from './types';

export interface CreatePatientPayload {
  full_name: string;
  phone_number?: string | null;
  preferred_language?: 'mr' | 'en';
  meal_times?: {
    breakfast?: string;
    lunch?: string;
    dinner?: string;
    bedtime?: string;
  } | null;
}

export interface UploadPrescriptionPayload {
  patient_id: string;
  caregiver_id: string;
  fixture_key?: string;
  raw_text?: string;
}

export interface UploadPrescriptionResponse {
  prescription: PrescriptionRecord;
  medications: any[];
  unparsed_fragments: any[];
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly field?: string;

  constructor(status: number, errorData: ApiError['error']) {
    super(errorData.message || 'API request failed');
    this.name = 'ApiClientError';
    this.status = status;
    this.code = errorData.code || 'UNKNOWN_ERROR';
    this.field = errorData.field;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    let errorJson: ApiError = { error: { code: 'HTTP_ERROR', message: response.statusText } };
    try {
      errorJson = await response.json();
    } catch {
      // Fallback to generic status text
    }
    throw new ApiClientError(response.status, errorJson.error);
  }

  return (await response.json()) as T;
}

export const api = {
  /**
   * Ingests a prescription image/fixture or direct text, executes OCR perception and deterministic shorthand parsing.
   * Authoritative source: docs/API_CONTRACTS.md §13.3
   */
  async uploadPrescription(payload: UploadPrescriptionPayload): Promise<UploadPrescriptionResponse> {
    return request<UploadPrescriptionResponse>('/api/prescriptions/upload', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Retrieves all prescriptions awaiting verification.
   */
  async getPendingPrescriptions(caregiverId?: string): Promise<PendingPrescriptionsResponse> {
    const query = caregiverId ? `?caregiver_id=${encodeURIComponent(caregiverId)}` : '';
    return request<PendingPrescriptionsResponse>(`/api/prescriptions/pending${query}`, {
      method: 'GET',
    });
  },

  /**
   * Retrieves full details and parsed medications for a prescription.
   */
  async getPrescriptionDetail(id: string): Promise<PrescriptionDetailResponse> {
    return request<PrescriptionDetailResponse>(`/api/prescriptions/${id}`, {
      method: 'GET',
    });
  },

  /**
   * Caregiver confirms a medication candidate line item.
   */
  async confirmMedication(medicationId: string, verifierCaregiverId: string) {
    return request<{ success: boolean; medication_id: string; verification_status: 'confirmed' }>(
      `/api/medications/${medicationId}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({ verifier_caregiver_id: verifierCaregiverId }),
      },
    );
  },

  /**
   * Caregiver corrects clinical fields on a medication candidate line item.
   */
  async correctMedication(
    medicationId: string,
    verifierCaregiverId: string,
    corrections: Partial<EffectiveClinicalFields>,
    reason?: string,
  ) {
    return request<{ success: boolean; medication_id: string; verification_status: 'corrected' }>(
      `/api/medications/${medicationId}/correct`,
      {
        method: 'POST',
        body: JSON.stringify({
          verifier_caregiver_id: verifierCaregiverId,
          corrections,
          reason,
        }),
      },
    );
  },

  /**
   * Caregiver rejects a medication candidate line item with mandatory reason.
   */
  async rejectMedication(medicationId: string, verifierCaregiverId: string, reason: string) {
    return request<{ success: boolean; medication_id: string; verification_status: 'rejected' }>(
      `/api/medications/${medicationId}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({
          verifier_caregiver_id: verifierCaregiverId,
          reason,
        }),
      },
    );
  },

  /**
   * Evaluates SI-01 gate and verifies the prescription atomically.
   */
  async verifyPrescription(prescriptionId: string, verifierCaregiverId: string) {
    return request<{
      success: boolean;
      prescription_id: string;
      prescription_status: 'verified';
      activated_medication_count: number;
      generated_reminders_count: number;
    }>(`/api/prescriptions/${prescriptionId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ verifier_caregiver_id: verifierCaregiverId }),
    });
  },

  /**
   * Caregiver stops an active medication.
   */
  async stopMedication(medicationId: string, caregiverId: string, reason: string) {
    return request<{
      success: boolean;
      medication_id: string;
      lifecycle_state: 'stopped';
      cancelled_reminders_count: number;
    }>(`/api/medications/${medicationId}/stop`, {
      method: 'POST',
      body: JSON.stringify({
        caregiver_id: caregiverId,
        reason,
      }),
    });
  },

  /**
   * Registers a new patient.
   * Authoritative source: docs/API_CONTRACTS.md §13.6
   */
  async createPatient(payload: CreatePatientPayload) {
    return request<{
      patient: {
        id: string;
        full_name: string;
        phone_number: string | null;
        preferred_language: string;
        meal_times: any;
        created_at: string;
        updated_at: string;
      };
    }>('/api/patients', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Fetches list of registered active patients.
   */
  async getPatients() {
    return request<{ patients: any[] }>('/api/patients');
  },

  /**
   * Fetches patient details by ID.
   */
  async getPatient(patientId: string) {
    return request<{
      patient: {
        id: string;
        full_name: string;
        phone_number: string | null;
        preferred_language: string;
        meal_times: any;
        created_at: string;
        updated_at: string;
      };
      active_prescriptions_count: number;
      active_medications: FormattedMedication[];
    }>(`/api/patients/${patientId}`);
  },

  /**
   * Fetches adherence summary for a patient.
   */
  async getPatientAdherence(patientId: string) {
    return request<{
      success: boolean;
      data: any;
    }>(`/api/adherence/patient/${patientId}`);
  },

  /**
   * Executes a DPDP right-to-erasure request for a patient.
   */
  async deletePatient(patientId: string, caregiverId?: string) {
    return request<{
      success: boolean;
      data: {
        patient_id: string;
        cancelled_reminders_count: number;
        stopped_medications_count: number;
        deleted_at: string;
      };
    }>(`/api/patients/${patientId}`, {
      method: 'DELETE',
      body: caregiverId ? JSON.stringify({ caregiver_id: caregiverId }) : undefined,
    });
  },
};
