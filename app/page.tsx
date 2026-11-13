'use client';
import { Suspense } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { HomeView } from '@/components/ask/AskForm';
import { Skeleton } from '@/components/ui/Skeleton';

function HomeFallback() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
      <Skeleton width="60%" height={40} />
      <Skeleton width="80%" height={16} />
      <div style={{ display: 'grid', gap: 12, marginTop: 32 }}>
        <Skeleton width="100%" height={220} />
        <Skeleton width="100%" height={120} />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={<HomeFallback />}>
        <HomeView />
      </Suspense>
    </AppShell>
  );
}
