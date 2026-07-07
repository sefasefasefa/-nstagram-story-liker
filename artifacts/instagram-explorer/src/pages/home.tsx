import React, { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useGetTimeline, getGetTimelineQueryKey } from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';
import { AuthGuard } from '@/components/auth-guard';
import { StoryTray } from '@/components/feed/story-tray';
import { PostCard } from '@/components/feed/post-card';
import { Button } from '@/components/ui/button';
import { AutoLikerPanel } from '@/components/auto-liker-panel';

export default function HomeFeed() {
  const { data, isLoading, isFetching, fetchNextPage, hasNextPage } = useGetTimeline(undefined, { 
    query: { queryKey: getGetTimelineQueryKey() } 
  });
  
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Implement infinite scrolling (simplified)
  const items = data?.items || [];

  return (
    <AuthGuard>
      <div className="max-w-2xl mx-auto w-full pt-4 pb-20 animate-in fade-in duration-500">
        <AutoLikerPanel />
        <StoryTray />
        
        <div className="space-y-4">
          {items.map((item) => (
            <PostCard key={item.mediaId} post={item} />
          ))}
        </div>

        {isLoading && items.length === 0 && (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="py-20 text-center text-muted-foreground">
            <p className="mb-4">Welcome to Instagram.</p>
            <p className="text-sm">Follow some people to see their posts here.</p>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
