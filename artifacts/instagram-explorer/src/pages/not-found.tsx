import React from 'react';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';

export default function NotFound() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0d14]">
      <div className="text-center font-mono space-y-4">
        <h1 className="text-6xl font-bold text-primary">404</h1>
        <p className="text-muted-foreground tracking-widest uppercase">MODULE_NOT_FOUND</p>
      </div>
    </div>
  );
}
