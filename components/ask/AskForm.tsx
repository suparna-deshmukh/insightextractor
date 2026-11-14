'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Clock, Gauge, Layers } from 'lucide-react';
import { copy } from '@/lib/copy';
import type { StoredRun } from '@/lib/client/types';
import {
  buildRequest,
  changeCount,
  defaultForm,
  formFromRequest,
  validate,
  type FormState,
  type GoalKey,
} from '@/lib/client/form';
import { recommendSources } from '@/lib/client/signals';
import { clearDraft, loadDraft, saveDraft } from '@/lib/client/draft';
import { setInflight } from '@/lib/client/inflight';
import { getUid } from '@/lib/client/uid';
import { useUsage } from '@/lib/client/health';
import { formatClock } from '@/lib/client/time';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { SettingPopover } from '@/components/ui/SettingPopover';
import { Disclosure } from '@/components/ui/Disclosure';
import { Chip } from '@/components/ui/Chip';
import { Notice } from '@/components/ui/Notice';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip } from '@/components/ui/Tooltip';
import { useToast } from '@/components/ui/Toast';
import { GoalPicker } from './GoalPicker';
import { SourcesPopover } from './SourcesPopover';
import { TimePopover } from './TimePopover';
import { DepthPopover } from './DepthPopover';
import { FineTune } from './FineTune';
import { HomeNotices } from './HomeNotices';
import { ExampleList } from './ExampleList';
import { RecentList } from './RecentList';
import { sourceLabels } from './sourceLabels';
import styles from './ask.module.css';

const fmtDay = (d: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(d + 'T00:00:00'));

export function HomeView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from');
  const toast = useToast();
  const usage = useUsage();

  const [form, setForm] = useState<FormState>(defaultForm);
  const [ready, setReady] = useState(false);
  const [editingRun, setEditingRun] = useState<StoredRun | null>(null);
  const [formError, setFormError] = useState<{ field: 'description' | 'sources' | 'dates'; message: string } | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [depthOpen, setDepthOpen] = useState(false);
  const [fineOpen, setFineOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const questionRef = useRef<HTMLTextAreaElement>(null);
  const sourcesTriggerRef = useRef<HTMLButtonElement>(null);

  const patch = useCallback((p: Partial<FormState>) => setForm((f) => ({ ...f, ...p })), []);

  // Restore draft on mount, or prefill from ?from.
  useEffect(() => {
    if (!from) {
      const d = loadDraft();
      if (d) setForm(d);
      setReady(true);
      return;
    }
    let cancelled = false;
    fetch(`/api/runs/${from}`, { headers: { 'x-insight-extractor-user': getUid() } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then((run: StoredRun) => {
        if (cancelled) return;
        setForm(formFromRequest(run.request));
        setEditingRun(run);
      })
      .catch(() => {
        if (!cancelled) toast({ message: copy.home.loadFailed });
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [from, toast]);

  // Draft autosave (debounced).
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => saveDraft(form), 500);
    return () => window.clearTimeout(t);
  }, [form, ready]);

  // Automatic source recommendation while the description changes.
  useEffect(() => {
    if (!ready || form.sourcesTouched) return;
    const t = window.setTimeout(() => {
      setForm((f) => (f.sourcesTouched ? f : { ...f, sources: recommendSources(f.description) }));
    }, 400);
    return () => window.clearTimeout(t);
  }, [form.description, form.sourcesTouched, ready]);

  const setGoal = (goal: GoalKey) => {
    setForm((f) => ({ ...f, goal }));
  };

  const setCompetitors = (value: string) => {
    setForm((f) => {
      const wasEmpty = f.competitors.trim() === '';
      const nowFilled = value.trim() !== '';
      const compare = wasEmpty && nowFilled && !f.compareTouched ? true : f.compare;
      return { ...f, competitors: value, compare };
    });
  };

  const start = useCallback(() => {
    const err = validate(form);
    if (err) {
      setFormError(err);
      if (err.field === 'description') questionRef.current?.focus();
      if (err.field === 'sources') {
        setSourcesOpen(true);
        sourcesTriggerRef.current?.focus();
      }
      if (err.field === 'dates') setTimeOpen(true);
      return;
    }
    setFormError(null);
    setStarting(true);
    const req = buildRequest(form);
    const token = 'rt_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    setInflight({ token, request: req, startedAt: Date.now() });
    clearDraft();
    router.push('/research/' + token);
  }, [form, router]);

  const cancelEditing = () => {
    setForm(defaultForm);
    setEditingRun(null);
    setFormError(null);
    clearDraft();
    router.replace('/', { scroll: false });
  };

  const pickExample = (text: string, goal: GoalKey, competitors?: string) => {
    setForm((f) => ({
      ...f,
      description: text,
      goal,
      competitors: competitors ?? f.competitors,
      sourcesTouched: false,
    }));
    questionRef.current?.focus();
    questionRef.current?.scrollIntoView({ block: 'center' });
  };

  const qLen = form.description.trim().length;
  const limitHit = Boolean(usage && usage.runsTotal > 0 && usage.runsLeft === 0);
  const timeValue =
    form.time.preset === 'custom'
      ? form.time.start && form.time.end
        ? `${fmtDay(form.time.start)} to ${fmtDay(form.time.end)}`
        : copy.time.options.custom
      : copy.time.options[form.time.preset];
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h1 tabIndex={-1} className={styles.title}>
          {copy.home.title}
        </h1>
        <p className={styles.sub}>{copy.home.sub}</p>
      </header>

      {editingRun && (
        <div className={styles.editingSlot}>
          <Notice
            tone="info"
            title={copy.home.editingFrom(editingRun.result.topic)}
            actions={
              <button type="button" className={styles.noticeAction} onClick={cancelEditing}>
                {copy.home.editingCancel}
              </button>
            }
          />
        </div>
      )}

      {!ready && from ? (
        <div className={styles.panel}>
          <div className={styles.panelSection}>
            <Skeleton width="100%" height={140} />
          </div>
          <div className={styles.panelSection}>
            <Skeleton width="60%" height={36} />
          </div>
        </div>
      ) : (
        <section className={styles.panel}>
          <HomeNotices />
          <div className={styles.panelSection}>
            <TextArea
              bare
              ref={questionRef}
              className={styles.questionText}
              aria-label={copy.home.questionLabel}
              placeholder={copy.home.placeholder}
              value={form.description}
              onChange={(e) => {
                patch({ description: e.target.value });
                if (formError?.field === 'description' && e.target.value.trim().length >= 30) setFormError(null);
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  start();
                }
              }}
            />
            {formError?.field === 'description' ? (
              <p className={styles.fieldError} role="alert">
                {formError.message}
              </p>
            ) : qLen >= 30 ? (
              <p className={styles.helperOk}>{copy.home.goodDetail}</p>
            ) : qLen > 0 ? (
              <p className={styles.helperWarn}>{copy.home.moreDetail(30 - qLen)}</p>
            ) : null}
          </div>

          <div className={styles.panelSection}>
            <GoalPicker
              goal={form.goal}
              onGoalChange={setGoal}
              competitors={form.competitors}
              onCompetitorsChange={setCompetitors}
            />
          </div>

          <div className={styles.panelSection}>
            <div className={styles.settingsRow}>
              <SettingPopover
                icon={<Layers size={18} aria-hidden="true" />}
                label={copy.home.sourcesLabel}
                value={sourceLabels(form.sources).length ? copy.sources.summary(sourceLabels(form.sources)) : '—'}
                open={sourcesOpen}
                onOpenChange={setSourcesOpen}
                triggerRef={sourcesTriggerRef}
              >
                <SourcesPopover
                  selected={form.sources}
                  onChange={(sources) => patch({ sources, sourcesTouched: true })}
                  apps={form.apps}
                  onAppsChange={(apps) => patch({ apps })}
                  description={form.description}
                  onClose={() => setSourcesOpen(false)}
                />
              </SettingPopover>
              <SettingPopover
                icon={<Clock size={18} aria-hidden="true" />}
                label={copy.home.timeLabel}
                value={timeValue}
                open={timeOpen}
                onOpenChange={setTimeOpen}
              >
                <TimePopover
                  time={form.time}
                  onApply={(time) => {
                    patch({ time });
                    if (formError?.field === 'dates') setFormError(null);
                  }}
                  onClose={() => setTimeOpen(false)}
                  error={formError?.field === 'dates' ? formError.message : undefined}
                />
              </SettingPopover>
              <SettingPopover
                icon={<Gauge size={18} aria-hidden="true" />}
                label={copy.home.depthLabel}
                value={form.depth === 'deep' ? copy.depth.deep.label : copy.depth.quick.label}
                open={depthOpen}
                onOpenChange={setDepthOpen}
              >
                <DepthPopover depth={form.depth} onApply={(depth) => patch({ depth })} onClose={() => setDepthOpen(false)} />
              </SettingPopover>
            </div>
            {formError?.field === 'sources' ? (
              <p className={styles.fieldError} role="alert">
                {formError.message}
              </p>
            ) : form.sourcesTouched ? (
              <button
                type="button"
                className={styles.textBtn}
                onClick={() => patch({ sources: recommendSources(form.description), sourcesTouched: false })}
              >
                {copy.sources.reset}
              </button>
            ) : (
              <p className={styles.basedOn}>{copy.sources.basedOn}</p>
            )}
          </div>

          <div className={styles.panelSection}>
            <Disclosure
              open={fineOpen}
              onOpenChange={setFineOpen}
              triggerClassName={styles.fineTrigger}
              title={
                <span className={styles.fineTitle}>
                  {copy.fine.title}
                  {changeCount(form) > 0 && <Chip>{copy.fine.changes(changeCount(form))}</Chip>}
                </span>
              }
              sub={copy.fine.sub}
            >
              <FineTune form={form} onChange={patch} showInlineCompetitors={form.goal === 'competitors'} />
            </Disclosure>
          </div>

          <div className={`${styles.panelSection} ${styles.footerRow}`}>
            {limitHit && usage ? (
              <p className={styles.limitLine}>
                <Clock size={14} aria-hidden="true" />
                {copy.home.limitReached(usage.runsTotal, formatClock(usage.resetsAt))}
              </p>
            ) : (
              <p className={styles.estimate}>{form.depth === 'deep' ? copy.home.estimateDeep : copy.home.estimateQuick}</p>
            )}
            <Tooltip label={isMac ? 'Press ⌘+Enter' : 'Press Ctrl+Enter'}>
              <Button variant="primary" size="lg" className={styles.startBtn} loading={starting} disabled={limitHit} onClick={start}>
                {starting ? copy.home.starting : copy.home.start}
              </Button>
            </Tooltip>
          </div>
        </section>
      )}

      <ExampleList onPick={pickExample} />
      <RecentList />
      <p className={styles.sampleLinkRow}>
        <a href="/sample" className={styles.sampleLink}>
          {copy.home.sampleLink}
        </a>
      </p>
    </div>
  );
}
