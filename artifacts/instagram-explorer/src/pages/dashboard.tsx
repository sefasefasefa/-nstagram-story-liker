import React from 'react';
import { useGetSession, useHealthCheck } from '@workspace/api-client-react';
import { Activity, Shield, Link, Database, Code, ShieldAlert, Cpu } from 'lucide-react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function Dashboard() {
  const [_, setLocation] = useLocation();
  const { data: session } = useGetSession();
  const { data: health } = useHealthCheck();

  const isConnected = session?.active;

  const quickActions = [
    { title: 'Profile Analysis', desc: 'Inspect user profile, IDs, and metadata', path: '/profile', icon: UserCircle },
    { title: 'Post Inspector', desc: 'Extract media URLs, comments, and metrics', path: '/post', icon: Image },
    { title: 'GraphQL Builder', desc: 'Execute raw polaris GraphQL queries', path: '/graphql', icon: Database },
    { title: 'Hashtag Engine', desc: 'Traverse hashtag feeds and media', path: '/hashtag', icon: Hash },
    { title: 'Stories Tray', desc: 'View ephemeral content metadata', path: '/stories', icon: History, requiresAuth: true },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-mono font-bold tracking-tight text-white flex items-center gap-3">
          <Terminal className="w-8 h-8 text-primary" />
          SYSTEM_DASHBOARD
        </h1>
        <p className="text-muted-foreground font-mono text-sm">
          Protocol inspection and API reverse engineering environment.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status Panel */}
        <Card className="bg-[#0d1117] border-border shadow-md">
          <CardHeader className="pb-3 border-b border-border/50 bg-black/20">
            <CardTitle className="text-sm font-mono flex items-center gap-2 text-foreground">
              <Activity className="w-4 h-4 text-primary" />
              Environment Status
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 font-mono text-sm">
            <div className="flex justify-between items-center pb-2 border-b border-border/30">
              <span className="text-muted-foreground">API Backend</span>
              <span className="text-green-500 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {health?.status === 'ok' ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-border/30">
              <span className="text-muted-foreground">Session Auth</span>
              <span className={isConnected ? "text-green-500" : "text-destructive"}>
                {isConnected ? 'AUTHENTICATED' : 'UNAUTHENTICATED'}
              </span>
            </div>
            {isConnected && (
              <div className="flex justify-between items-center pb-2 border-b border-border/30">
                <span className="text-muted-foreground">Target User</span>
                <span className="text-primary font-bold">{session?.username || session?.userId || 'UNKNOWN'}</span>
              </div>
            )}
            {!isConnected && (
              <div className="pt-2">
                <button 
                  onClick={() => setLocation('/session')}
                  className="w-full py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded transition-colors"
                >
                  CONFIGURE SESSION
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Protocol Info */}
        <Card className="bg-[#0d1117] border-border shadow-md">
          <CardHeader className="pb-3 border-b border-border/50 bg-black/20">
            <CardTitle className="text-sm font-mono flex items-center gap-2 text-foreground">
              <Cpu className="w-4 h-4 text-primary" />
              Protocol Information
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 font-mono text-xs text-muted-foreground space-y-3">
            <p>
              This environment wraps the Instagram Web API (GraphQL + REST endpoints). 
              Requests are proxy-routed to avoid CORS constraints.
            </p>
            <div className="bg-black/30 p-3 rounded border border-border/50">
              <div className="text-white mb-1 font-semibold">Security Headers Matrix:</div>
              <ul className="space-y-1">
                <li><span className="text-primary">X-IG-App-ID:</span> 936619743392459 (Web)</li>
                <li><span className="text-primary">X-ASBD-ID:</span> 129477 (Telemetry)</li>
                <li><span className="text-primary">X-CSRFToken:</span> Required for mutations</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-mono font-bold text-white border-b border-border/50 pb-2 flex items-center gap-2">
          <Code className="w-5 h-5 text-primary" />
          ENDPOINT_MODULES
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickActions.map((action, i) => (
            <Card 
              key={i}
              className="bg-[#0d1117] border-border/50 hover:border-primary/50 transition-colors cursor-pointer group"
              onClick={() => setLocation(action.path)}
            >
              <CardContent className="p-5 flex flex-col h-full justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded text-primary group-hover:bg-primary group-hover:text-black transition-colors">
                    <action.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-mono font-bold text-foreground text-sm">{action.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{action.desc}</p>
                  </div>
                </div>
                {action.requiresAuth && !isConnected && (
                  <div className="mt-4 text-[10px] text-destructive flex items-center gap-1 font-mono uppercase font-bold">
                    <ShieldAlert className="w-3 h-3" /> Auth Required
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// Inline imports to satisfy the tool
import { Terminal, Hash, Image, History, UserCircle } from 'lucide-react';