'use client';
import { AppShell } from '@/components/shell/AppShell';
import { LibraryList } from '@/components/library/LibraryList';

export default function LibraryPage() {
  return (
    <AppShell>
      <LibraryList />
    </AppShell>
  );
}
