import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, cleanup } from '@testing-library/react';
import { AppSidebar } from '../components/layout/AppSidebar';

// Mock next/navigation
const mockUsePathname = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('AppSidebar Component (Slice 2 Navigation Alignment)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue('/');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders PrescriptionSetu branding and Clinical Portal subtitle', () => {
    render(<AppSidebar />);

    expect(screen.getByText('PrescriptionSetu')).toBeInTheDocument();
    expect(screen.getByText('Clinical Portal')).toBeInTheDocument();
    expect(screen.queryByText('Caregiver Ops')).not.toBeInTheDocument();
  });

  it('renders the exact 6-item canonical navigation in exact order with expected hrefs', () => {
    render(<AppSidebar />);

    const expectedNav = [
      { label: 'Home', href: '/' },
      { label: 'Patients', href: '/patients' },
      { label: 'Prescriptions', href: '/prescriptions' },
      { label: 'Reminders', href: '/reminders' },
      { label: 'Reports', href: '/audit' },
      { label: 'Staff', href: '/staff' },
    ];

    const navLinks = screen.getAllByRole('link').filter((link) => {
      // Exclude brand home logo link
      return link.getAttribute('href') !== '/' || link.textContent?.includes('Home');
    });

    expect(navLinks).toHaveLength(expectedNav.length);

    expectedNav.forEach((item, index) => {
      expect(navLinks[index]).toHaveAttribute('href', item.href);
      expect(navLinks[index]).toHaveTextContent(item.label);
    });
  });

  it('highlights Home and sets aria-current="page" when on homepage ("/")', () => {
    mockUsePathname.mockReturnValue('/');
    render(<AppSidebar />);

    const homeLink = screen.getByRole('link', { name: /^Home$/i });
    expect(homeLink).toHaveAttribute('aria-current', 'page');

    const patientsLink = screen.getByRole('link', { name: /^Patients$/i });
    expect(patientsLink).not.toHaveAttribute('aria-current');

    const prescriptionsLink = screen.getByRole('link', { name: /^Prescriptions$/i });
    expect(prescriptionsLink).not.toHaveAttribute('aria-current');
  });

  it('highlights Patients and sets aria-current="page" for nested patient route', () => {
    mockUsePathname.mockReturnValue('/patients/11111111-1111-1111-1111-111111111111');
    render(<AppSidebar />);

    const homeLink = screen.getByRole('link', { name: /^Home$/i });
    expect(homeLink).not.toHaveAttribute('aria-current');

    const patientsLink = screen.getByRole('link', { name: /^Patients$/i });
    expect(patientsLink).toHaveAttribute('aria-current', 'page');

    const prescriptionsLink = screen.getByRole('link', { name: /^Prescriptions$/i });
    expect(prescriptionsLink).not.toHaveAttribute('aria-current');
  });

  it('highlights Prescriptions and sets aria-current="page" for nested prescription route', () => {
    mockUsePathname.mockReturnValue('/prescriptions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    render(<AppSidebar />);

    const homeLink = screen.getByRole('link', { name: /^Home$/i });
    expect(homeLink).not.toHaveAttribute('aria-current');

    const prescriptionsLink = screen.getByRole('link', { name: /^Prescriptions$/i });
    expect(prescriptionsLink).toHaveAttribute('aria-current', 'page');

    const patientsLink = screen.getByRole('link', { name: /^Patients$/i });
    expect(patientsLink).not.toHaveAttribute('aria-current');
  });

  it('highlights Reports and sets aria-current="page" when pathname is "/audit"', () => {
    mockUsePathname.mockReturnValue('/audit');
    render(<AppSidebar />);

    const reportsLink = screen.getByRole('link', { name: /^Reports$/i });
    expect(reportsLink).toHaveAttribute('aria-current', 'page');
    expect(reportsLink).toHaveAttribute('href', '/audit');
  });

  it('ensures all navigation links meet the 44px accessible touch target guideline', () => {
    render(<AppSidebar />);

    const navLinks = screen.getAllByRole('link').filter((link) => {
      return link.getAttribute('href') !== '/' || link.textContent?.includes('Home');
    });

    navLinks.forEach((link) => {
      expect(link.className).toContain('min-h-[44px]');
    });
  });
});
