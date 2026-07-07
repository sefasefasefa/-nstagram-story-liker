import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useGetUserStories, useMarkStorySeen, getGetUserStoriesQueryKey } from '@workspace/api-client-react';
import { X, ChevronLeft, ChevronRight, Loader2, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';

export default function StoryViewer() {
  const [location, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const targetUserId = params.get('userId');
  const queryClient = useQueryClient();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const STORY_DURATION = 5000; // 5 seconds per image
  const progressTimerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const { data, isLoading } = useGetUserStories(targetUserId || '', { 
    query: { 
      enabled: !!targetUserId, 
      queryKey: getGetUserStoriesQueryKey(targetUserId || '') 
    } 
  });
  
  const markSeenMutation = useMarkStorySeen();

  const items = data?.items || [];
  const user = data?.user;
  const currentStory = items[currentIndex];

  // Auto-advance logic
  useEffect(() => {
    if (!currentStory || isPaused || items.length === 0) return;

    // Reset progress when story changes
    setProgress(0);
    startTimeRef.current = Date.now();

    const updateProgress = () => {
      if (isPaused) {
        // Adjust start time so it doesn't jump when unpaused
        startTimeRef.current = Date.now() - (progress * STORY_DURATION / 100);
        return;
      }
      
      const elapsed = Date.now() - startTimeRef.current;
      const newProgress = Math.min((elapsed / STORY_DURATION) * 100, 100);
      
      setProgress(newProgress);

      if (newProgress >= 100) {
        handleNext();
      } else {
        progressTimerRef.current = requestAnimationFrame(updateProgress);
      }
    };

    progressTimerRef.current = requestAnimationFrame(updateProgress);

    return () => {
      if (progressTimerRef.current) cancelAnimationFrame(progressTimerRef.current);
    };
  }, [currentIndex, isPaused, items.length, currentStory]);

  // Mark as seen when viewed
  useEffect(() => {
    if (currentStory && user) {
      // In a real app we'd need reelId which comes from tray, but we'll mock it for the API call
      markSeenMutation.mutate({ 
        data: {
          reelMediaId: currentStory.storyId,
          reelId: user.userId, // Approximation
          reelMediaOwnerId: user.userId,
          reelMediaTakenAt: currentStory.takenAt,
          viewSeenAt: Math.floor(Date.now() / 1000)
        }
      });
    }
  }, [currentStory, user]);

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else {
      // Go to previous user's reel in a real app, here we just reset progress
      setProgress(0);
      startTimeRef.current = Date.now();
    }
  };

  const handleClose = () => {
    setLocation('/');
  };

  if (!targetUserId) {
    setLocation('/');
    return null;
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-[#1a1a1a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-[#1a1a1a] flex flex-col items-center justify-center text-white">
        <p className="mb-4">No stories available.</p>
        <button onClick={handleClose} className="px-4 py-2 bg-white/10 rounded-lg">Go back</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#1a1a1a] sm:bg-black/90 flex items-center justify-center overflow-hidden animate-in fade-in duration-300">
      
      {/* Desktop Close Button */}
      <button 
        onClick={handleClose}
        className="absolute top-4 right-4 z-50 p-2 text-white/70 hover:text-white transition-colors hidden sm:block"
      >
        <X className="w-8 h-8" />
      </button>

      {/* Main Story Container */}
      <div className="relative w-full h-full sm:w-[400px] sm:h-[90vh] sm:max-h-[850px] bg-black sm:rounded-xl overflow-hidden flex flex-col">
        
        {/* Progress Bars */}
        <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 p-2 pt-4 bg-gradient-to-b from-black/60 to-transparent">
          {items.map((_, i) => (
            <div key={i} className="h-[2px] flex-1 bg-white/30 rounded overflow-hidden">
              <div 
                className="h-full bg-white transition-all duration-100 ease-linear"
                style={{ 
                  width: `${i < currentIndex ? 100 : i === currentIndex ? progress : 0}%` 
                }}
              />
            </div>
          ))}
        </div>

        {/* Header Info */}
        <div className="absolute top-6 left-0 right-0 z-20 px-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20">
              <img src={user?.profilePicUrl} alt={user?.username} className="w-full h-full object-cover" />
            </div>
            <div className="flex items-center gap-2 drop-shadow-md">
              <span className="text-white text-sm font-semibold tracking-tight">{user?.username}</span>
              <span className="text-white/70 text-xs">
                {currentStory?.takenAt ? formatDistanceToNow(currentStory.takenAt * 1000).replace('about ', '') : ''}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:hidden">
            <button onClick={handleClose} className="p-1 text-white drop-shadow-md">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Story Media */}
        <div className="flex-1 relative bg-zinc-900 flex items-center justify-center">
          {currentStory?.imageUrl && (
            <img 
              src={currentStory.imageUrl} 
              alt="Story" 
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Interaction Zones */}
        <div 
          className="absolute inset-0 z-10 flex"
          onPointerDown={() => setIsPaused(true)}
          onPointerUp={() => setIsPaused(false)}
          onPointerLeave={() => setIsPaused(false)}
        >
          <div className="w-1/3 h-full cursor-pointer" onClick={(e) => { e.stopPropagation(); handlePrev(); }} />
          <div className="w-2/3 h-full cursor-pointer" onClick={(e) => { e.stopPropagation(); handleNext(); }} />
        </div>
      </div>
    </div>
  );
}
