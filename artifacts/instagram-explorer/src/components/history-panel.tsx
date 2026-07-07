import React from 'react';
import { useGetHistory, getGetHistoryQueryKey, HistoryEntry } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clock, CheckCircle2, XCircle, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export function HistoryPanel({ embedded }: { embedded?: boolean }) {
  const { data, isLoading } = useGetHistory({ query: { refetchInterval: 2000, queryKey: getGetHistoryQueryKey() } });
  
  const entries = data?.entries || [];

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return "text-green-500";
    if (status >= 400 && status < 500) return "text-yellow-500";
    if (status >= 500) return "text-destructive";
    return "text-muted-foreground";
  };

  // When embedded in the mobile drawer, skip the outer wrapper (handled by drawer)
  if (embedded) {
    return (
      <div className="p-2 flex flex-col gap-2">
        {isLoading && entries.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground font-mono">Loading history...</div>
        ) : entries.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground font-mono border border-dashed border-border rounded opacity-50">
            No requests recorded yet.
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="p-3 rounded border border-border/50 bg-[#0d1117] relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-border" />
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-1.5">
                  <span className={cn("text-[10px] font-mono font-bold px-1 rounded-sm",
                    entry.method === 'GET' ? 'bg-blue-500/10 text-blue-400' :
                    entry.method === 'POST' ? 'bg-green-500/10 text-green-400' :
                    'bg-orange-500/10 text-orange-400'
                  )}>{entry.method}</span>
                  <span className={cn("text-[10px] font-mono font-bold", getStatusColor(entry.statusCode))}>{entry.statusCode}</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                  <Clock className="w-3 h-3" />{entry.durationMs}ms
                </span>
              </div>
              <div className="text-xs font-mono text-foreground truncate mb-1.5">{entry.endpoint}</div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">{entry.label}</span>
                <span className="text-[9px] text-muted-foreground">{format(new Date(entry.timestamp), 'HH:mm:ss')}</span>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-border bg-sidebar flex flex-col h-full shrink-0">
      <div className="p-3 border-b border-border bg-black/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="font-mono text-xs font-semibold text-foreground uppercase tracking-wider">Network Log</span>
        </div>
        <div className="text-[10px] font-mono text-muted-foreground">
          {entries.length} requests
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 flex flex-col gap-2">
          {isLoading && entries.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground font-mono">
              Loading history...
            </div>
          ) : entries.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground font-mono border border-dashed border-border rounded opacity-50">
              No requests recorded yet.
            </div>
          ) : (
            entries.map((entry) => (
              <div 
                key={entry.id} 
                className="p-3 rounded border border-border/50 bg-[#0d1117] hover:border-primary/30 transition-colors group relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-border group-hover:bg-primary/50 transition-colors" />
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-[10px] font-mono font-bold px-1 rounded-sm", 
                      entry.method === 'GET' ? 'bg-blue-500/10 text-blue-400' : 
                      entry.method === 'POST' ? 'bg-green-500/10 text-green-400' : 
                      'bg-orange-500/10 text-orange-400'
                    )}>
                      {entry.method}
                    </span>
                    <span className={cn("text-[10px] font-mono font-bold", getStatusColor(entry.statusCode))}>
                      {entry.statusCode}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {entry.durationMs}ms
                  </span>
                </div>
                
                <div className="text-xs font-mono text-foreground truncate mb-1.5" title={entry.endpoint}>
                  {entry.endpoint}
                </div>
                
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
                  <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">
                    {entry.label}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {format(new Date(entry.timestamp), 'HH:mm:ss')}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
