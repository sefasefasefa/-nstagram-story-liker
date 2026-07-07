import React from 'react';
import { Sidebar } from './sidebar';
import { HistoryPanel } from '../history-panel';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30 selection:text-primary">
      <Sidebar />
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 overflow-y-auto bg-[#0a0d14]">
          {children}
        </main>
        <HistoryPanel />
      </div>
    </div>
  );
}
