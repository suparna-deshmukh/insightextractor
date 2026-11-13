'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, BookOpen, Settings } from 'lucide-react';
import { guarded } from '@/lib/client/navguard';
import { copy } from '@/lib/copy';
import { useRuns } from '@/lib/client/health';
import { useRunMeta } from '@/lib/client/runmeta';
import { Wordmark } from './logo';
import { UsageMeter } from './UsageMeter';
import styles from './shell.module.css';

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data } = useRuns();
  const runMeta = useRunMeta();
  const runs = (data?.runs ?? []).filter((r) => !runMeta.isRemoved(r.id));
  const recent = runs.slice(0, 6);

  return (
    <nav className={styles.sidebarInner} aria-label="Main">
      <Link href="/" className={styles.logoLink} onClick={(e) => { guarded(e, '/'); onNavigate?.(); }}>
        <Wordmark />
      </Link>
      <Link
        href="/"
        className={[styles.newResearch, styles.newResearchBtn].filter(Boolean).join(' ')}
        onClick={(e) => {
          guarded(e, '/');
          onNavigate?.();
        }}
      >
        <Plus size={18} aria-hidden="true" />
        <span>{copy.nav.newResearch}</span>
      </Link>

      <Link
        href="/library"
        className={[styles.navRow, pathname.startsWith('/library') && styles.navRowActive].filter(Boolean).join(' ')}
        aria-current={pathname.startsWith('/library') ? 'page' : undefined}
        onClick={(e) => {
          guarded(e, '/library');
          onNavigate?.();
        }}
      >
        <BookOpen size={18} aria-hidden="true" />
        <span>{copy.nav.library}</span>
      </Link>

      {recent.length > 0 && (
        <div className={styles.recent}>
          <p className={styles.recentLabel}>{copy.nav.recent}</p>
          <ul className={styles.recentList}>
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/research/${r.id}`}
                  className={[styles.recentItem, pathname === `/research/${r.id}` && styles.navRowActive].filter(Boolean).join(' ')}
                  onClick={(e) => {
                    guarded(e, `/research/${r.id}`);
                    onNavigate?.();
                  }}
                >
                  {runMeta.titleFor(r)}
                </Link>
              </li>
            ))}
          </ul>
          {runs.length > 6 && (
            <Link href="/library" className={styles.seeAll} onClick={(e) => { guarded(e, '/library'); onNavigate?.(); }}>
              {copy.nav.seeAll}
            </Link>
          )}
        </div>
      )}

      <div className={styles.sidebarBottom}>
        <UsageMeter />
        <Link
          href="/settings"
          className={[styles.navRow, pathname.startsWith('/settings') && styles.navRowActive].filter(Boolean).join(' ')}
          aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
          onClick={(e) => {
            guarded(e, '/settings');
            onNavigate?.();
          }}
        >
          <Settings size={18} aria-hidden="true" />
          <span>{copy.nav.settings}</span>
        </Link>
      </div>
    </nav>
  );
}
