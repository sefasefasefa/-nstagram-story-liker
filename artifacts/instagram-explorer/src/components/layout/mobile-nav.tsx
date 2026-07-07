import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Home, User, Image, Hash, Database, Settings, Activity, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HistoryPanel } from '../history-panel';

const NAV_ITEMS = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/profile', label: 'Profil', icon: User },
  { path: '/post', label: 'Post', icon: Image },
  { path: '/hashtag', label: 'Hashtag', icon: Hash },
  { path: '/graphql', label: 'GraphQL', icon: Database },
  { path: '/session', label: 'Oturum', icon: Settings },
];

export function MobileNav() {
  const [location, setLocation] = useLocation();
  const [showHistory, setShowHistory] = useState(false);

  return (
    <>
      {/* Bottom nav bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-border flex items-center justify-around px-1 pb-safe">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
          return (
            <button
              key={item.path}
              onClick={() => setLocation(item.path)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg transition-colors min-w-0',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span className="text-[10px] font-medium truncate">{item.label}</span>
            </button>
          );
        })}

        {/* Network log toggle */}
        <button
          onClick={() => setShowHistory(true)}
          className="flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg transition-colors text-muted-foreground"
        >
          <Activity className="w-5 h-5 shrink-0" />
          <span className="text-[10px] font-medium">Log</span>
        </button>
      </nav>

      {/* History panel drawer */}
      {showHistory && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowHistory(false)}
          />
          <div className="relative mt-auto w-full max-h-[70vh] bg-sidebar border-t border-border flex flex-col rounded-t-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Network Log
              </span>
              <button onClick={() => setShowHistory(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <HistoryPanel embedded />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
