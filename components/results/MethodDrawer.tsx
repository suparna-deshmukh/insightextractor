'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Disclosure } from '@/components/ui/Disclosure';
import { Drawer } from '@/components/ui/Drawer';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { useToast } from '@/components/ui/Toast';
import { copy } from '@/lib/copy';
import { copyText } from '@/lib/client/exports';
import { firstSentenceIfNoisy } from '@/lib/client/insights';
import { toSentenceCase, type ReportSection } from '@/lib/client/report';
import { Prose } from './Prose';
import styles from './method.module.css';
import type { StoredRun } from '@/lib/client/types';

export function MethodDrawer({
  run,
  open,
  onOpenChange,
  sections,
}: {
  run: StoredRun;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: ReportSection[];
}) {
  const toast = useToast();
  const [sqlOpen, setSqlOpen] = useState(false);
  const result = run.result;
  const plan = result.plan;
  const questions = [...plan.hypotheses, ...plan.lookFor];
  const methodSection = sections.find((s) => s.key === 'method');

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={copy.method.title} width={520}>
      <div className={styles.method}>
        <section>
          <h2 className={styles.heading}>{copy.method.looked}</h2>
          {plan.keywords.length > 0 && (
            <>
              <p className={styles.sub}>{copy.method.keywords}</p>
              <div className={styles.chipRow}>
                {plan.keywords.map((k) => (
                  <Chip key={k}>{k}</Chip>
                ))}
              </div>
            </>
          )}
          {questions.length > 0 && (
            <>
              <p className={styles.sub}>{copy.method.questions}</p>
              <ul className={styles.questions}>
                {questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section>
          <h2 className={styles.heading}>{copy.method.where}</h2>
          <table className={styles.whereTable}>
            <thead>
              <tr>
                <th>{copy.method.whereCols.source}</th>
                <th>{copy.method.whereCols.read}</th>
                <th>{copy.method.whereCols.kept}</th>
                <th>{copy.method.whereCols.note}</th>
              </tr>
            </thead>
            <tbody>
              {result.perSource.map((s) => (
                <tr key={s.source}>
                  <td>
                    <span className={styles.srcCell}>
                      <SourceIcon id={s.source} size={20} />
                      {copy.sources.items[s.source].label}
                    </span>
                  </td>
                  <td className={styles.num}>{s.fetched}</td>
                  <td className={styles.num}>{s.kept}</td>
                  <td>{s.warning ? firstSentenceIfNoisy(s.warning) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className={styles.heading}>{copy.method.cleanedHeading}</h2>
          <p>{copy.method.cleaned(result.totalRecords, result.irrelevantDropped, result.keptRecords)}</p>
        </section>

        <section>
          <h2 className={styles.heading}>{copy.method.ai}</h2>
          <p>{result.usedLlm ? copy.method.aiUsed(result.model) : copy.method.aiBasic}</p>
        </section>

        <section>
          <h2 className={styles.heading}>{copy.method.limits}</h2>
          <p>{copy.method.limitsBody}</p>
        </section>

        {methodSection && methodSection.md && (
          <section>
            <h2 className={styles.heading}>{copy.method.notes}</h2>
            <Prose md={methodSection.md} keywords={plan.keywords} />
          </section>
        )}

        {result.sqlAudit.length > 0 && (
          <section>
            <Disclosure title={copy.method.analysts} open={sqlOpen} onOpenChange={setSqlOpen}>
              <div className={styles.sqlList}>
                {result.sqlAudit.map((s, i) => (
                  <div key={i} className={styles.sqlEntry}>
                    <p className={styles.sqlStage}>
                      {toSentenceCase(s.stage)} · {copy.method.sqlRows(s.rows)}
                    </p>
                    <p className={styles.sqlSummary}>{s.summary}</p>
                    <pre className={styles.sqlBlock}>{s.sql}</pre>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void copyText(s.sql).then(() => toast({ message: copy.method.copySql }));
                      }}
                    >
                      {copy.method.copySql}
                    </Button>
                  </div>
                ))}
              </div>
            </Disclosure>
          </section>
        )}
      </div>
    </Drawer>
  );
}
