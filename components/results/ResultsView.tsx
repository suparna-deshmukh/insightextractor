'use client';
import type { StoredRun } from '@/lib/client/types';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './results.module.css';

// Phase 5 replaces this with the full results page. Kept as a frame so the
// run state machine can land here.
export function ResultsView({ run }: { run: StoredRun }) {
  return (
    <div className={styles.frame}>
      <h1 tabIndex={-1}>{run.result.topic}</h1>
      <Skeleton width="70%" height={16} />
      <Skeleton width="100%" height={160} />
    </div>
  );
}
