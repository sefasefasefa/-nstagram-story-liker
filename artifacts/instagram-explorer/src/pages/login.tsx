import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLogin, useGetCurrentUser, getGetCurrentUserQueryKey } from '@workspace/api-client-react';
import {
  Loader2, RefreshCw, ShieldCheck, AlertTriangle, KeyRound,
  Shield, ExternalLink, ClipboardPaste, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Card } from '@/components/ui/card';
import { useQueryClient } from '@tanstack/react-query';

// ── Schemas ───────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  username: z.string().min(1, 'Kullanıcı adı gerekli'),
  password: z.string().min(1, 'Şifre gerekli'),
});
type LoginFormValues = z.infer<typeof loginSchema>;

// ── Auto-session status ───────────────────────────────────────────────────────

interface AutoStatus {
  hasCredentials: boolean;
  isSessionActive: boolean;
  lastRefreshAt: string | null;
  lastRefreshMethod: 'token_refresh' | 'full_login' | null;
  refreshCount: number;
  error: string | null;
}

function useAutoStatus() {
  const [status, setStatus] = useState<AutoStatus | null>(null);
  useEffect(() => {
    const poll = () =>
      fetch('/api/auth/auto-status')
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setStatus(d))
        .catch(() => {});
    poll();
    const id = setInterval(poll, 8000);
    return () => clearInterval(id);
  }, []);
  return status;
}

// ── Checkpoint: browser-based verification ───────────────────────────────────
// Instagram's auth_platform challenge blocks server-side code sending.
// The user must verify in their own browser, then paste the sessionid cookie.

function CheckpointVerify({
  checkpointUrl,
  onSuccess,
  onCancel,
}: {
  checkpointUrl: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);

  const igVerifyUrl = `https://www.instagram.com${checkpointUrl.startsWith('/') ? checkpointUrl : '/' + checkpointUrl}`;

  const openInstagram = () => {
    window.open(igVerifyUrl, '_blank', 'noopener');
    setStep(2);
  };

  const submit = async () => {
    const sid = sessionId.trim();
    if (sid.length < 10) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/session/from-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid }),
      });
      const data = await r.json();
      if (data.success) {
        await fetch('/api/auth/checkpoint', { method: 'DELETE' }).catch(() => {});
        onSuccess();
      } else {
        setError(data.error ?? 'SessionId geçersiz veya süresi dolmuş.');
      }
    } catch {
      setError('Bağlantı hatası. Lütfen tekrar dene.');
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    await fetch('/api/auth/checkpoint', { method: 'DELETE' }).catch(() => {});
    onCancel();
  };

  return (
    <div className="w-full max-w-sm space-y-3 animate-in fade-in duration-300">
      <Card className="p-6 border-border bg-card shadow-xl space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-full bg-yellow-500/10 shrink-0">
            <Shield className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-sm">Tarayıcıda doğrulama gerekiyor</h2>
            <p className="text-xs text-muted-foreground">
              Instagram bu hesap için manuel doğrulama istiyor
            </p>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {/* Step 1 */}
          <div className={`rounded-lg border px-3 py-2.5 flex items-start gap-3 transition-colors ${step === 1 ? 'border-primary/40 bg-primary/5' : 'border-border/40 bg-transparent'}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${step > 1 ? 'bg-green-500 text-white' : 'bg-primary text-white'}`}>
              {step > 1 ? '✓' : '1'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground">Instagram'da doğrula</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Aşağıdaki butona tıkla, Instagram'da SMS/e-posta kodunu gir</p>
              <Button
                size="sm"
                className="mt-2 h-7 text-xs gap-1.5 bg-primary/90 hover:bg-primary text-white"
                onClick={openInstagram}
              >
                <ExternalLink className="w-3 h-3" />
                Instagram'ı aç
              </Button>
            </div>
          </div>

          {/* Step 2 */}
          <div className={`rounded-lg border px-3 py-2.5 flex items-start gap-3 transition-colors ${step === 2 ? 'border-primary/40 bg-primary/5' : 'border-border/30 bg-transparent opacity-60'}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${step === 2 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
              2
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-xs font-medium text-foreground">Session ID'yi yapıştır</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Doğruladıktan sonra tarayıcıda <span className="font-mono bg-muted/60 px-1 rounded text-[10px]">F12</span> → Application → Cookies → instagram.com → <span className="font-mono bg-muted/60 px-1 rounded text-[10px]">sessionid</span> değerini kopyala
              </p>
              <div className="flex gap-2">
                <Input
                  value={sessionId}
                  onChange={e => setSessionId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  placeholder="sessionid değeri…"
                  className="h-8 text-xs font-mono bg-background border-border/60 focus-visible:ring-1 focus-visible:ring-primary"
                  disabled={loading || step === 1}
                />
                <Button
                  size="sm"
                  className="h-8 px-3 bg-primary hover:bg-primary/90 text-white gap-1 shrink-0"
                  onClick={submit}
                  disabled={loading || sessionId.trim().length < 10 || step === 1}
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground"
          onClick={cancel}
          disabled={loading}
        >
          İptal
        </Button>
      </Card>

      <div className="rounded-lg border border-border/30 bg-card/20 px-4 py-2.5 flex items-start gap-2">
        <ClipboardPaste className="w-3 h-3 text-muted-foreground/60 mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
          SessionID sadece bu uygulamaya kaydedilir, hiçbir yere gönderilmez.
        </p>
      </div>
    </div>
  );
}

// ── Main Login component ──────────────────────────────────────────────────────

export default function Login() {
  const [_, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading } = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey() },
  });
  const loginMutation = useLogin();
  const autoStatus = useAutoStatus();

  const [checkpointUrl, setCheckpointUrl] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  useEffect(() => {
    if (user?.loggedIn) setLocation('/');
  }, [user, setLocation]);

  const isIpBlockError = (msg: string) =>
    msg.includes('Both login paths failed') || msg.includes('ip_block');

  const onSubmit = async (data: LoginFormValues) => {
    try {
      const result = await loginMutation.mutateAsync({ data });
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        setLocation('/');
      } else if (result.errorType === 'checkpoint') {
        // Backend saved checkpoint state — show browser verification UI
        setCheckpointUrl((result as any).checkpointUrl ?? '/challenge/');
      } else {
        form.setError('root', { message: result.error || 'Giriş başarısız' });
      }
    } catch (err: any) {
      form.setError('root', { message: err?.message || 'Beklenmeyen bir hata oluştu' });
    }
  };

  const handleVerifySuccess = () => {
    queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
    setLocation('/');
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isUserLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Checkpoint browser-verify ────────────────────────────────────────────────
  if (checkpointUrl !== null) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
        <CheckpointVerify
          checkpointUrl={checkpointUrl}
          onSuccess={handleVerifySuccess}
          onCancel={() => setCheckpointUrl(null)}
        />
      </div>
    );
  }

  // ── Login form ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background animate-in fade-in duration-500">
      <div className="w-full max-w-sm space-y-4">

        {autoStatus?.hasCredentials && (
          <Card className="px-4 py-3 border-border bg-card/60 flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 mt-0.5 text-green-400 shrink-0" />
            <div className="text-xs space-y-0.5">
              <div className="font-semibold text-green-400">Otomatik oturum aktif</div>
              <div className="text-muted-foreground">
                Oturum süresi dolunca şifren kullanılarak{' '}
                <span className="text-foreground font-medium">otomatik yenilenir</span>.
              </div>
              {autoStatus.lastRefreshAt && (
                <div className="text-muted-foreground flex items-center gap-1 pt-0.5">
                  <RefreshCw className="w-3 h-3" />
                  Son yenileme: {new Date(autoStatus.lastRefreshAt).toLocaleTimeString('tr-TR')}
                  {autoStatus.refreshCount > 0 && ` (${autoStatus.refreshCount}×)`}
                </div>
              )}
              {autoStatus.error && (
                <div className="text-destructive pt-0.5">Son hata: {autoStatus.error}</div>
              )}
            </div>
          </Card>
        )}

        <Card className="p-8 border-border bg-card shadow-xl flex flex-col items-center">
          <div className="mb-6 mt-2 text-center space-y-1">
            <h1 className="text-3xl font-serif italic tracking-wide text-foreground">Instagram</h1>
            <p className="text-xs text-muted-foreground">
              Giriş yap — şifren şifrelenip kaydedilir, oturum otomatik yenilenir
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-3">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        placeholder="Telefon, kullanıcı adı veya e-posta"
                        className="bg-background text-sm h-10 border-border/60 focus-visible:ring-1 focus-visible:ring-border"
                        autoComplete="username"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Şifre"
                        className="bg-background text-sm h-10 border-border/60 focus-visible:ring-1 focus-visible:ring-border"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.formState.errors.root && (
                isIpBlockError(form.formState.errors.root.message ?? '') ? (
                  <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2 text-yellow-400 font-semibold text-sm">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Instagram sunucu IP'sini engelliyor
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Her iki giriş yolu da engellendi. Bunun yerine tarayıcından çerezleri doğrudan{' '}
                      <strong className="text-foreground">Oturum Yöneticisi</strong> ile yapıştır.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 gap-2 text-xs"
                      onClick={() => setLocation('/session')}
                    >
                      <KeyRound className="w-3 h-3" />
                      Oturum Yöneticisi'ni aç
                    </Button>
                  </div>
                ) : (
                  <div className="text-destructive text-sm text-center py-1">
                    {form.formState.errors.root.message}
                  </div>
                )
              )}

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold mt-1 h-9 rounded-lg"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Giriş Yap'
                )}
              </Button>

              <div className="pt-2 flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/20 rounded-lg px-3 py-2">
                <RefreshCw className="w-3 h-3 mt-0.5 shrink-0 text-primary/60" />
                <span>
                  Şifren cihazında AES-256 ile şifrelenerek saklanır.
                  Oturum süresi dolduğunda otomatik yenilenir, tekrar giriş yapman gerekmez.
                </span>
              </div>
            </form>
          </Form>
        </Card>
      </div>
    </div>
  );
}
