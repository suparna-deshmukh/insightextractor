'use client';
import { useEffect, useRef, useState } from 'react';
import { copy } from '@/lib/copy';
import { useNow } from '@/lib/client/time';
import type { useRunner } from '@/lib/client/useRunner';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Dialog } from '@/components/ui/Dialog';
import { StepList } from './StepList';
import { TechnicalLog } from './TechnicalLog';
import styles from './run.module.css';

type Runner = ReturnType<typeof useRunner>;

function elapsedMss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function RunView({
  runner,
  title,
  sheetMode,
  onCancel,
}: {
  runner: Runner;
  title: string;
  sheetMode: boolean;
  onCancel: () => void;
}) {
  const { state } = runner;
  const now = useNow(1000);
  const [cancelOpen, setCancelOpen] = useState(false);
  const keepGoingRef = useRef<HTMLButtonElement | null>(null);

  // Document title while running.
  useEffect(() => {
    if (state.phase === 'running') {
      const n = Math.min(state.stageIndex + 1, state.stageTotal);
      document.title = `${copy.run.tabTitleRunning(n, state.stageTotal)} · ${copy.app.name}`;
    }
  }, [state.phase, state.stageIndex, state.stageTotal]);

  const notice =
    state.notice === 'slow' ? copy.run.noticeSlow : state.notice === 'retry' ? copy.run.noticeRetry : state.notice === 'reconnect' ? copy.run.noticeReconnect : null;
  const selected = runner.request?.platforms ?? [];

  return (
    <div className={styles.wrap}>
      <h1 tabIndex={-1} className={styles.title}>
        {copy.run.title(title)}
      </h1>
      <p className={styles.sub}>
        {copy.run.sub(runner.request?.mode === 'deep' ? copy.run.rangeDeep : copy.run.rangeQuick)}
      </p>

      <div className={styles.progressRow} aria-live="off">
        <ProgressBar value={Math.min(state.stageIndex, state.stageTotal)} max={state.stageTotal} label={copy.run.stepOf(Math.min(state.stageIndex + 1, state.stageTotal), state.stageTotal)} />
        <span className={styles.stepLabel}>{copy.run.stepOf(Math.min(state.stageIndex + 1, state.stageTotal), state.stageTotal)}</span>
        <span className={styles.elapsed}>{copy.run.elapsed(elapsedMss(now - state.startedAt))}</span>
      </div>

      <StepList
        stageIndex={state.stageIndex}
        total={state.stageTotal}
        failed={state.phase === 'error'}
        sheetMode={sheetMode}
        sources={state.sources}
        selectedSources={selected}
        showSourceDetail={state.phase !== 'running'}
      />

      {notice && (
        <p className={styles.noticeLine} aria-live="polite">
          {notice}
        </p>
      )}

      <div className={styles.footerRow}>
        <Button variant="secondary" size="sm" onClick={() => setCancelOpen(true)}>
          {copy.run.cancel}
        </Button>
        <TechnicalLog log={state.log} />
      </div>

      <Dialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={copy.run.cancelTitle}
        safeActionRef={keepGoingRef}
        actions={
          <>
            <Button ref={keepGoingRef} variant="secondary" onClick={() => setCancelOpen(false)}>
              {copy.run.cancelKeep}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setCancelOpen(false);
                onCancel();
              }}
            >
              {copy.run.cancelConfirm}
            </Button>
          </>
        }
      >
        {copy.run.cancelBody}
      </Dialog>
    </div>
  );
}

// Local import to keep the component file small.
