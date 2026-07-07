import React, { useEffect, useRef } from 'react';
import { useSearch, useLocation } from 'wouter';
import { useGetSession, useSetSession, useClearSession } from '@workspace/api-client-react';
import { Settings, Shield, KeyRound, AlertTriangle, CheckCircle, Trash2, Save, Fingerprint, BookmarkIcon, Zap } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

const sessionSchema = z.object({
  sessionId: z.string().min(5, 'sessionid cookie is required'),
  csrfToken: z.string().min(5, 'csrftoken cookie is required'),
  username: z.string().optional(),
  userId: z.string().optional(),
});

type SessionFormValues = z.infer<typeof sessionSchema>;

/** Build the bookmarklet href — points back to this page's origin. */
function buildBookmarklet(origin: string): string {
  const dest = `${origin}/session`;
  const code = `(function(){
var c={};
document.cookie.split(';').forEach(function(p){
  var i=p.indexOf('=');
  if(i<0)return;
  c[p.slice(0,i).trim()]=p.slice(i+1).trim();
});
var sid=c['sessionid'],csrf=c['csrftoken'];
if(!sid||!csrf){alert('Instagram cookies not found.\\nMake sure you are logged in to instagram.com.');return;}
window.open('${dest}?sessionid='+encodeURIComponent(sid)+'&csrftoken='+encodeURIComponent(csrf),'_blank');
})();`;
  return `javascript:${encodeURIComponent(code)}`;
}

export default function SessionManager() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { data: sessionData, isLoading } = useGetSession();
  const setSession = useSetSession();
  const clearSession = useClearSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const autoSubmittedRef = useRef(false);

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionSchema),
    defaultValues: { sessionId: '', csrfToken: '', username: '', userId: '' },
  });

  // Auto-fill + submit when redirected from the bookmarklet
  useEffect(() => {
    if (autoSubmittedRef.current) return;
    const params = new URLSearchParams(search);
    const sid = params.get('sessionid');
    const csrf = params.get('csrftoken');
    if (!sid || !csrf) return;

    autoSubmittedRef.current = true;
    form.setValue('sessionId', sid);
    form.setValue('csrfToken', csrf);

    // Clear params from URL so values aren't visible after submit
    setLocation('/session', { replace: true });

    // Submit immediately
    setSession.mutate({ data: { sessionId: sid, csrfToken: csrf } }, {
      onSuccess: () => {
        toast({ title: '✅ Session injected', description: 'Cookies extracted and applied automatically.' });
        queryClient.invalidateQueries({ queryKey: ['/api/session'] });
        form.reset();
      },
      onError: () => {
        toast({ title: 'Injection Failed', description: 'Could not apply session parameters.', variant: 'destructive' });
      },
    });
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (values: SessionFormValues) => {
    setSession.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: 'Session Established', description: 'Authentication cookies have been injected into the proxy.' });
        queryClient.invalidateQueries({ queryKey: ['/api/session'] });
        form.reset();
      },
      onError: () => {
        toast({ title: 'Injection Failed', description: 'Could not apply session parameters.', variant: 'destructive' });
      },
    });
  };

  const handleClear = () => {
    clearSession.mutate(undefined, {
      onSuccess: () => {
        toast({ title: 'Session Terminated', description: 'All authentication cookies have been wiped.' });
        queryClient.invalidateQueries({ queryKey: ['/api/session'] });
      },
    });
  };

  const isConnected = sessionData?.active;
  const bookmarkletHref = buildBookmarklet(window.location.origin);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-mono font-bold tracking-tight text-white flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary" />
          SESSION_MANAGER
        </h1>
        <p className="text-muted-foreground font-mono text-sm">
          Inject browser cookies directly — use this if username/password login is blocked by Instagram on this server's IP.
        </p>
      </div>

      {/* ── Bookmarklet card ── */}
      <Card className="bg-[#0d1117] border-yellow-500/30">
        <CardHeader className="border-b border-border/50 bg-yellow-500/5 pb-4">
          <CardTitle className="text-sm font-mono flex items-center gap-2 text-yellow-400">
            <Zap className="w-4 h-4" />
            One-Click Cookie Extractor
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          <p className="text-xs text-muted-foreground font-mono leading-relaxed">
            Drag the button below to your browser's bookmarks bar. Then, while logged in to
            instagram.com, click it — cookies will be extracted and applied here automatically.
          </p>

          <div className="flex items-center gap-4 flex-wrap">
            {/* Draggable bookmarklet */}
            <a
              href={bookmarkletHref}
              onClick={e => e.preventDefault()}
              draggable
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-yellow-500/50 bg-yellow-500/10 text-yellow-400 text-sm font-mono font-semibold hover:bg-yellow-500/20 transition-colors cursor-grab active:cursor-grabbing select-none"
            >
              <BookmarkIcon className="w-4 h-4" />
              📸 IG → Session
            </a>
            <span className="text-xs text-muted-foreground font-mono">← drag this to your bookmarks bar</span>
          </div>

          <ol className="list-decimal list-inside text-xs text-muted-foreground font-mono space-y-1 ml-1">
            <li>Drag the button above to your browser's <strong className="text-foreground">bookmarks bar</strong></li>
            <li>Go to <code className="text-yellow-400 bg-black/40 px-1 rounded">instagram.com</code> and make sure you're logged in</li>
            <li>Click <strong className="text-yellow-400">📸 IG → Session</strong> from your bookmarks bar</li>
            <li>This page opens automatically with your session applied ✅</li>
          </ol>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left Column: Status & Form */}
        <div className="space-y-6">
          <Card className="bg-[#0d1117] border-border shadow-md">
            <CardHeader className="border-b border-border/50 bg-black/20 pb-4">
              <CardTitle className="text-sm font-mono flex items-center gap-2 text-foreground">
                <Shield className="w-4 h-4 text-primary" />
                Current State
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 font-mono">
              {isLoading ? (
                <div className="text-sm text-muted-foreground">Checking status...</div>
              ) : isConnected ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-green-500 bg-green-500/10 p-3 rounded border border-green-500/20">
                    <CheckCircle className="w-5 h-5" />
                    <div>
                      <div className="font-bold">AUTHENTICATED</div>
                      <div className="text-xs opacity-80 mt-0.5">Proxy contains valid cookies</div>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center p-2 bg-black/30 rounded border border-border/50">
                      <span className="text-muted-foreground">Target Username</span>
                      <span className="text-white font-bold">{sessionData.username || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-black/30 rounded border border-border/50">
                      <span className="text-muted-foreground">Target UserID</span>
                      <span className="text-white font-bold">{sessionData.userId || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-black/30 rounded border border-border/50">
                      <span className="text-muted-foreground">CSRF Token Present</span>
                      <span className={sessionData.csrfToken ? 'text-green-500' : 'text-destructive'}>
                        {sessionData.csrfToken ? 'YES' : 'NO'}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="destructive"
                    className="w-full font-mono mt-4 flex items-center gap-2"
                    onClick={handleClear}
                    disabled={clearSession.isPending}
                  >
                    <Trash2 className="w-4 h-4" /> TERMINATE SESSION
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-destructive bg-destructive/10 p-3 rounded border border-destructive/20">
                  <AlertTriangle className="w-5 h-5" />
                  <div>
                    <div className="font-bold">UNAUTHENTICATED</div>
                    <div className="text-xs opacity-80 mt-0.5">Use the bookmarklet above or paste cookies below</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#0d1117] border-border shadow-md">
            <CardHeader className="border-b border-border/50 bg-black/20 pb-4">
              <CardTitle className="text-sm font-mono flex items-center gap-2 text-foreground">
                <KeyRound className="w-4 h-4 text-primary" />
                Inject Session Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="sessionId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">sessionid cookie</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="e.g., 12345%3Aabcde%3A12"
                            {...field}
                            className="font-mono text-sm bg-black/30 border-border/50 focus-visible:ring-primary"
                          />
                        </FormControl>
                        <FormMessage className="font-mono text-xs" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="csrfToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">csrftoken cookie</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="e.g., AaBbCcDdEeFfGg"
                            {...field}
                            className="font-mono text-sm bg-black/30 border-border/50 focus-visible:ring-primary"
                          />
                        </FormControl>
                        <FormMessage className="font-mono text-xs" />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Username (opt)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="target_user"
                              {...field}
                              className="font-mono text-sm bg-black/30 border-border/50 focus-visible:ring-primary"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="userId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">User ID (opt)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="123456789"
                              {...field}
                              className="font-mono text-sm bg-black/30 border-border/50 focus-visible:ring-primary"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={setSession.isPending}
                    className="w-full font-mono bg-primary text-black hover:bg-primary/90 mt-2 gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {setSession.isPending ? 'INJECTING...' : 'APPLY CONFIGURATION'}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Reference */}
        <div className="space-y-6">
          <Card className="bg-[#0d1117] border-border shadow-md h-full">
            <CardHeader className="border-b border-border/50 bg-black/20 pb-4">
              <CardTitle className="text-sm font-mono flex items-center gap-2 text-foreground">
                <Fingerprint className="w-4 h-4 text-primary" />
                Security Headers Reference
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 font-mono text-sm space-y-6">

              <div className="space-y-2">
                <h3 className="text-primary font-bold">Manual extraction (fallback)</h3>
                <ol className="list-decimal list-inside text-muted-foreground text-xs space-y-2 ml-1">
                  <li>Log into Instagram on your desktop browser</li>
                  <li>Open Developer Tools (F12)</li>
                  <li>Go to <strong>Application</strong> (Chrome) or <strong>Storage</strong> (Firefox)</li>
                  <li>Expand <strong>Cookies</strong> and select <code className="text-white bg-black/50 px-1 rounded">https://www.instagram.com</code></li>
                  <li>Copy the values for <code className="text-primary">sessionid</code> and <code className="text-primary">csrftoken</code></li>
                </ol>
              </div>

              <div className="space-y-3 pt-4 border-t border-border/50">
                <h3 className="text-white font-bold text-xs uppercase tracking-wider">Required Headers for API</h3>

                <div className="bg-black/30 p-3 rounded border border-border/50">
                  <div className="font-bold text-primary mb-1">X-IG-App-ID</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    Identifies the client application type. The standard web app ID is <code className="text-white">936619743392459</code>. The proxy injects this automatically.
                  </div>
                </div>

                <div className="bg-black/30 p-3 rounded border border-border/50">
                  <div className="font-bold text-primary mb-1">X-ASBD-ID</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    Anti-scraping identifier for the browser environment. Typical value is <code className="text-white">129477</code>. Injected automatically by the proxy.
                  </div>
                </div>

                <div className="bg-black/30 p-3 rounded border border-border/50">
                  <div className="font-bold text-primary mb-1">X-CSRFToken</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    Security token required for all POST/GraphQL mutations. Must match the <code className="text-white">csrftoken</code> cookie value exactly.
                  </div>
                </div>

                <div className="bg-black/30 p-3 rounded border border-border/50">
                  <div className="font-bold text-primary mb-1">X-Instagram-AJAX</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    Version hash of the current web bundle. Signals to the backend that this is an internal web request rather than a public API call.
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
