import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { LogIn, Heart, Clock, CheckCircle2, Loader2, ScrollText, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface AutoLikerStatus {
  enabled: boolean;
  intervalMs: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  totalLiked: number;
  lastRunLiked: number;
  log: string[];
}

function useAutoLiker() {
  const [status, setStatus] = useState<AutoLikerStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/feed/auto-liker/status');
      if (res.ok) setStatus(await res.json());
    } catch { /* ağ hatası, sessiz geç */ }
  }, []);

  const toggle = useCallback(async (enable: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/feed/auto-liker/${enable ? 'start' : 'stop'}`, { method: 'POST' });
      if (res.ok) setStatus(await res.json());
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000); // 5 saniyede bir güncelle
    return () => clearInterval(id);
  }, [fetchStatus]);

  return { status, loading, toggle };
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const absDiff = Math.abs(diff);
  if (absDiff < 60) return diff < 0 ? `${absDiff}s önce` : `${absDiff}s sonra`;
  const mins = Math.round(absDiff / 60);
  return diff < 0 ? `${mins}dk önce` : `${mins}dk sonra`;
}

export function AutoLikerPanel() {
  const [, setLocation] = useLocation();
  const { status, loading, toggle } = useAutoLiker();
  const [logOpen, setLogOpen] = useState(false);

  const isEnabled = status?.enabled ?? false;

  return (
    <div className="w-full max-w-2xl mx-auto mb-4 rounded-xl border border-border/60 bg-card/80 backdrop-blur overflow-hidden shadow-md">
      {/* Başlık şeridi */}
      <div className="flex items-center gap-2 px-4 py-2 bg-black/30 border-b border-border/40">
        <Heart className="w-3.5 h-3.5 text-primary" />
        <span className="text-[11px] font-mono text-muted-foreground tracking-widest uppercase">
          Kontrol Paneli
        </span>
      </div>

      {/* 2 buton satırı */}
      <div className="flex items-stretch divide-x divide-border/40">

        {/* ── Sol: Tek Seferlik Giriş ── */}
        <button
          onClick={() => setLocation('/login')}
          className="flex-1 flex flex-col items-center justify-center gap-2 py-5 px-4 group hover:bg-primary/5 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <LogIn className="w-5 h-5 text-primary" />
          </div>
          <div className="text-center">
            <div className="text-sm font-semibold text-foreground">Tek Seferlik Giriş</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Oturumu yenile</div>
          </div>
          {/* Her zaman aktif rozeti */}
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
            ● HER ZAMAN AKTİF
          </span>
        </button>

        {/* ── Sağ: Otomatik Hikaye Beğenisi ── */}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-5 px-4">
          {/* Switch */}
          <div className="flex items-center gap-3">
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : (
              <Switch
                checked={isEnabled}
                onCheckedChange={toggle}
                className={cn(
                  "data-[state=checked]:bg-pink-500",
                )}
              />
            )}
            <div className={cn(
              "w-9 h-9 rounded-full border flex items-center justify-center transition-colors",
              isEnabled
                ? "bg-pink-500/15 border-pink-500/40"
                : "bg-muted/30 border-border/40"
            )}>
              <Heart className={cn("w-4 h-4 transition-colors", isEnabled ? "text-pink-400 fill-pink-400" : "text-muted-foreground")} />
            </div>
          </div>

          <div className="text-center">
            <div className="text-sm font-semibold text-foreground">Hikaye Beğeni Botu</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {isEnabled ? 'Çalışıyor — hikayeleri tarayıp beğeniyor' : 'Kapalı'}
            </div>
          </div>

          {/* Sayaç / zamanlayıcı */}
          {status && (
            <div className="flex gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-muted-foreground">
                <CheckCircle2 className="w-3 h-3 text-green-400" />
                {status.totalLiked} beğeni
              </span>
              {isEnabled && status.nextRunAt && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="w-3 h-3 text-blue-400" />
                  {formatRelative(status.nextRunAt)}
                </span>
              )}
            </div>
          )}

          {/* Durum rozeti */}
          <span className={cn(
            "text-[10px] font-mono px-2 py-0.5 rounded-full border",
            isEnabled
              ? "bg-pink-500/10 text-pink-400 border-pink-500/20"
              : "bg-muted/20 text-muted-foreground border-border/30"
          )}>
            {isEnabled ? '● AÇIK' : '○ KAPALI'}
          </span>
        </div>
      </div>

      {/* Log açma butonu */}
      {status && status.log.length > 0 && (
        <div className="border-t border-border/40">
          <button
            onClick={() => setLogOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <ScrollText className="w-3 h-3" />
              İşlem Kaydı ({status.log.length})
            </span>
            {logOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {logOpen && (
            <div className="px-4 pb-3 max-h-48 overflow-y-auto space-y-1">
              {status.log.map((line, i) => (
                <div key={i} className="text-[11px] font-mono text-muted-foreground leading-relaxed">
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
