'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { copy } from '@/lib/copy';
import { sourceList, timeWords } from '@/lib/client/insights';
import { useRunMeta } from '@/lib/client/runmeta';
import { ExportMenu } from './ExportMenu';
import styles from './results.module.css';
import type { StoredRun } from '@/lib/client/types';

export function ResultHeader({
  run,
  onMethod,
  readOnly = false,
}: {
  run: StoredRun;
  onMethod: () => void;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { titleFor, rename } = useRunMeta();
  const result = run.result;
  const title = titleFor({ id: run.id, topic: result.topic });
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const escRef = useRef(false);

  const start = () => {
    setValue(title);
    setEditing(true);
  };
  const commit = () => {
    if (editing) setEditing(false);
    const v = value.trim();
    if (v && v !== title) {
      rename(run.id, v);
      toast({ message: copy.results.renamed });
    } else if (!v) {
      rename(run.id, '');
    }
  };

  const keptSources = result.perSource.filter((s) => s.kept > 0).map((s) => s.source);
  const meta = copy.results.meta(result.keptRecords, sourceList(keptSources), timeWords(result.timeframe));

  return (
    <header className={styles.header}>
      <div className={styles.titleBlock}>
        <span className={styles.titleRow}>
          {editing ? (
            <input
              className={styles.renameInput}
              value={value}
              placeholder={copy.results.renamePlaceholder}
              aria-label={copy.results.rename}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                else if (e.key === 'Escape') {
                  escRef.current = true;
                  setEditing(false);
                }
              }}
            />
          ) : (
            <h1 className={styles.h1} tabIndex={-1}>
              {title}
            </h1>
          )}
          {!editing && !readOnly && (
            <IconButton
              label={copy.results.rename}
              icon={<Pencil size={15} aria-hidden="true" />}
              className={styles.pencil}
              onClick={start}
            />
          )}
        </span>
        <p className={styles.meta}>
          {meta} <button type="button" className={styles.linkBtn} onClick={onMethod}>{copy.results.howMade}</button>
        </p>
      </div>
      {!readOnly && (
        <div className={styles.actions}>
          <ExportMenu run={run} />
          <Button variant="secondary" size="md" onClick={() => router.push(`/?from=${encodeURIComponent(run.id)}`)}>
            {copy.results.editRun}
          </Button>
        </div>
      )}
    </header>
  );
}
