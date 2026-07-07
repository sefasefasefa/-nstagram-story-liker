import React, { useState } from 'react';
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal } from 'lucide-react';
import { useLikePost, useUnlikePost, TimelineItem } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface PostCardProps {
  post: TimelineItem;
}

export function PostCard({ post }: PostCardProps) {
  const queryClient = useQueryClient();
  const likeMutation = useLikePost();
  const unlikeMutation = useUnlikePost();
  
  const [isLiked, setIsLiked] = useState(post.hasLiked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [isAnimatingHeart, setIsAnimatingHeart] = useState(false);
  const [expandedCaption, setExpandedCaption] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const toggleLike = () => {
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikeCount((prev) => newLikedState ? prev + 1 : Math.max(0, prev - 1));
    
    if (newLikedState) {
      setIsAnimatingHeart(true);
      setTimeout(() => setIsAnimatingHeart(false), 300);
      likeMutation.mutate({ mediaId: post.mediaId });
    } else {
      unlikeMutation.mutate({ mediaId: post.mediaId });
    }
  };

  const hasMultipleMedia = post.carouselMedia && post.carouselMedia.length > 0;
  // For simplicity, we'll just show the first image of the carousel or the main image.
  const displayImage = post.imageUrl;

  return (
    <article className="max-w-lg w-full mx-auto bg-background sm:bg-card sm:border border-border/50 sm:rounded-lg mb-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-muted overflow-hidden border border-border">
            <img src={post.author.profilePicUrl} alt={post.author.username} className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground flex items-center gap-1">
              {post.author.username}
              {post.author.isVerified && (
                <svg aria-label="Verified" className="w-3 h-3 text-blue-500 fill-current" viewBox="0 0 24 24">
                  <path d="M12.001 2.02c5.513 0 9.98 4.468 9.98 9.981 0 5.513-4.467 9.981-9.98 9.981-5.513 0-9.981-4.468-9.981-9.981 0-5.513 4.468-9.981 9.981-9.981zm0 1.96a8.02 8.02 0 100 16.04 8.02 8.02 0 000-16.04zm4.188 5.41l.98 1.15-6.52 5.55-3.32-3.33 1.14-1.15 2.06 2.06 5.66-4.28z" />
                </svg>
              )}
            </div>
          </div>
        </div>
        <button className="text-muted-foreground hover:text-foreground p-1">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Media */}
      <div className="relative aspect-square w-full bg-muted overflow-hidden flex items-center justify-center">
        {!imageLoaded && (
          <div className="absolute inset-0 animate-pulse bg-muted-foreground/10" />
        )}
        <img 
          src={displayImage} 
          alt={post.caption || 'Post image'} 
          className={cn("w-full h-full object-cover transition-opacity duration-300", imageLoaded ? "opacity-100" : "opacity-0")}
          onLoad={() => setImageLoaded(true)}
          onDoubleClick={!isLiked ? toggleLike : undefined}
        />
      </div>

      {/* Actions */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <button onClick={toggleLike} className="group transition-transform active:scale-95">
              <Heart 
                className={cn(
                  "w-6 h-6 transition-colors", 
                  isLiked ? "fill-red-500 text-red-500" : "text-foreground group-hover:text-muted-foreground",
                  isAnimatingHeart && "animate-heart-pop"
                )} 
              />
            </button>
            <button className="text-foreground hover:text-muted-foreground transition-colors active:scale-95">
              <MessageCircle className="w-6 h-6" />
            </button>
            <button className="text-foreground hover:text-muted-foreground transition-colors active:scale-95">
              <Send className="w-6 h-6" />
            </button>
          </div>
          <button className="text-foreground hover:text-muted-foreground transition-colors active:scale-95">
            <Bookmark className="w-6 h-6" />
          </button>
        </div>

        {/* Likes */}
        <div className="text-sm font-semibold mb-1">
          {likeCount.toLocaleString()} likes
        </div>

        {/* Caption */}
        {post.caption && (
          <div className="text-sm mb-1">
            <span className="font-semibold mr-2">{post.author.username}</span>
            <span className={cn(!expandedCaption && "line-clamp-2")}>
              {post.caption}
            </span>
            {!expandedCaption && post.caption.length > 80 && (
              <button onClick={() => setExpandedCaption(true)} className="text-muted-foreground text-sm mt-1 block">
                more
              </button>
            )}
          </div>
        )}

        {/* Comments link */}
        {post.commentCount > 0 && (
          <button className="text-sm text-muted-foreground mt-1">
            View all {post.commentCount.toLocaleString()} comments
          </button>
        )}

        {/* Timestamp */}
        <div className="text-[10px] text-muted-foreground uppercase mt-2 tracking-wide">
          {formatDistanceToNow(post.timestamp * 1000)} ago
        </div>
      </div>
    </article>
  );
}
