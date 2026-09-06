import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  accentColor?: 'brand' | 'mint' | 'amber' | 'rose';
  icon?: React.ComponentType<{ className?: string }>;
}

export function StatCard({
  label,
  value,
  subtitle,
  accentColor = 'brand',
  icon: Icon,
}: StatCardProps) {
  const accentStyles = {
    brand: 'text-brand-600 bg-brand-50 border-brand-200/80',
    mint: 'text-emerald-700 bg-emerald-50 border-emerald-200/80',
    amber: 'text-amber-700 bg-amber-50 border-amber-200/80',
    rose: 'text-rose-700 bg-rose-50 border-rose-200/80',
  }[accentColor];

  const valueStyles = {
    brand: 'text-slate-900',
    mint: 'text-emerald-700',
    amber: 'text-amber-800',
    rose: 'text-rose-800',
  }[accentColor];

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-medium text-slate-500 tracking-wide uppercase">{label}</span>
        {Icon && (
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${accentStyles}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div>
        <div className={`text-2xl font-bold tracking-tight ${valueStyles}`}>{value}</div>
        {subtitle && <p className="text-[11px] text-slate-500 mt-1 leading-snug">{subtitle}</p>}
      </div>
    </div>
  );
}
