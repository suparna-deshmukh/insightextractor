'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ellipsis } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { IconButton } from '@/components/ui/IconButton';
import { Menu, MenuItem } from '@/components/ui/Menu';
import { useToast } from '@/components/ui/Toast';
import { copy } from '@/lib/copy';
import { timeAgo } from '@/lib/client/time';
import { useRunMeta } from '@/lib/client/runmeta';
import { FORMAT_TO_STYLE } from '@/lib/client/form';
import type { RunSummary } from '@/lib/client/types';
import styles from './library.module.css';

function sentence(run: RunSummary): string {
  const mode = copy.depth[run.mode === 'deep' ? 'deep' : 'quick'].label;
  const style = copy.fine.style[FORMAT_TO_STYLE[run.format]].label;
  const labels = run.platforms.map((p) => copy.sources.items[p].label);
  const from =
    labels.length <= 3
      ? `from ${copy.sources.summary(labels)}`
      : `from ${labels.length} sources`;
  return `${mode} with a ${style} ${from}.`;
}

export function LibraryRow({ run }: { run: RunSummary }) {
  const router = useRouter();
  const toast = useToast();
  const { titleFor, rename, remove, restore } = useRunMeta();
  const title = titleFor({ id: run.id, topic: run.topic });
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const escRef = useRef(false);

  const startRename = () => {
    setValue(title);
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const v = value.trim();
    if (v && v !== title) rename(run.id, v);
    else if (!v) rename(run.id, '');
  };

  const doRemove = () => {
    setConfirmOpen(false);
    remove(run.id);
    toast({
      message: copy.library.removed,
      action: { label: copy.library.undo, onClick: () => restore(run.id) },
    });
  };

  return (
    <div className={styles.row}>
      <Link className={styles.stretch} href={`/research/${run.id}`} aria-label={`${title} — ${copy.library.open}`} />
      <div className={styles.rowMain}>
        {editing ? (
          <input
            className={styles.renameInput}
            value={value}
            aria-label={copy.library.rename}
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
          <span className={styles.title}>{title}</span>
        )}
        <p className={styles.sub}>{sentence(run)}</p>
      </div>
      <span className={styles.rowMeta}>{copy.library.row(run.keptRecords, timeAgo(run.ts))}</span>
      <span className={styles.menuWrap}>
        <Menu
          align="end"
          trigger={
            <IconButton label={`${copy.library.open}, ${copy.library.rename}, ${copy.library.remove}`} icon={<Ellipsis size={16} aria-hidden="true" />} />
          }
        >
          <MenuItem onSelect={() => router.push(`/research/${run.id}`)}>{copy.library.open}</MenuItem>
          <MenuItem onSelect={startRename}>{copy.library.rename}</MenuItem>
          <MenuItem destructive onSelect={() => setConfirmOpen(true)}>
            {copy.library.remove}
          </MenuItem>
        </Menu>
      </span>
      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={copy.library.removeTitle}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              {copy.common.cancel}
            </Button>
            <Button variant="danger" onClick={doRemove}>
              {copy.library.removeConfirm}
            </Button>
          </>
        }
      >
        {copy.library.removeBody}
      </Dialog>
    </div>
  );
}
