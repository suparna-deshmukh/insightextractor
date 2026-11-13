'use client';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { Skeleton } from '@/components/ui/Skeleton';

export default function ResearchPage() {
  useParams();
  return (
    <AppShell>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 24, display: 'grid', gap: 12 }}>
        <h1 tabIndex={-1} className="sr-only">Research</h1>
        <Skeleton width="100%" height={28} />
        <Skeleton width="80%" height={16} />
        <Skeleton width="100%" height={120} />
      </div>
    </AppShell>
  );
}
