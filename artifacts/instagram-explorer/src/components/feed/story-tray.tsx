import React from 'react';
import { useGetStoriesTray, getGetStoriesTrayQueryKey } from '@workspace/api-client-react';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';

export function StoryTray() {
  const [_, setLocation] = useLocation();
  const { data, isLoading } = useGetStoriesTray({ query: { queryKey: getGetStoriesTrayQueryKey() } });

  if (isLoading) {
    return (
      <div className="w-full flex gap-4 overflow-hidden py-4 px-2 mb-4 bg-background sm:bg-card sm:border sm:border-border/50 sm:rounded-lg">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1 shrink-0">
            <div className="w-16 h-16 rounded-full bg-muted animate-pulse" />
            <div className="w-12 h-2 bg-muted animate-pulse rounded" />
          </div>
        ))}
      </div>
    );
  }

  const reels = data?.reels || [];
  if (reels.length === 0) return null;

  return (
    <div className="w-full overflow-x-auto no-scrollbar py-4 px-4 sm:px-6 mb-4 bg-background sm:bg-card sm:border sm:border-border/50 sm:rounded-lg">
      <div className="flex gap-4 w-max">
        {reels.map((reel) => {
          // Check if seen timestamp is greater than or equal to latest reel media.
          const isSeen = reel.seen && reel.seen >= reel.latestReelMedia;
          
          return (
            <button 
              key={reel.userId}
              className="flex flex-col items-center gap-1 shrink-0 group w-16"
              onClick={() => setLocation(`/stories?userId=${reel.userId}`)}
            >
              <div className={cn(
                "p-[2px] rounded-full transition-transform active:scale-95",
                isSeen ? "bg-border" : "ig-gradient-ring"
              )}>
                <div className="w-[60px] h-[60px] rounded-full border-2 border-background overflow-hidden bg-muted">
                  <img 
                    src={reel.user.profilePicUrl} 
                    alt={reel.user.username} 
                    className="w-full h-full object-cover" 
                  />
                </div>
              </div>
              <span className={cn(
                "text-xs truncate w-full text-center tracking-tight",
                isSeen ? "text-muted-foreground" : "text-foreground"
              )}>
                {reel.user.username}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
