import React, { useState } from 'react';
import { useGetProfile, getGetProfileQueryKey } from '@workspace/api-client-react';
import { Search, User, ShieldCheck, MapPin, Link as LinkIcon, Users, Hash } from 'lucide-react';
import { JsonViewer } from '@/components/ui/json-viewer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function ProfileExplorer() {
  const [searchInput, setSearchInput] = useState('');
  const [username, setUsername] = useState('');

  const { data, isLoading, error } = useGetProfile(
    { username },
    { query: { enabled: !!username, queryKey: getGetProfileQueryKey({ username }) } }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setUsername(searchInput.trim().toLowerCase());
    }
  };

  const profile = data?.data?.user as any;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-mono font-bold tracking-tight text-white flex items-center gap-3">
          <User className="w-6 h-6 text-primary" />
          PROFILE_ANALYSIS
        </h1>
        <p className="text-muted-foreground font-mono text-sm">
          Extract detailed user metadata and structured graph data.
        </p>
      </div>

      <Card className="bg-[#0d1117] border-border p-4 shadow-md">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Target username (e.g., instagram)" 
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
          [ERROR] Failed to fetch profile. Target might not exist or network error occurred.
        </div>
      )}

      {profile && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="lg:col-span-1 space-y-6">
            <Card className="bg-[#0d1117] border-border overflow-hidden shadow-md">
              <div className="p-6 border-b border-border/50 flex flex-col items-center text-center space-y-4 bg-black/20">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-primary/30 p-1">
                  <img src={profile.profile_pic_url_hd || profile.profile_pic_url} alt="Profile" className="w-full h-full rounded-full object-cover" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center justify-center gap-2">
                    {profile.username}
                    {profile.is_verified && <ShieldCheck className="w-5 h-5 text-blue-500" />}
                  </h2>
                  <p className="text-muted-foreground font-medium">{profile.full_name}</p>
                </div>
                <div className="flex gap-4 font-mono text-sm border border-border/50 rounded-md p-2 bg-[#0a0a0a]">
                  <div className="text-center">
                    <div className="text-primary font-bold">{profile.edge_owner_to_timeline_media?.count || 0}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">Posts</div>
                  </div>
                  <div className="w-px bg-border/50" />
                  <div className="text-center">
                    <div className="text-primary font-bold">{profile.edge_followed_by?.count || 0}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">Followers</div>
                  </div>
                  <div className="w-px bg-border/50" />
                  <div className="text-center">
                    <div className="text-primary font-bold">{profile.edge_follow?.count || 0}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">Following</div>
                  </div>
                </div>
              </div>
              
              <div className="p-5 font-mono text-sm space-y-4">
                <div>
                  <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Internal ID</div>
                  <div className="text-primary bg-primary/10 px-2 py-1 rounded inline-block">{profile.id}</div>
                </div>
                
                {profile.biography && (
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Biography</div>
                    <div className="text-white whitespace-pre-wrap text-xs leading-relaxed">{profile.biography}</div>
                  </div>
                )}
                
                <div className="space-y-2 pt-2">
                  {profile.external_url && (
                    <div className="flex items-start gap-2 text-xs">
                      <LinkIcon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <a href={profile.external_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline break-all">
                        {profile.external_url}
                      </a>
                    </div>
                  )}
                  {profile.category_name && (
                    <div className="flex items-center gap-2 text-xs">
                      <Hash className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">{profile.category_name}</span>
                    </div>
                  )}
                  {profile.business_category_name && (
                    <div className="flex items-center gap-2 text-xs">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">{profile.business_category_name}</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
          
          <div className="lg:col-span-2 space-y-4 flex flex-col">
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
