import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { CandidateCard } from '../components/CandidateCard';
import { FormattedMedication } from '../lib/types';

describe('CandidateCard Component', () => {
  const mockMedication: FormattedMedication = {
    id: 'med-12345678-0000-0000-0000-000000000000',
    prescription_id: 'pres-1111',
    drug_name: 'Metformin',
    drug_name_validation: null,
    verification_status: 'pending',
    lifecycle_state: null,
    effective_fields: {
      frequency_code: 'TWICE_DAILY',
      times_per_day: 2,
      timing_anchors: null,
      dose_amount: { kind: 'integer', value: 1 },
      dose_unit: 'tablet',
      dose_strength_value: 500,
      dose_strength_unit: 'mg',
      duration_value: 5,
      duration_unit: 'day',
      duration_indefinite: null,
      as_needed: false,
      total_doses: null,
      recurring: true,
      immediate: false,
      schedule_derivable: null,
      verifier_action_required: null,
      max_doses_per_day: null,
      min_interval_hours: null,
    },
    display_expansions: [
      {
        rule_id: 'FREQ-BD-001',
        matched_literal: 'BD',
        canonical_expansion: 'twice daily',
        source_span: { start: 26, end: 28 },
      },
    ],
    candidate_readings: [],
    missing_fields: [],
    unparsed_fragments: [],
  };

  it('renders clinical fields and display expansions correctly', () => {
    const onHoverSpan = jest.fn();
    const onConfirm = jest.fn();
    const onOpenCorrect = jest.fn();
    const onOpenReject = jest.fn();

    render(
      <CandidateCard
        medication={mockMedication}
        onHoverSpan={onHoverSpan}
        onConfirm={onConfirm}
        onOpenCorrect={onOpenCorrect}
        onOpenReject={onOpenReject}
      />,
    );

    expect(screen.getByText('Metformin')).toBeInTheDocument();
    expect(screen.getByText('1 tablet')).toBeInTheDocument();
    expect(screen.getByText('500mg')).toBeInTheDocument();
    expect(screen.getByText('TWICE DAILY')).toBeInTheDocument();
    expect(screen.getByText('5 day(s)')).toBeInTheDocument();
    expect(screen.getByText('twice daily')).toBeInTheDocument();
  });

  it('triggers onConfirm when Confirm button is clicked', () => {
    const onConfirm = jest.fn();
    render(
      <CandidateCard
        medication={mockMedication}
        onHoverSpan={jest.fn()}
        onConfirm={onConfirm}
        onOpenCorrect={jest.fn()}
        onOpenReject={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith(mockMedication.id);
  });
});
