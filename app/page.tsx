'use client';
import { Suspense } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { HomeView } from '@/components/ask/AskForm';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './page.module.css';

function HomeFallback() {
  return (
    <div className={styles.fallback}>
      <Skeleton width="60%" height={40} />
      <Skeleton width="80%" height={16} />
      <div className={styles.fallbackBlocks}>
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
