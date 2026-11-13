'use client';
import { AppShell } from '@/components/shell/AppShell';
import { copy } from '@/lib/copy';

export default function SettingsPage() {
  return (
    <AppShell>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
        <h1 tabIndex={-1}>{copy.settings.title}</h1>
      </div>
    </AppShell>
  );
}
