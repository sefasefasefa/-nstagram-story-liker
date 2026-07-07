import React from 'react';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { AppLayout } from '@/components/layout/app-layout';

// Pages
import Dashboard from '@/pages/dashboard';
import ProfileExplorer from '@/pages/profile';
import PostInspector from '@/pages/post';
import GraphQLBuilder from '@/pages/graphql';
import HashtagExplorer from '@/pages/hashtag';
import StoriesTray from '@/pages/stories';
import SessionManager from '@/pages/session';

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/profile" component={ProfileExplorer} />
        <Route path="/post" component={PostInspector} />
        <Route path="/graphql" component={GraphQLBuilder} />
        <Route path="/hashtag" component={HashtagExplorer} />
        <Route path="/stories" component={StoriesTray} />
        <Route path="/session" component={SessionManager} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
