import React from 'react';
import { useLocation } from 'wouter';
import { Home, User, Image, Hash, Database, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGetCurrentUser, useLogout, getGetCurrentUserQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

const NAV_ITEMS = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/profile', label: 'Profile Explorer', icon: User },
  { path: '/post', label: 'Post Inspector', icon: Image },
  { path: '/hashtag', label: 'Hashtags', icon: Hash },
  { path: '/graphql', label: 'GraphQL', icon: Database },
  { path: '/session', label: 'Session Status', icon: Settings },
];

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const logoutMutation = useLogout();

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
    setLocation('/login');
  };

  return (
    <div className="w-64 border-r border-border bg-sidebar flex flex-col h-full overflow-hidden shrink-0">
      <div className="p-6 pb-2">
        <div className="text-xl font-serif italic tracking-wide text-foreground mb-8">
          Instagram
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 flex flex-col gap-2">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
          return (
            <button
              key={item.path}
              data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
              onClick={() => setLocation(item.path)}
              className={cn(
                "flex items-center gap-4 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 text-left group",
                isActive 
                  ? "bg-muted text-foreground font-semibold" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <item.icon className={cn(
                "w-6 h-6 transition-transform group-hover:scale-105", 
                isActive ? "text-foreground" : "text-foreground"
              )} />
              <span className={cn(isActive ? "font-bold" : "font-medium text-foreground")}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-4 mt-auto">
        {user?.loggedIn && (
          <div className="flex items-center justify-between">
            <button 
              onClick={() => setLocation(`/profile?username=${user.username}`)}
              className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-lg transition-colors flex-1"
            >
              <div className="w-8 h-8 rounded-full bg-muted overflow-hidden border border-border">
                <img src={user.profilePicUrl} alt={user.username} className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-semibold text-foreground leading-tight">{user.username}</span>
                <span className="text-xs text-muted-foreground leading-tight">{user.fullName || 'User'}</span>
              </div>
            </button>
            <button 
              onClick={handleLogout}
              className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
