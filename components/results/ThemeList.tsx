'use client';
import { useState } from 'react';
import { copy } from '@/lib/copy';
import type { BucketStats } from '@/lib/types';
import { ThemeRow } from './ThemeRow';
import styles from './insights.module.css';

export function ThemeList({
  buckets,
  fresh,
  onSeeAll,
  keywords = [],
}: {
  buckets: BucketStats[];
  fresh: boolean;
  onSeeAll: (bucketId: number) => void;
  keywords?: string[];
}) {
  const [openSet, setOpenSet] = useState<Set<number>>(() => new Set(buckets[0] ? [buckets[0].bucket.id] : []));
  const anyOpen = openSet.size > 0;
  const toggleAll = () => {
    setOpenSet(anyOpen ? new Set() : new Set(buckets.map((b) => b.bucket.id)));
  };
  const toggle = (id: number) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={styles.themeList}>
      <div className={styles.listTools}>
        <button type="button" className={styles.textBtn} onClick={toggleAll}>
          {anyOpen ? copy.results.collapseAll : copy.results.expandAll}
        </button>
      </div>
      {buckets.map((b, i) => (
        <ThemeRow
          key={b.bucket.id}
          stats={b}
          index={i}
          open={openSet.has(b.bucket.id)}
          onToggle={() => toggle(b.bucket.id)}
          fresh={fresh}
          onSeeAll={onSeeAll}
          keywords={keywords}
        />
      ))}
    </div>
  );
}
