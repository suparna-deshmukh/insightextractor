'use client';
import { useMemo, useState } from 'react';
import { Plus, Search, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { copy } from '@/lib/copy';
import { useRuns } from '@/lib/client/health';
import { useRunMeta } from '@/lib/client/runmeta';
import { LibraryRow } from './LibraryRow';
import styles from './library.module.css';

const DAY = 86_400_000;

function groupOf(ts: number, now: number): string {
  const d = new Date(now);
  const startOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (ts >= startOfToday) return 'today';
  if (ts >= startOfToday - DAY) return 'yesterday';
  if (ts >= startOfToday - 6 * DAY) return 'week';
  if (ts >= startOfToday - 29 * DAY) return 'month';
  return 'older';
}

// PLAN-NOTE: group heading labels are not in the copy deck; shown verbatim per the plan wireframe.
const GROUPS: [string, string][] = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['week', 'Last 7 days'],
  ['month', 'Last 30 days'],
  ['older', 'Older'],
];

export function LibraryList() {
  const router = useRouter();
  const { data, isLoading } = useRuns();
  const meta = useRunMeta();
  const [q, setQ] = useState('');

  const visible = useMemo(() => {
    const all = (data?.runs ?? []).filter((r) => !meta.isRemoved(r.id));
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (r) =>
        meta.titleFor({ id: r.id, topic: r.topic }).toLowerCase().includes(needle) ||
        r.topic.toLowerCase().includes(needle),
    );
  }, [data, q, meta]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, typeof visible>();
    for (const r of visible) {
      const g = groupOf(r.ts, Date.now());
      const list = byGroup.get(g) ?? [];
      list.push(r);
      byGroup.set(g, list);
    }
    return GROUPS.filter(([g]) => byGroup.has(g)).map(([g, label]) => ({
      label,
      runs: (byGroup.get(g) ?? []).sort((a, b) => b.ts - a.ts),
    }));
  }, [visible]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.h1} tabIndex={-1}>
          {copy.library.title}
        </h1>
        <Button variant="primary" size="md" className={styles.newBtn} leftIcon={<Plus size={16} aria-hidden="true" />} onClick={() => router.push('/')}>
          {copy.nav.newResearch}
        </Button>
      </header>
      <div className={styles.searchRow}>
        <Search size={16} aria-hidden="true" className={styles.searchIcon} />
        <input
          type="search"
          className={styles.searchInput}
          placeholder={copy.library.search}
          aria-label={copy.library.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className={styles.skeletonList}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={styles.skRow}>
              <Skeleton width="45%" height={16} />
              <Skeleton width="70%" height={12} />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        q.trim() ? (
          <EmptyState icon={<SearchX size={22} aria-hidden="true" />} title={copy.library.noMatch} />
        ) : (
          <EmptyState
            icon={<Search size={22} aria-hidden="true" />}
            title={copy.library.emptyTitle}
            body={copy.library.emptyBody}
            action={
              <Link href="/">
                <Button variant="primary">{copy.library.emptyAction}</Button>
              </Link>
            }
          />
        )
      ) : (
        <div className={styles.list}>
          {groups.map((g) => (
            <section key={g.label} className={styles.group}>
              <h2 className={styles.groupHeading}>{g.label}</h2>
              {g.runs.map((r) => (
                <LibraryRow key={r.id} run={r} />
              ))}
            </section>
          ))}
        </div>
      )}
      <p className={styles.footnote}>{copy.library.footnote}</p>
    </div>
  );
}
