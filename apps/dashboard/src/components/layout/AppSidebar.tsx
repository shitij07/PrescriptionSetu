'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Users,
  FileText,
  Bell,
  BarChart3,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Pill,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

const navItems: NavItem[] = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Patients', href: '/patients', icon: Users },
  { label: 'Prescriptions', href: '/prescriptions', icon: FileText },
  { label: 'Reminders', href: '/reminders', icon: Bell },
  { label: 'Reports', href: '/audit', icon: BarChart3 },
  { label: 'Staff', href: '/staff', icon: UserCheck },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={`bg-white border-r border-slate-200/90 flex flex-col justify-between transition-all duration-200 z-30 shrink-0 select-none shadow-[1px_0_3px_rgba(0,0,0,0.02)] ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Brand Header */}
      <div>
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100">
          <Link href="/" className="flex items-center space-x-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white shrink-0 shadow-sm shadow-brand-500/30">
              <Pill className="w-4 h-4" />
            </div>
            {!isCollapsed && (
              <div className="leading-tight">
                <span className="font-bold text-sm text-slate-900 tracking-tight block">PrescriptionSetu</span>
                <span className="text-[10px] text-brand-600 font-mono font-semibold uppercase tracking-wider block">
                  Clinical Portal
                </span>
              </div>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors hidden sm:block"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation List */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center min-h-[44px] space-x-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all group relative ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 bg-brand-500 rounded-r-full" />
                )}
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                {!isCollapsed && (
                  <span className="flex-1 truncate">{item.label}</span>
                )}
                {!isCollapsed && item.badge !== undefined && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile Mini-card */}
      <div className="p-3 border-t border-slate-100">
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-full bg-brand-100 border border-brand-200 flex items-center justify-center text-brand-700 font-semibold text-xs shrink-0">
            AP
          </div>
          {!isCollapsed && (
            <div className="leading-tight overflow-hidden">
              <span className="text-xs font-medium text-slate-900 block truncate">
                Dr. Ananya Patil
              </span>
              <span className="text-[10px] text-mint font-medium flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-mint inline-block" />
                <span>Primary Verifier</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
