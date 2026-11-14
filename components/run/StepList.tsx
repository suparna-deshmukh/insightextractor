'use client';
import { Check, CircleAlert } from 'lucide-react';
import { copy } from '@/lib/copy';
import { Spinner } from '@/components/ui/Spinner';
import { SourceRows } from './SourceRows';
import styles from './run.module.css';

export type StepStatus = 'done' | 'active' | 'waiting' | 'failed';

export function stepStatuses(stageIndex: number, total: number, failed: boolean): StepStatus[] {
  return Array.from({ length: total }, (_, i) => {
    if (failed && i === Math.min(stageIndex, total - 1)) return 'failed';
    if (i < stageIndex) return 'done';
    if (i === stageIndex) return 'active';
    return 'waiting';
  });
}

export function StepList({
  stageIndex,
  total,
  failed,
  sheetMode,
  sources,
  selectedSources,
  showSourceDetail,
}: {
  stageIndex: number;
  total: number;
  failed: boolean;
  sheetMode: boolean;
  sources: Record<string, { status: 'waiting' | 'done'; count?: number; warning?: string }>;
  selectedSources: string[];
  showSourceDetail: boolean;
}) {
  const statuses = stepStatuses(stageIndex, total, failed);
  const labels = copy.run.steps.map((s, i) => (sheetMode && i === total - 1 ? copy.run.stepsSheet : s));
  const fetchActive = stageIndex >= 1 && stageIndex < 2;

  return (
    <ol className={styles.stepList} aria-live="polite">
      {labels.map((label, i) => {
        const status = statuses[i];
        return (
          <li key={i}>
            <div className={styles.step}>
              <span
                className={[
                  styles.marker,
                  status === 'done' && styles.markerDone,
                  status === 'active' && styles.markerActive,
                  status === 'waiting' && styles.markerWaiting,
                  status === 'failed' && styles.markerFailed,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {status === 'done' && <Check size={14} aria-hidden="true" />}
                {status === 'active' && <Spinner />}
                {status === 'failed' && <CircleAlert size={18} aria-hidden="true" />}
              </span>
              <span className={styles['stepLabel' + status.charAt(0).toUpperCase() + status.slice(1)]} aria-hidden={status !== 'active'}>
                {label}
              </span>
            </div>
            {i === 1 && (fetchActive || Object.keys(sources).length > 0) && (
              <SourceRows
                sources={sources}
                selectedSources={selectedSources}
                fetchActive={fetchActive}
                showDetail={showSourceDetail || fetchActive}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
