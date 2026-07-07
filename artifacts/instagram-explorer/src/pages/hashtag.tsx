import React, { useState } from 'react';
import { useGetHashtag, getGetHashtagQueryKey } from '@workspace/api-client-react';
import { Hash, Search, Image as ImageIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { JsonViewer } from '@/components/ui/json-viewer';

export default function HashtagExplorer() {
  const [searchInput, setSearchInput] = useState('');
  const [tag, setTag] = useState('');

  const { data, isLoading, error } = useGetHashtag(
    { tag },
    { query: { enabled: !!tag, queryKey: getGetHashtagQueryKey({ tag }) } }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTag = searchInput.trim().replace(/^#/, '').toLowerCase();
    if (cleanTag) {
      setTag(cleanTag);
    }
  };

  const edges = (data?.data?.data as any)?.hashtag?.edge_hashtag_to_media?.edges || [];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-mono font-bold tracking-tight text-white flex items-center gap-3">
          <Hash className="w-6 h-6 text-primary" />
          HASHTAG_ENGINE
        </h1>
        <p className="text-muted-foreground font-mono text-sm">
          Traverse hashtag feeds and extract recent media shortcodes.
        </p>
      </div>

      <Card className="bg-[#0d1117] border-border p-4 shadow-md">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Hashtag (e.g., photography)" 
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
          [ERROR] Failed to fetch hashtag data.
        </div>
      )}

      {data && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          
          <div className="bg-[#0d1117] border border-border rounded-lg overflow-hidden">
             <div className="p-4 border-b border-border/50 bg-black/20 font-mono text-sm text-foreground flex justify-between">
                <span><span className="text-primary">#{tag}</span> — {edges.length} items found</span>
             </div>
             
             {edges.length > 0 ? (
               <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {edges.map((edge: any, i: number) => {
                    const node = edge.node;
                    return (
                      <div key={i} className="group relative aspect-square bg-black border border-border/50 rounded overflow-hidden cursor-pointer hover:border-primary/50 transition-colors">
                        <img src={node.display_url} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-xs font-mono text-primary truncate">{node.shortcode}</span>
                          <span className="text-[10px] font-mono text-white flex items-center gap-1 mt-1">
                            <ImageIcon className="w-3 h-3" /> {node.__typename?.replace('Graph', '')}
                          </span>
                        </div>
                      </div>
                    )
                  })}
               </div>
             ) : (
               <div className="p-8 text-center text-muted-foreground font-mono text-sm">
                 No media found or layout structure changed.
               </div>
             )}
          </div>

          <div className="space-y-4 flex flex-col">
            <div className="bg-[#0d1117] border border-border p-3 flex justify-between items-center rounded-t-lg border-b-0 font-mono text-sm">
              <span className="font-bold text-foreground">RAW_RESPONSE</span>
              <span className="text-[10px] text-muted-foreground">HTTP {data.statusCode} | {data.durationMs}ms</span>
            </div>
            <div className="flex-1 min-h-[300px]">
              <JsonViewer data={data} initiallyExpanded={false} />
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
