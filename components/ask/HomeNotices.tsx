'use client';
import { useEffect, useState } from 'react';
import { copy } from '@/lib/copy';
import { useHealth, useUsage } from '@/lib/client/health';
import { formatClock, nextPacificMidnight } from '@/lib/client/time';
import { Notice } from '@/components/ui/Notice';
import styles from './ask.module.css';

const BASIC_KEY = 'ie:basic-dismissed';

export function HomeNotices() {
  const { data: health } = useHealth();
  const usage = useUsage();
  const [offline, setOffline] = useState(false);
  const [basicDismissed, setBasicDismissed] = useState(false);

  useEffect(() => {
    const markOffline = () => setOffline(!navigator.onLine);
    const markOnline = () => setOffline(false);
    markOffline();
    try {
      setBasicDismissed(localStorage.getItem(BASIC_KEY) === '1');
    } catch {
      /* ignore */
    }
    window.addEventListener('offline', markOffline);
    window.addEventListener('online', markOnline);
    return () => {
      window.removeEventListener('offline', markOffline);
      window.removeEventListener('online', markOnline);
    };
  }, []);

  if (offline) {
    return (
      <Notice tone="info" title={copy.notices.offline.title}>
        {copy.notices.offline.body}
      </Notice>
    );
  }
  if (usage?.capacityOut) {
    return (
      <Notice tone="warn" title={copy.notices.capacityOut.title}>
        {copy.notices.capacityOut.body(formatClock(nextPacificMidnight().getTime()))}
      </Notice>
    );
  }
  if (health && !health.gemini && !basicDismissed) {
    return (
      <Notice
        tone="info"
        title={copy.notices.basic.title}
        actions={
          <>
            <a href="/settings#keys" className={styles.noticeAction}>
              {copy.notices.basic.action}
            </a>
            <button
              type="button"
              className={styles.noticeAction}
              onClick={() => {
                try {
                  localStorage.setItem(BASIC_KEY, '1');
                } catch {
                  /* ignore */
                }
                setBasicDismissed(true);
              }}
            >
              {copy.notices.basic.dismiss}
            </button>
          </>
        }
      >
        {copy.notices.basic.body}
      </Notice>
    );
  }
  return null;
}
