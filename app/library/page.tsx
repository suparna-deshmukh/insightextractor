'use client';
import { AppShell } from '@/components/shell/AppShell';
import { copy } from '@/lib/copy';

export default function LibraryPage() {
  return (
    <AppShell>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 24 }}>
        <h1 tabIndex={-1}>{copy.library.title}</h1>
      </div>
    </AppShell>
  );
}
