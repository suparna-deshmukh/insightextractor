'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as RTabs from '@radix-ui/react-tabs';
import { Database } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { copy } from '@/lib/copy';
import { downloadFile, fileNames, rawCsv } from '@/lib/client/exports';
import { parseReport } from '@/lib/client/report';
import { useRunMeta } from '@/lib/client/runmeta';
import type { StoredRun } from '@/lib/client/types';
import { ExportMenu } from './ExportMenu';
import { MethodDrawer } from './MethodDrawer';
import { Notices } from './Notices';
import { Prose } from './Prose';
import { ResultHeader } from './ResultHeader';
import { ThemeList } from './ThemeList';
import { InsightsTab } from './InsightsTab';
import { EvidenceTab } from './EvidenceTab';
import styles from './results.module.css';

export function ResultsView({ run }: { run: StoredRun }) {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const { titleFor } = useRunMeta();
  const result = run.result;
  const [fresh, setFresh] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('ie:fresh:' + run.id)) {
        setFresh(true);
        sessionStorage.removeItem('ie:fresh:' + run.id);
      }
    } catch {
      /* ignore */
    }
  }, [run.id]);

  useEffect(() => {
    document.title = `${titleFor({ id: run.id, topic: result.topic })} · ${copy.app.name}`;
  }, [run.id, result.topic, titleFor]);

  const sections = useMemo(() => parseReport(result.report), [result.report]);
  // PLAN-NOTE: "empty or only a stub" has no exact server contract; treat a report with
  // no substantive section (over 200 chars of markdown) as a stub.
  const sheetOnly = Boolean(result.rawCsv) && !sections.some((s) => s.md.length > 200);

  const tab: 'insights' | 'evidence' = sp.get('tab') === 'evidence' ? 'evidence' : 'insights';
  const setTab = (t: 'insights' | 'evidence') => {
    const next = new URLSearchParams(sp.toString());
    if (t === 'evidence') next.set('tab', 'evidence');
    else next.delete('tab');
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  };
  const seeAllTheme = (bucketId: number) => {
    const next = new URLSearchParams(sp.toString());
    next.set('tab', 'evidence');
    next.set('theme', String(bucketId));
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  if (sheetOnly) {
    const names = fileNames(result.topic);
    return (
      <div className={styles.page}>
        <div className={styles.main}>
          <ResultHeader run={run} onMethod={() => setMethodOpen(true)} />
          <Notices run={run} sections={sections} />
          <div className={styles.sheet}>
            <h2 className={styles.sheetTitle}>{copy.results.sheetReadyTitle}</h2>
            <p className={styles.sheetBody}>{copy.results.sheetReadyBody}</p>
            <Button
              variant="primary"
              leftIcon={<Database size={16} aria-hidden="true" />}
              className="no-print"
              onClick={() => {
                downloadFile(names.rawCsv, rawCsv(result), 'text/csv');
                toast({ message: copy.export.downloaded(names.rawCsv) });
              }}
            >
              {copy.export.csvRaw}
            </Button>
          </div>
          <h2 className={`${styles.sectionHeading} sheet-heading`}>{copy.results.sections.themes}</h2>
          <ThemeList buckets={result.buckets} fresh={fresh} onSeeAll={seeAllTheme} />
        </div>
        <MethodDrawer run={run} open={methodOpen} onOpenChange={setMethodOpen} sections={sections} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <ResultHeader run={run} onMethod={() => setMethodOpen(true)} />
        <Notices run={run} sections={sections} />
      </div>
      <RTabs.Root value={tab} onValueChange={(v) => setTab(v as 'insights' | 'evidence')}>
        <RTabs.List className={`${styles.tabList} no-print`}>
          <RTabs.Trigger value="insights" className={styles.tab}>
            {copy.results.tabs.insights}
          </RTabs.Trigger>
          <RTabs.Trigger value="evidence" className={styles.tab}>
            {copy.results.tabs.evidence} <span className={styles.tabCount}>{result.labeled.length}</span>
          </RTabs.Trigger>
        </RTabs.List>
        <RTabs.Content value="insights" className={styles.tabContent}>
          <InsightsTab run={run} sections={sections} fresh={fresh} onSeeAll={seeAllTheme} />
        </RTabs.Content>
        <RTabs.Content value="evidence" className={styles.tabContent}>
          <EvidenceTab run={run} />
        </RTabs.Content>
      </RTabs.Root>
      <MethodDrawer run={run} open={methodOpen} onOpenChange={setMethodOpen} sections={sections} />
    </div>
  );
}
