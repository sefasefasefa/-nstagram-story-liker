import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLogin, useGetCurrentUser, getGetCurrentUserQueryKey } from '@workspace/api-client-react';
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle, ExternalLink, KeyRound, Shield, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Card } from '@/components/ui/card';
import { useQueryClient } from '@tanstack/react-query';

const loginSchema = z.object({
  username: z.string().min(1, 'Kullanıcı adı gerekli'),
  password: z.string().min(1, 'Şifre gerekli'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

interface AutoStatus {
  hasCredentials: boolean;
  isSessionActive: boolean;
  lastRefreshAt: string | null;
  lastRefreshMethod: "token_refresh" | "full_login" | null;
  refreshCount: number;
  tokenRefreshCount: number;
  fullLoginCount: number;
  error: string | null;
}

function useAutoStatus() {
  const [status, setStatus] = useState<AutoStatus | null>(null);
  useEffect(() => {
    fetch('/api/auth/auto-status')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setStatus(d))
      .catch(() => {});
    const id = setInterval(() => {
      fetch('/api/auth/auto-status')
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setStatus(d))
        .catch(() => {});
    }, 8000);
    return () => clearInterval(id);
  }, []);
  return status;
}

// Checkpoint step-by-step guide
function CheckpointGuide({ onBack }: { onBack: () => void }) {
  const [_, setLocation] = useLocation();
  const steps = [
    { n: 1, text: 'Instagram.com\'u tarayıcında aç ve hesabına giriş yap.' },
    { n: 2, text: 'Instagram kimliğini doğrulamanı isterse adımları tamamla (SMS, e-posta vb.).' },
    { n: 3, text: 'Başarıyla giriş yaptıktan sonra aşağıdaki Oturum Yöneticisi\'ne git ve çerezlerini yapıştır.' },
  ];

  return (
    <div className="w-full max-w-sm space-y-4">
      <Card className="p-6 border-orange-500/30 bg-orange-500/5 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-orange-500/10">
            <Shield className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-sm">Instagram doğrulaması gerekiyor</h2>
            <p className="text-xs text-muted-foreground">Hesabın bu işlemi doğrulamanı istiyor</p>
          </div>
        </div>

        <div className="space-y-3">
          {steps.map(({ n, text }) => (
            <div key={n} className="flex gap-3 items-start">
              <span className="shrink-0 w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-[11px] font-bold flex items-center justify-center mt-0.5">
                {n}
              </span>
              <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2 pt-1">
          <Button
            className="w-full gap-2 bg-primary hover:bg-primary/90 text-white font-semibold h-9"
            onClick={() => setLocation('/session')}
          >
            <KeyRound className="w-4 h-4" />
            Oturum Yöneticisi'ne git
            <ArrowRight className="w-4 h-4 ml-auto" />
          </Button>
          <Button
            variant="ghost"
            className="w-full text-xs text-muted-foreground hover:text-foreground h-8"
            onClick={onBack}
          >
            Geri dön
          </Button>
        </div>
      </Card>

      <div className="rounded-lg border border-border/50 bg-card/30 px-4 py-3 space-y-1.5">
        <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Neden bu oluyor?
        </p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Instagram bu sunucunun IP adresinden giriş yapılmasını engelledi. Kendi tarayıcında doğrulama yapıp
          çerezleri buraya yapıştırarak oturumunu aktarabilirsin.
        </p>
      </div>
    </div>
  );
}

export default function Login() {
  const [_, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const loginMutation = useLogin();
  const autoStatus = useAutoStatus();
  const [showCheckpoint, setShowCheckpoint] = useState(false);

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
        setShowCheckpoint(true);
      } else {
        form.setError('root', { message: result.error || 'Giriş başarısız' });
      }
    } catch (err: any) {
      form.setError('root', { message: err?.message || 'Beklenmeyen bir hata oluştu' });
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (showCheckpoint) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background animate-in fade-in duration-300">
        <CheckpointGuide onBack={() => setShowCheckpoint(false)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background animate-in fade-in duration-500">
      <div className="w-full max-w-sm space-y-4">

        {/* Otomatik oturum durumu */}
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
