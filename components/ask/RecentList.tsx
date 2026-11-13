'use client';
import Link from 'next/link';
import { copy } from '@/lib/copy';
import { useRuns } from '@/lib/client/health';
import { useRunMeta } from '@/lib/client/runmeta';
import { timeAgo } from '@/lib/client/time';
import styles from './ask.module.css';

export function RecentList() {
  const { data } = useRuns();
  const runMeta = useRunMeta();
  const recent = (data?.runs ?? []).filter((r) => !runMeta.isRemoved(r.id)).slice(0, 3);
  if (recent.length === 0) return null;
  return (
    <section className={styles.recent}>
      <h2 className={styles.examplesTitle}>{copy.home.recentTitle}</h2>
      <ul className={styles.recentRows}>
        {recent.map((r) => (
          <li key={r.id}>
            <Link href={`/research/${r.id}`} className={styles.recentRow}>
              <span className={styles.recentTitle}>{runMeta.titleFor(r)}</span>
              <span className={styles.recentMeta}>{copy.library.row(r.keptRecords, timeAgo(r.ts))}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
