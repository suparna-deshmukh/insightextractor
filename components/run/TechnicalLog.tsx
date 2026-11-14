'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Copy } from 'lucide-react';
import { copy } from '@/lib/copy';
import { formatClock } from '@/lib/client/time';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import styles from './run.module.css';

export function TechnicalLog({ log }: { log: Array<{ t: number; tone: string; text: string }> }) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [log, open]);

  const copyLog = async () => {
    const text = log.map((l) => `${formatClock(l.t)}  ${l.text}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    toast({ message: copy.run.logCopied });
  };

  return (
    <div>
      <button
        type="button"
        className={`${styles.summaryLine} ${styles.logToggle}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight size={16} className={open ? styles.chevOpen : styles.chev} aria-hidden="true" />
        {open ? copy.run.hideLog : copy.run.showLog}
      </button>
      {open && (
        <div className={styles.logPanel} ref={scrollRef}>
          <div className={styles.logHead}>
            <Button variant="ghost" size="sm" leftIcon={<Copy size={14} aria-hidden="true" />} onClick={() => void copyLog()}>
              {copy.run.copyLog}
            </Button>
          </div>
          {log.map((l, i) => (
            <p key={i} className={`${styles.logLine} ${l.tone === 'ok' ? styles.logOk : l.tone === 'warn' ? styles.logWarn : l.tone === 'error' ? styles.logError : l.tone === 'stage' ? styles.logStage : ''}`}>
              <span className={styles.logTime}>{formatClock(l.t)}</span>
              <span className={styles.logText}>{l.text}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
