import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLogin, useGetCurrentUser, getGetCurrentUserQueryKey } from '@workspace/api-client-react';
import {
  Loader2, RefreshCw, ShieldCheck, AlertTriangle, KeyRound,
  Shield, MessageSquare, Mail, RotateCcw, CheckCircle2,
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

// ── Checkpoint code-entry view ────────────────────────────────────────────────

interface CheckpointInfo {
  method: 'sms' | 'email' | 'unknown' | null;
  contact: string | null;
}

function CheckpointVerify({
  info,
  onSuccess,
  onCancel,
}: {
  info: CheckpointInfo;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const [currentInfo, setCurrentInfo] = useState<CheckpointInfo>(info);

  // Auto-request code on mount
  useEffect(() => {
    requestCode();
  }, []);

  const requestCode = async () => {
    setRequesting(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/checkpoint/request-code', { method: 'POST' });
      const data = await r.json();
      if (data.success === false) {
        setError(data.error ?? 'Instagram doğrulama kodu göndermedi.');
      } else {
        setRequested(true);
        if (data.method) setCurrentInfo({ method: data.method, contact: data.contact ?? null });
      }
    } catch {
      setError('Bağlantı hatası. Lütfen tekrar dene.');
    } finally {
      setRequesting(false);
    }
  };

  const submit = async () => {
    if (code.trim().length < 4) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/checkpoint/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await r.json();
      if (data.success) {
        onSuccess();
      } else {
        setError(data.error ?? 'Kod geçersiz veya süresi dolmuş.');
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

  const MethodIcon = currentInfo.method === 'email' ? Mail : MessageSquare;
  const methodLabel = currentInfo.method === 'email' ? 'e-posta' : 'SMS';

  return (
    <div className="w-full max-w-sm space-y-4 animate-in fade-in duration-300">
      <Card className="p-6 border-border bg-card shadow-xl space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-full bg-primary/10 shrink-0">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-sm">Instagram doğrulaması</h2>
            <p className="text-xs text-muted-foreground">
              {requesting
                ? 'Kod gönderiliyor…'
                : requested
                ? currentInfo.contact
                  ? `${methodLabel} ile gönderildi: ${currentInfo.contact}`
                  : `${methodLabel} ile doğrulama kodu gönderildi`
                : 'Doğrulama kodu hazırlanıyor…'}
            </p>
          </div>
        </div>

        {/* Code input */}
        <div className="space-y-3">
          <Input
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Doğrulama kodu"
            className="text-center text-xl font-mono tracking-widest h-12 bg-background border-border/60 focus-visible:ring-1 focus-visible:ring-primary"
            inputMode="numeric"
            autoComplete="one-time-code"
            disabled={loading || requesting}
          />

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          <Button
            className="w-full bg-primary hover:bg-primary/90 text-white font-semibold h-10"
            onClick={submit}
            disabled={loading || requesting || code.trim().length < 4}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Doğrula'}
          </Button>
        </div>

        {/* Resend + cancel */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-xs text-muted-foreground gap-1.5"
            onClick={requestCode}
            disabled={requesting}
          >
            {requesting
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RotateCcw className="w-3 h-3" />}
            Kodu tekrar gönder
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-xs text-muted-foreground"
            onClick={cancel}
            disabled={loading}
          >
            İptal
          </Button>
        </div>
      </Card>

      <div className="rounded-lg border border-border/40 bg-card/30 px-4 py-3 flex items-start gap-2">
        <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Instagram, hesabına bu sunucudan giriş yapıldığını doğrulamanı istiyor.
          {currentInfo.contact
            ? ` ${currentInfo.contact} adresine gönderilen kodu gir.`
            : ' Telefonuna veya e-postana gelen kodu gir.'}
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

  const [checkpointInfo, setCheckpointInfo] = useState<CheckpointInfo | null>(null);

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
        // Backend already saved state — show code-entry UI
        setCheckpointInfo({ method: null, contact: null });
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

  // ── Checkpoint code-entry ────────────────────────────────────────────────────
  if (checkpointInfo !== null) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
        <CheckpointVerify
          info={checkpointInfo}
          onSuccess={handleVerifySuccess}
          onCancel={() => setCheckpointInfo(null)}
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
