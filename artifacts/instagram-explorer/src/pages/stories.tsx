import React from 'react';
import { useGetStories, useGetSession, getGetStoriesQueryKey } from '@workspace/api-client-react';
import { History, ShieldAlert, AlertCircle, Clock, Eye } from 'lucide-react';
import { JsonViewer } from '@/components/ui/json-viewer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Link } from 'wouter';

export default function StoriesTray() {
  const { data: session } = useGetSession();
  const { data, isLoading, error, refetch } = useGetStories({
    query: { enabled: !!session?.active, queryKey: getGetStoriesQueryKey() }
  });

  const isAuth = session?.active;

  if (!isAuth) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-mono font-bold tracking-tight text-white flex items-center gap-3">
            <History className="w-6 h-6 text-primary" />
            STORIES_TRAY
          </h1>
        </div>
        
        <Card className="bg-destructive/10 border-destructive p-8 flex flex-col items-center text-center space-y-4 shadow-md">
          <ShieldAlert className="w-12 h-12 text-destructive" />
          <div>
            <h2 className="text-lg font-mono font-bold text-destructive">UNAUTHORIZED ACCESS</h2>
            <p className="text-sm font-mono text-muted-foreground mt-2 max-w-md mx-auto">
              Fetching the stories tray requires an active authenticated session. Anonymous scraping is not permitted for ephemeral content.
            </p>
          </div>
          <Link href="/session" className="mt-4">
            <Button className="font-mono bg-destructive text-white hover:bg-destructive/90">
              CONFIGURE SESSION
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const trayItems = (data?.data?.tray as any[]) || [];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-mono font-bold tracking-tight text-white flex items-center gap-3">
          <History className="w-6 h-6 text-primary" />
          STORIES_TRAY
        </h1>
        <p className="text-muted-foreground font-mono text-sm">
          Extract ephemeral content metadata. Viewing here does not trigger 'seen' mutations.
        </p>
      </div>

      <div className="flex gap-3">
        <Button 
          onClick={() => refetch()} 
          disabled={isLoading} 
          className="font-mono bg-primary text-black hover:bg-primary/90 shadow-[0_0_15px_rgba(0,255,255,0.2)]"
        >
          {isLoading ? 'SYNCING...' : 'REFRESH TRAY'}
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded text-destructive font-mono text-sm">
          [ERROR] Failed to fetch stories. Session may be invalid or rate limited.
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-1 space-y-4">
            <Card className="bg-[#0d1117] border-border p-4 shadow-md text-sm font-mono">
              <h3 className="text-primary font-bold mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> Stealth Mode Active
              </h3>
              <p className="text-muted-foreground text-xs leading-relaxed mb-4">
                This endpoint retrieves the stories feed payload without sending the <span className="text-white bg-black px-1 rounded">seen</span> mutation back to Instagram. The creators will not know you viewed these metadata entries.
              </p>
              
              <div className="pt-4 border-t border-border/50 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Available Trays</span>
                  <span className="text-white font-bold">{trayItems.length}</span>
                </div>
              </div>
            </Card>

            {trayItems.length > 0 && (
              <div className="space-y-2">
                {trayItems.slice(0, 5).map((tray: any, i: number) => (
                  <div key={i} className="bg-[#0a0a0a] border border-border/50 p-3 rounded flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-black border-2 border-primary p-0.5 overflow-hidden">
                        <img src={tray.user?.profile_pic_url} className="w-full h-full rounded-full object-cover" alt="" />
                      </div>
                      <div>
                        <div className="text-sm text-white font-mono font-bold">{tray.user?.username}</div>
                        <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {tray.latest_reel_media ? format(new Date(tray.latest_reel_media * 1000), 'HH:mm:ss') : 'Unknown'}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs font-mono bg-black px-2 py-1 rounded text-muted-foreground flex items-center gap-1 border border-border/50">
                      <Eye className="w-3 h-3" />
                      {tray.items?.length || 0}
                    </div>
                  </div>
                ))}
                {trayItems.length > 5 && (
                  <div className="text-center text-[10px] text-muted-foreground font-mono pt-2">
                    + {trayItems.length - 5} more in raw response
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="xl:col-span-2 space-y-4 flex flex-col">
            <div className="bg-[#0d1117] border border-border p-3 flex justify-between items-center rounded-t-lg border-b-0 font-mono text-sm">
              <span className="font-bold text-foreground">RAW_RESPONSE</span>
              <span className="text-[10px] text-muted-foreground">HTTP {data.statusCode} | {data.durationMs}ms</span>
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
