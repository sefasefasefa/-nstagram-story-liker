import React from 'react';
import { Sidebar } from './sidebar';
import { HistoryPanel } from '../history-panel';
import { MobileNav } from './mobile-nav';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30 selection:text-primary">
      {/* Sidebar — desktop only */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main content — add bottom padding on mobile for bottom nav */}
        <main className="flex-1 overflow-y-auto bg-[#0a0d14] pb-16 lg:pb-0">
          {children}
        </main>

        {/* History panel — desktop only (mobile uses the drawer in MobileNav) */}
        <div className="hidden lg:flex">
          <HistoryPanel />
        </div>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
