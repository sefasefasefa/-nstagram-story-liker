import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLogin, useGetCurrentUser, getGetCurrentUserQueryKey } from '@workspace/api-client-react';
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle, ExternalLink } from 'lucide-react';
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

export default function Login() {
  const [_, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const loginMutation = useLogin();
  const autoStatus = useAutoStatus();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  useEffect(() => {
    if (user?.loggedIn) setLocation('/');
  }, [user, setLocation]);

  const isIpBlockError = (msg: string) =>
    msg.includes('IP block') || msg.includes('rate-limit') || msg.includes('public key');

  const onSubmit = async (data: LoginFormValues) => {
    try {
      const result = await loginMutation.mutateAsync({ data });
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        setLocation('/');
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

        {/* Replit IP block notice */}
        <Card className="px-4 py-3 border-yellow-500/30 bg-yellow-500/5 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-yellow-400 shrink-0" />
          <div className="text-xs space-y-1">
            <div className="font-semibold text-yellow-400">Running on Replit? Use session cookies instead</div>
            <div className="text-muted-foreground leading-relaxed">
              Instagram blocks cloud server IPs on the password login flow.{' '}
              <button
                type="button"
                className="text-yellow-400 underline underline-offset-2 hover:text-yellow-300"
                onClick={() => setLocation('/session')}
              >
                Go to Session Manager
              </button>{' '}
              and paste your <code className="text-foreground bg-black/30 px-1 rounded">sessionid</code> + <code className="text-foreground bg-black/30 px-1 rounded">csrftoken</code> cookies from your browser instead.
            </div>
          </div>
        </Card>

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
                      Instagram blocked this server's IP
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Username/password login requires fetching Instagram's encryption key, which is blocked on cloud servers. Use <strong className="text-foreground">session cookies</strong> instead — extract them from your browser in 30 seconds.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 gap-2 text-xs"
                      onClick={() => setLocation('/session')}
                    >
                      <ExternalLink className="w-3 h-3" />
                      Go to Session Manager → paste cookies
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

              {/* Otomatik yönetim notu */}
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
