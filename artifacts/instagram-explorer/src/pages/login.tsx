import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLogin, useGetCurrentUser, getGetCurrentUserQueryKey } from '@workspace/api-client-react';
import {
  Loader2, RefreshCw, ShieldCheck, AlertTriangle,
  Shield, ArrowRight,
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

// ── Checkpoint: in-app OTP verification ────────────────────────────────────────
// Instagram sometimes requires a one-time SMS/email code after username/password
// login ("checkpoint"). This requests the code and verifies it directly in the
// app — no browser tab-switching or manual cookie copying required.

type CheckpointPhase = 'requesting' | 'awaiting-code' | 'verifying' | 'failed';

function CheckpointOtpVerify({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<CheckpointPhase>('requesting');
  const [method, setMethod] = useState<'sms' | 'email' | 'unknown' | null>(null);
  const [contact, setContact] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const requestCode = async () => {
    setPhase('requesting');
    setError(null);
    try {
      const r = await fetch('/api/auth/checkpoint/request-code', { method: 'POST' });
      const data = await r.json();
      if (data.success) {
        setMethod(data.method ?? 'unknown');
        setContact(data.contact ?? null);
        setPhase('awaiting-code');
      } else {
        setError(data.error ?? 'Doğrulama kodu gönderilemedi.');
        setPhase('failed');
      }
    } catch {
      setError('Bağlantı hatası. Lütfen tekrar dene.');
      setPhase('failed');
    }
  };

  useEffect(() => {
    requestCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resend = async () => {
    setResending(true);
    await requestCode();
    setResending(false);
  };

  const submit = async () => {
    const trimmed = code.trim();
    if (trimmed.length < 4) return;
    setPhase('verifying');
    setError(null);
    try {
      const r = await fetch('/api/auth/checkpoint/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await r.json();
      if (data.success) {
        onSuccess();
      } else {
        setError(data.error ?? 'Kod hatalı veya süresi dolmuş.');
        setPhase('awaiting-code');
      }
    } catch {
      setError('Bağlantı hatası. Lütfen tekrar dene.');
      setPhase('awaiting-code');
    }
  };

  const cancel = async () => {
    await fetch('/api/auth/checkpoint', { method: 'DELETE' }).catch(() => {});
    onCancel();
  };

  const methodLabel = method === 'sms' ? 'SMS' : method === 'email' ? 'e-posta' : 'SMS/e-posta';

  return (
    <Card className="p-6 border-border bg-card shadow-xl space-y-5 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-full bg-yellow-500/10 shrink-0">
          <Shield className="w-5 h-5 text-yellow-400" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground text-sm">Doğrulama kodu gerekiyor</h2>
          <p className="text-xs text-muted-foreground">
            Instagram bu giriş için ek doğrulama istiyor
          </p>
        </div>
      </div>

      {phase === 'requesting' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Kod gönderiliyor{contact ? ` (${contact})` : '…'}
        </div>
      )}

      {(phase === 'awaiting-code' || phase === 'verifying') && (
        <div className="space-y-2">
          {method === 'unknown' && !contact ? (
            <p className="text-[11px] text-yellow-400/80 leading-relaxed">
              Instagram hangi yöntemi kullanacağını bildirmedi — telefonuna gelen bir onay bildirimini kontrol et
              veya SMS/e-posta ile bir kod geldiyse aşağıya gir.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {contact
                ? <>Instagram <strong className="text-foreground">{contact}</strong> adresine {methodLabel} ile bir kod gönderdi. Kodu aşağıya gir.</>
                : <>Instagram {methodLabel} ile bir kod gönderdi. Kodu aşağıya gir.</>}
            </p>
          )}
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={e => setCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="Doğrulama kodu…"
              inputMode="numeric"
              className="h-9 text-sm font-mono bg-background border-border/60 focus-visible:ring-1 focus-visible:ring-primary text-center tracking-widest"
              disabled={phase === 'verifying'}
              autoFocus
            />
            <Button
              size="sm"
              className="h-9 px-3 bg-primary hover:bg-primary/90 text-white gap-1 shrink-0"
              onClick={submit}
              disabled={phase === 'verifying' || code.trim().length < 4}
            >
              {phase === 'verifying' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            </Button>
          </div>
          <button
            type="button"
            onClick={resend}
            disabled={resending}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {resending ? 'Kod tekrar gönderiliyor…' : 'Kodu tekrar gönder'}
          </button>
        </div>
      )}

      {phase === 'failed' && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Instagram bu sunucuya kod gönderemedi. Bu genelde sunucunun IP'sinin bot olarak işaretlenmesinden kaynaklanır.
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {phase === 'failed' && (
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs gap-1.5"
          onClick={requestCode}
        >
          <RefreshCw className="w-3 h-3" />
          Tekrar dene
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-xs text-muted-foreground"
        onClick={cancel}
      >
        İptal
      </Button>
    </Card>
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

  const [checkpointPending, setCheckpointPending] = useState(false);

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
        // Backend saved checkpoint state — show in-app OTP verification
        setCheckpointPending(true);
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

  // ── Checkpoint OTP verification ─────────────────────────────────────────────
  if (checkpointPending) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm">
          <CheckpointOtpVerify
            onSuccess={handleVerifySuccess}
            onCancel={() => setCheckpointPending(false)}
          />
        </div>
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
              Giriş yap — şifren şifrelenip kaydedilir, gerekirse doğrulama kodu istenir
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
                      Her iki giriş yolu da engellendi. Lütfen birkaç dakika sonra tekrar dene.
                    </p>
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
