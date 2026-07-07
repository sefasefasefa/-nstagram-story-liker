import React, { useEffect } from 'react';
import { useGetCurrentUser, getGetCurrentUserQueryKey } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });

  const isPublic = location === '/login' || location === '/session';

  useEffect(() => {
    if (!isLoading && user && !user.loggedIn && !isPublic) {
      setLocation('/login');
    }
  }, [user, isLoading, location, setLocation]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.loggedIn && !isPublic) {
    return null; // Will redirect
  }

  return <>{children}</>;
}
