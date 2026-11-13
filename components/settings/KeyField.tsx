'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';
import useSWR from 'swr';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { copy } from '@/lib/copy';
import { revalidateAfterRun } from '@/lib/client/health';
import { getUid } from '@/lib/client/uid';
import styles from './settings.module.css';

export function KeyField({
  envName,
  label,
  body,
  masked,
}: {
  envName: string;
  label: string;
  body: string;
  masked?: string;
}) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const timer = useRef<number | null>(null);
  const { mutate } = useSWR('/api/settings', (url: string) => fetchSettings(url), {
    revalidateIfStale: false,
    shouldRetryOnError: false,
  });

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const save = async () => {
    const v = value.trim();
    if (!v) return;
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-insight-extractor-user': getUid() },
        body: JSON.stringify({ [envName]: v }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) {
        setError(j.error ?? copy.settings.key.failed);
        return;
      }
      setValue('');
      setJustSaved(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setJustSaved(false), 3000);
      toast({ message: copy.settings.key.justSaved });
      void mutate();
      revalidateAfterRun();
    } catch {
      setError(copy.settings.key.failed);
    }
  };

  return (
    <div className={styles.keyRow}>
      <p className={styles.keyLabel}>{label}</p>
      <p className={styles.keyBody}>{body}</p>
      <div className={styles.keyInputRow}>
        <div className={styles.keyInputWrap}>
          <input
            type={visible ? 'text' : 'password'}
            className={styles.keyInput}
            placeholder={copy.settings.key.empty}
            aria-label={label}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
          />
          <IconButton
            label={visible ? copy.settings.key.hide : copy.settings.key.show}
            icon={visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            className={styles.eyeBtn}
            onClick={() => setVisible((v) => !v)}
          />
        </div>
        <Button variant="primary" size="md" disabled={!value.trim()} onClick={() => void save()}>
          {copy.settings.key.save}
        </Button>
      </div>
      {error && (
        <p className={styles.keyError} role="alert">
          {error}
        </p>
      )}
      <p className={styles.keyStatus}>
        {justSaved ? (
          <>
            <Check size={14} aria-hidden="true" /> {copy.settings.key.justSaved}
          </>
        ) : masked ? (
          <>
            {copy.settings.key.saved(masked)} <span className={styles.replaceHint}>{copy.settings.key.replaceHint}</span>
          </>
        ) : (
          copy.settings.key.notSet
        )}
      </p>
    </div>
  );
}

export async function fetchSettings(url: string) {
  const res = await fetch(url, { headers: { 'x-insight-extractor-user': getUid() } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{
    gemini: { set: boolean; model: string };
    producthunt: { set: boolean };
    youtube: { set: boolean };
    keys: { key: string; masked: string }[];
  }>;
}
