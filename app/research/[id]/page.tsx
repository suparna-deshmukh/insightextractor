'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { copy } from '@/lib/copy';
import { useRunner } from '@/lib/client/useRunner';
import { getInflight } from '@/lib/client/inflight';
import { getUid } from '@/lib/client/uid';
import { saveDraft } from '@/lib/client/draft';
import { formFromRequest } from '@/lib/client/form';
import type { RunResult, StoredRun } from '@/lib/client/types';
import { setNavGuard } from '@/lib/client/navguard';
import { RunView } from '@/components/run/RunView';
import { ErrorView } from '@/components/run/ErrorView';
import { ResultsView } from '@/components/results/ResultsView';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { SearchX } from 'lucide-react';
import styles from './page.module.css';

const newToken = () => 'rt_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

async function findSavedId(result: RunResult, startedAt: number): Promise<string | null> {
  try {
    const res = await fetch('/api/runs', { headers: { 'x-insight-extractor-user': getUid() } });
    if (!res.ok) return null;
    const j = (await res.json()) as { runs?: { id: string; topic: string; ts: number }[] };
    const match = (j.runs ?? []).find((r) => r.topic === result.topic && r.ts >= startedAt - 5000);
    return match?.id ?? null;
  } catch {
    return null;
  }
}

function ResearchView({ id }: { id: string }) {
  const router = useRouter();
  const runner = useRunner();
  const toast = useToast();
  const [storedRun, setStoredRun] = useState<StoredRun | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const pendingNav = useRef<string | null>(null);
  const titleRef = useRef('');

  const running = runner.state.phase === 'running';

  // Mount: resume an in-flight run, otherwise fetch the stored one.
  useEffect(() => {
    const inflight = getInflight();
    if (inflight && inflight.token === id) {
      titleRef.current = inflight.request.topic;
      runner.resume(inflight.request, inflight.token, inflight.startedAt);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    fetch(`/api/runs/${id}`, { headers: { 'x-insight-extractor-user': getUid() } })
      .then((r) => {
        if (cancelled) return;
        if (r.status === 404) {
          setNotFound(true);
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((run) => {
        if (cancelled || !run) return;
        setStoredRun(run as StoredRun);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Done transition: find the saved id (the result event does not carry it),
  // flag the fresh moment, then replace the route.
  useEffect(() => {
    if (runner.state.phase !== 'done' || !runner.state.result) return;
    const result = runner.state.result;
    const startedAt = runner.state.startedAt;
    const timer = window.setTimeout(async () => {
      const savedId = await findSavedId(result, startedAt);
      document.title = `${copy.run.tabTitleDone(result.topic)} · ${copy.app.name}`;
      if (savedId && savedId !== id) {
        try {
          sessionStorage.setItem('ie:fresh:' + savedId, '1');
        } catch {
          /* ignore */
        }
        router.replace('/research/' + savedId, { scroll: false });
      } else {
        setStoredRun({
          id,
          ts: Date.now(),
          request: runner.request ?? ({} as StoredRun['request']),
          result,
        });
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [runner.state.phase, runner.state.result, id, router, runner.request]);

  const cancelRun = useCallback(async () => {
    const request = await runner.cancel();
    if (request) saveDraft(formFromRequest(request));
    toast({ message: copy.run.cancelled });
    router.push('/');
  }, [runner, router, toast]);

  const retry = () => {
    const request = runner.request;
    if (!request) return;
    setLoadError(false);
    const token = newToken();
    titleRef.current = request.topic;
    runner.start(request, token);
  };

  const changeSettings = () => {
    if (runner.request) saveDraft(formFromRequest(runner.request));
    router.push('/');
  };

  // Leave guard while running: block in-app navigation and native unload.
  useEffect(() => {
    if (!running) return;
    setNavGuard({ onLeave: (href) => { pendingNav.current = href; setLeaveOpen(true); } });
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      setNavGuard(null);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [running]);

  const content = (() => {
    if (!loaded) {
      return (
      <div className={styles.centered}>
        <h1 className="sr-only" tabIndex={-1}>
          Research
        </h1>
        <Skeleton width="60%" height={28} />
        <Skeleton width="80%" height={16} />
        <Skeleton width="100%" height={200} />
      </div>
    );
  }

    if (notFound) {
      return (
      <EmptyState
        heading="h1"
        icon={<SearchX size={22} aria-hidden="true" />}
        title={copy.notFound.title}
        body={copy.notFound.body}
        action={
          <div className={styles.actions}>
            <Button variant="primary" onClick={() => router.push('/library')}>
              {copy.notFound.primary}
            </Button>
            <Button variant="secondary" onClick={() => router.push('/')}>
              {copy.notFound.secondary}
            </Button>
          </div>
        }
      />
    );
  }

    if (loadError) {
      return (
      <ErrorView
        message={copy.error.generic}
        refunded={false}
        onRetry={() => {
          setLoadError(false);
          setLoaded(false);
          setNotFound(false);
          fetch(`/api/runs/${id}`, { headers: { 'x-insight-extractor-user': getUid() } })
            .then((r) => {
              if (r.status === 404) setNotFound(true);
              else if (!r.ok) throw new Error('http');
              else return r.json();
            })
            .then((run) => {
              if (run) setStoredRun(run as StoredRun);
            })
            .catch(() => setLoadError(true))
            .finally(() => setLoaded(true));
        }}
        onChangeSettings={() => router.push('/')}
      />
    );
  }

    if (runner.state.phase === 'running') {
      return (
      <RunView
        runner={runner}
        title={titleRef.current}
        sheetMode={runner.request?.format === 'raw-data'}
        onCancel={() => void cancelRun()}
      />
    );
  }

    if (runner.state.phase === 'error' && runner.state.error) {
      return (
      <ErrorView
        message={runner.state.error.message}
        refunded={runner.state.error.refunded}
        onRetry={retry}
        onChangeSettings={changeSettings}
      />
    );
  }

    if (storedRun) {
      return <ResultsView run={storedRun} />;
    }
    return (
      <div className={styles.centered}>
        <Skeleton width="60%" height={28} />
        <Skeleton width="100%" height={200} />
      </div>
    );
  })();

  return (
    <>
      {content}
      <LeaveDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        onLeave={() => {
          const href = pendingNav.current ?? '/';
          pendingNav.current = null;
          void cancelRun().then(() => {
            if (href !== '/') router.push(href);
          });
        }}
      />
    </>
  );
}

function LeaveDialog({ open, onOpenChange, onLeave }: { open: boolean; onOpenChange: (o: boolean) => void; onLeave: () => void }) {
  const stayRef = useRef<HTMLButtonElement | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={copy.run.leaveTitle}
      safeActionRef={stayRef}
      actions={
        <>
          <Button ref={stayRef} variant="secondary" onClick={() => onOpenChange(false)}>
            {copy.run.leaveStay}
          </Button>
          <Button variant="danger" onClick={onLeave}>
            {copy.run.leaveStop}
          </Button>
        </>
      }
    >
      {copy.run.leaveBody}
    </Dialog>
  );
}

export default function ResearchPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className={styles.centered}>
            <Skeleton width="100%" height={200} />
          </div>
        }
      >
        <ResearchView id={id} />
      </Suspense>
    </AppShell>
  );
}
