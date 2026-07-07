import React from 'react';
import { useLocation } from 'wouter';
import { ShieldAlert, User, Image, Hash, History, Settings, Zap, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGetSession } from '@workspace/api-client-react';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: Zap },
  { path: '/profile', label: 'Profile', icon: User },
  { path: '/post', label: 'Post / Media', icon: Image },
  { path: '/hashtag', label: 'Hashtag', icon: Hash },
  { path: '/graphql', label: 'GraphQL', icon: Database },
  { path: '/stories', label: 'Stories Tray', icon: History },
  { path: '/session', label: 'Session Status', icon: Settings },
];

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { data: sessionData } = useGetSession();

  return (
    <div className="w-64 border-r border-border bg-sidebar flex flex-col h-full overflow-hidden shrink-0">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center border border-primary/20">
          <ShieldAlert className="text-primary w-5 h-5" />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-sm tracking-tight font-mono text-primary">IG_API_EXPLORER</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Protocol Analyzer</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
          return (
            <button
              key={item.path}
              data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
              onClick={() => setLocation(item.path)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 text-left",
                isActive 
                  ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_10px_rgba(0,255,255,0.05)]" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <item.icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground")} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="p-4 border-t border-border bg-black/20">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-mono">SESSION</span>
          <div className="flex items-center gap-2">
            <span className={cn(
              "w-2 h-2 rounded-full",
              sessionData?.active ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.6)]"
            )} />
            <span className={cn("font-mono font-medium", sessionData?.active ? "text-green-500" : "text-destructive")}>
              {sessionData?.active ? 'ACTIVE' : 'NONE'}
            </span>
          </div>
        </div>
        {sessionData?.username && (
          <div className="mt-2 text-[10px] font-mono text-muted-foreground truncate">
            usr: {sessionData.username}
          </div>
        )}
      </div>
    </div>
  );
}
