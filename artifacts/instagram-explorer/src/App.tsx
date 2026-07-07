import React from 'react';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { AppLayout } from '@/components/layout/app-layout';

// Pages
import Login from '@/pages/login';
import HomeFeed from '@/pages/home';
import ProfileExplorer from '@/pages/profile';
import PostInspector from '@/pages/post';
import GraphQLBuilder from '@/pages/graphql';
import HashtagExplorer from '@/pages/hashtag';
import StoriesViewer from '@/pages/stories-viewer';
import SessionManager from '@/pages/session';

const queryClient = new QueryClient();

import { AuthGuard } from '@/components/auth-guard';

function Router() {
  return (
    <AppLayout>
      <AuthGuard>
        <Switch>
          <Route path="/login" component={Login} />
          <Route path="/" component={HomeFeed} />
          <Route path="/profile" component={ProfileExplorer} />
          <Route path="/post" component={PostInspector} />
          <Route path="/graphql" component={GraphQLBuilder} />
          <Route path="/hashtag" component={HashtagExplorer} />
          <Route path="/stories" component={StoriesViewer} />
          <Route path="/session" component={SessionManager} />
          <Route component={NotFound} />
        </Switch>
      </AuthGuard>
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
