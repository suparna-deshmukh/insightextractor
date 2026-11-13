'use client';
import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { copy } from '@/lib/copy';
import { SOURCE_LABELS } from '@/components/ask/sourceLabels';
import { SourceIcon } from '@/components/ui/SourceIcon';
import styles from './run.module.css';

export function SourceRows({
  sources,
  selectedSources,
  fetchActive,
  showDetail,
}: {
  sources: Record<string, { status: 'waiting' | 'done'; count?: number; warning?: string }>;
  selectedSources: string[];
  fetchActive: boolean;
  showDetail: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const rows = selectedSources.filter((id) => sources[id] || fetchActive);
  const total = Object.values(sources).reduce((n, s) => n + (s.count ?? 0), 0);
  const reportedCount = Object.keys(sources).length;
  const done = !fetchActive && reportedCount > 0;

  if (done && !showDetail && !expanded) {
    const nSources = selectedSources.filter((id) => sources[id]).length;
    return (
      <button type="button" className={styles.summaryLine} onClick={() => setExpanded(true)}>
        {nSources > 0 ? copy.run.sourceSummary(total, nSources) : copy.run.liveTotal(total)}
      </button>
    );
  }

  return (
    <>
      {rows.map((id) => {
        const s = sources[id];
        const status = !s
          ? 'Waiting'
          : s.warning
            ? copy.run.sourceFailed
            : s.status === 'done' && s.count === 0
              ? copy.run.sourceNone
              : s.status === 'done'
                ? copy.run.sourceFound(s.count ?? 0)
                : fetchActive
                  ? copy.run.sourceReading
                  : copy.run.sourceWaiting;
        return (
          <div key={id} className={styles.srcRow}>
            <span className={styles.srcIconSm}>
              <SourceIcon id={id} size={24} />
            </span>
            <span className={styles.srcName}>{SOURCE_LABELS[id as keyof typeof SOURCE_LABELS] ?? id}</span>
            <span className={s?.warning ? styles.srcStatusWarn : styles.srcStatus}>
              {s?.warning && <TriangleAlert size={14} aria-hidden="true" />}
              {status}
            </span>
          </div>
        );
      })}
      {total > 0 && (
        <p className={styles.liveTotal}>{copy.run.liveTotal(total)}</p>
      )}
    </>
  );
}
