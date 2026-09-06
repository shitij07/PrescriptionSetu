import React from 'react';

export type BadgeVariant =
  | 'confirmed'
  | 'verified'
  | 'active'
  | 'pending'
  | 'corrected'
  | 'rejected'
  | 'stopped'
  | 'urgent'
  | 'neutral';

interface BadgePillProps {
  variant: BadgeVariant;
  label?: string;
  children?: React.ReactNode;
  size?: 'sm' | 'md';
}

export function BadgePill({ variant, label, children, size = 'sm' }: BadgePillProps) {
  const styles: Record<BadgeVariant, string> = {
    confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pending: 'bg-amber-50 text-amber-800 border-amber-200',
    corrected: 'bg-brand-50 text-brand-700 border-brand-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
    stopped: 'bg-slate-100 text-slate-600 border-slate-200',
    urgent: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
    neutral: 'bg-slate-50 text-slate-700 border-slate-200',
  };

  const sizeClasses = size === 'sm' ? 'px-2.5 py-0.5 text-[10px]' : 'px-3 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border tracking-wide uppercase font-mono ${styles[variant]} ${sizeClasses}`}
    >
      {children || label || variant}
    </span>
  );
}
