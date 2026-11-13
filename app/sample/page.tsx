'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Skeleton } from '@/components/ui/Skeleton';
import { copy } from '@/lib/copy';
import { sampleRun } from '@/lib/sample-run';
import { ResultsView } from '@/components/results/ResultsView';

const run = sampleRun();

export default function SamplePage() {
  return (
    <AppShell>
      <div className="sample-banner">
        <Notice
          tone="info"
          actions={
            <Link href="/">
              <Button variant="primary" size="sm">
                {copy.sample.action}
              </Button>
            </Link>
          }
        >
          {copy.sample.banner}
        </Notice>
      </div>
      <Suspense
        fallback={
          <div className="sample-skeleton">
            <Skeleton width="50%" height={28} />
            <Skeleton width="80%" height={16} />
            <Skeleton width="100%" height={240} />
          </div>
        }
      >
        <ResultsView run={run} readOnly />
      </Suspense>
    </AppShell>
  );
}
