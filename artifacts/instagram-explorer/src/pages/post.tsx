import React, { useState } from 'react';
import { useGetPost, getGetPostQueryKey } from '@workspace/api-client-react';
import { Search, Image as ImageIcon, Heart, MessageCircle, Clock, Maximize2 } from 'lucide-react';
import { JsonViewer } from '@/components/ui/json-viewer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { format } from 'date-fns';

export default function PostInspector() {
  const [searchInput, setSearchInput] = useState('');
  const [shortcode, setShortcode] = useState('');

  const { data, isLoading, error } = useGetPost(
    shortcode,
    { query: { enabled: !!shortcode, queryKey: getGetPostQueryKey(shortcode) } }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let code = searchInput.trim();
    // Extract shortcode if it's a URL
    if (code.includes('instagram.com/p/') || code.includes('instagram.com/reel/')) {
      const match = code.match(/\/(?:p|reel)\/([^\/?]+)/);
      if (match && match[1]) code = match[1];
    }
    if (code) {
      setShortcode(code);
    }
  };

  // Safely extract post data - instagram API responses are nested and fragile
  const post = data?.data?.xdt_shortcode_media as any;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-mono font-bold tracking-tight text-white flex items-center gap-3">
          <ImageIcon className="w-6 h-6 text-primary" />
          POST_INSPECTOR
        </h1>
        <p className="text-muted-foreground font-mono text-sm">
          Extract media URLs, interaction metrics, and metadata by post shortcode.
        </p>
      </div>

      <Card className="bg-[#0d1117] border-border p-4 shadow-md">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Post shortcode or URL (e.g., C_zW7Q5)" 
              className="pl-9 bg-black/30 border-border/50 font-mono text-sm focus-visible:ring-primary focus-visible:border-primary"
            />
          </div>
          <Button type="submit" disabled={isLoading} className="font-mono bg-primary text-black hover:bg-primary/90">
            {isLoading ? 'SCANNING...' : 'EXECUTE'}
          </Button>
        </form>
      </Card>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded text-destructive font-mono text-sm">
          [ERROR] Failed to fetch post. Invalid shortcode or resource is private.
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 duration-500">
          
          <div className="space-y-6">
            {post ? (
              <Card className="bg-[#0d1117] border-border overflow-hidden shadow-md">
                <div className="p-4 border-b border-border/50 bg-black/20 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={post.owner?.profile_pic_url} alt="author" className="w-8 h-8 rounded-full border border-primary/30" />
                    <div>
                      <div className="text-sm font-bold text-white font-mono">{post.owner?.username}</div>
                      <div className="text-[10px] text-muted-foreground font-mono uppercase">{post.owner?.full_name}</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {post.taken_at_timestamp ? format(new Date(post.taken_at_timestamp * 1000), 'yyyy-MM-dd HH:mm:ss') : 'Unknown'}
                  </div>
                </div>

                {/* Media preview */}
                <div className="relative aspect-square bg-black flex items-center justify-center border-b border-border/50 overflow-hidden group">
                  {post.is_video ? (
                    <video src={post.video_url} controls className="max-h-full object-contain" />
                  ) : post.edge_sidecar_to_children ? (
                    <div className="grid grid-cols-2 gap-1 w-full h-full p-1">
                      {post.edge_sidecar_to_children.edges.slice(0, 4).map((edge: any, i: number) => (
                        <img key={i} src={edge.node.display_url} className="w-full h-full object-cover rounded-sm" alt="carousel item" />
                      ))}
                    </div>
                  ) : (
                    <img src={post.display_url} className="max-h-full object-contain" alt="post content" />
                  )}
                  <a 
                    href={post.is_video ? post.video_url : post.display_url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="absolute top-2 right-2 p-2 bg-black/60 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary"
                    title="Open original media"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </a>
                </div>

                <div className="p-5 font-mono text-sm space-y-4">
                  <div className="flex gap-6 pb-4 border-b border-border/30">
                    <div className="flex items-center gap-2">
                      <Heart className="w-5 h-5 text-red-500 fill-red-500/20" />
                      <span className="font-bold text-lg">{post.edge_media_preview_like?.count?.toLocaleString() || 0}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-5 h-5 text-blue-500 fill-blue-500/20" />
                      <span className="font-bold text-lg">{post.edge_media_to_comment?.count?.toLocaleString() || 0}</span>
                    </div>
                    <div className="ml-auto flex flex-col items-end justify-center">
                      <span className="text-[10px] text-muted-foreground uppercase">Type</span>
                      <span className="text-primary font-bold">{post.__typename?.replace('Graph', '') || 'Media'}</span>
                    </div>
                  </div>

                  {post.edge_media_to_caption?.edges?.[0]?.node?.text && (
                    <div>
                      <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Caption</div>
                      <div className="text-white text-xs whitespace-pre-wrap leading-relaxed">
                        {post.edge_media_to_caption.edges[0].node.text}
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Internal ID</div>
                    <div className="text-primary bg-primary/10 px-2 py-1 rounded inline-block text-xs">{post.id}</div>
                  </div>
                </div>
              </Card>
            ) : (
              <div className="p-8 bg-[#0d1117] border border-border/50 border-dashed rounded text-center text-muted-foreground font-mono text-sm">
                No UI mapping for this specific response format. See Raw Response.
              </div>
            )}
          </div>
          
          <div className="space-y-4 flex flex-col">
            <div className="bg-[#0d1117] border border-border p-3 flex justify-between items-center rounded-t-lg border-b-0 font-mono text-sm">
              <span className="font-bold text-foreground">RAW_RESPONSE</span>
              <span className="text-[10px] text-muted-foreground">HTTP {data?.statusCode} | {data?.durationMs}ms</span>
            </div>
            <div className="flex-1 min-h-[500px]">
              <JsonViewer data={data} initiallyExpanded={false} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
