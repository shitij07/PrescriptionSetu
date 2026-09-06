import React from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { DevBanner } from '../components/DevBanner';
import { AppSidebar } from '../components/layout/AppSidebar';
import { AppHeader } from '../components/layout/AppHeader';

export const metadata: Metadata = {
  title: 'PrescriptionSetu — Caregiver Verification & Operations Platform',
  description: 'Safety-first prescription verification, medication management, and patient reminder operations platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-canvas text-slate-900 flex flex-col min-h-screen font-sans">
        <DevBanner />
        <div className="flex-1 flex overflow-hidden">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
            <AppHeader />
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
