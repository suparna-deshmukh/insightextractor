'use client';
import { AppShell } from '@/components/shell/AppShell';
import { copy } from '@/lib/copy';
import { EmptyState } from '@/components/ui/EmptyState';
import { Info } from 'lucide-react';

export default function SamplePage() {
  return (
    <AppShell>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
        <h1 tabIndex={-1} className="sr-only">Sample report</h1>
        <EmptyState icon={<Info size={22} />} title={copy.sample.banner} />
      </div>
    </AppShell>
  );
}
