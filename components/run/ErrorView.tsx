'use client';
import { useState } from 'react';
import { CircleAlert, Copy } from 'lucide-react';
import { copy } from '@/lib/copy';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Disclosure';
import { useToast } from '@/components/ui/Toast';
import styles from './run.module.css';

function causeOf(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('dropped')) return copy.error.dropped;
  if (m.includes('model')) return copy.error.model;
  return copy.error.generic;
}

export function ErrorView({
  message,
  refunded,
  onRetry,
  onChangeSettings,
}: {
  message: string;
  refunded: boolean;
  onRetry: () => void;
  onChangeSettings: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const toast = useToast();
  return (
    <div className={styles.errorWrap}>
      <span className={styles.errorIcon}>
        <CircleAlert size={24} aria-hidden="true" />
      </span>
      <h1 tabIndex={-1} className={styles.errorTitle}>
        {copy.error.title}
      </h1>
      <p className={styles.errorBody}>{causeOf(message)}</p>
      {refunded && <p className={styles.errorRefunded}>{copy.error.refunded}</p>}
      <div className={styles.errorActions}>
        <Button variant="primary" onClick={onRetry}>
          {copy.error.retry}
        </Button>
        <Button variant="secondary" onClick={onChangeSettings}>
          {copy.error.change}
        </Button>
      </div>
      <Disclosure title={detailsOpen ? copy.error.hideDetails : copy.error.showDetails} open={detailsOpen} onOpenChange={setDetailsOpen}>
        <div className={styles.detailWrap}>
          <div className={styles.detailBlock}>{message}</div>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Copy size={14} aria-hidden="true" />}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(message);
              } catch {
                /* ignore */
              }
              toast({ message: copy.export.copied });
            }}
          >
            {copy.common.copy}
          </Button>
        </div>
      </Disclosure>
    </div>
  );
}
