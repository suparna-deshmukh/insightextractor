'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Disclosure } from '@/components/ui/Disclosure';
import { Notice } from '@/components/ui/Notice';
import { copy } from '@/lib/copy';
import { firstSentenceIfNoisy } from '@/lib/client/insights';
import styles from './results.module.css';
import type { ReportSection } from '@/lib/client/report';
import type { StoredRun } from '@/lib/client/types';

export function Notices({ run, sections }: { run: StoredRun; sections: ReportSection[] }) {
  const [gapsOpen, setGapsOpen] = useState(false);
  const result = run.result;
  const warnings = result.perSource.filter((s) => s.warning);
  const dataNote = sections.find((s) => s.key === 'dataNote');
  const gapLines = warnings.map((s) => `${copy.sources.items[s.source].label}: ${firstSentenceIfNoisy(s.warning ?? '')}`);
  if (gapLines.length === 0 && dataNote?.md) gapLines.push(dataNote.md);

  if (!result.usedLlm && gapLines.length === 0) {
    return (
      <div className={styles.banners}>
        <Notice
          tone="info"
          actions={
            <Link className={styles.linkBtn} href="/settings#keys">
              {copy.results.basicAction}
            </Link>
          }
        >
          {copy.results.basicBadge}
        </Notice>
      </div>
    );
  }

  return (
    <div className={styles.banners}>
      {!result.usedLlm && (
        <Notice
          tone="info"
          actions={
            <Link className={styles.linkBtn} href="/settings#keys">
              {copy.results.basicAction}
            </Link>
          }
        >
          {copy.results.basicBadge}
        </Notice>
      )}
      {gapLines.length > 0 && (
        <Notice tone="warn" title={copy.results.gapsTitle}>
          {copy.results.gapsBody}
          {/* PLAN-NOTE: the plan does not name the disclosure label; reusing the generic details wording. */}
          <Disclosure title={copy.error.showDetails} open={gapsOpen} onOpenChange={setGapsOpen}>
            <ul className={styles.gapList}>
              {gapLines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </Disclosure>
        </Notice>
      )}
    </div>
  );
}
