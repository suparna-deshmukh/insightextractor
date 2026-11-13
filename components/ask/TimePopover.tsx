'use client';
import { useState } from 'react';
import { copy } from '@/lib/copy';
import type { TimePreset } from '@/lib/client/form';
import { OptionList } from '@/components/ui/OptionList';
import styles from './ask.module.css';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

const OPTION_KEYS: TimePreset[] = ['7d', '30d', '90d', '1y', 'all', 'custom'];
const todayStr = () => new Date().toISOString().slice(0, 10);

export function TimePopover({
  time,
  onApply,
  onClose,
  error,
}: {
  time: { preset: TimePreset; start?: string; end?: string };
  onApply: (time: { preset: TimePreset; start?: string; end?: string }) => void;
  onClose: () => void;
  error?: string;
}) {
  const [draft, setDraft] = useState({ start: time.start ?? '', end: time.end ?? '' });

  const applyCustom = () => {
    onApply({ preset: 'custom', start: draft.start, end: draft.end });
    onClose();
  };

  return (
    <div className={styles.popPanel}>
      <p className={styles.popTitle}>{copy.time.title}</p>
      <OptionList
        ariaLabel={copy.time.title}
        value={time.preset}
        onValueChange={(v) => {
          if (v === 'custom') {
            setDraft({ start: time.start ?? '', end: time.end ?? '' });
          } else {
            onApply({ preset: v });
            onClose();
          }
        }}
        options={OPTION_KEYS.map((k) => ({ value: k, label: copy.time.options[k] }))}
      />
      {time.preset === 'custom' && (
        <div className={styles.dateRow}>
          <label className={styles.dateLabel} htmlFor="tf-from">
            {copy.time.from}
          </label>
          <Input id="tf-from" type="date" value={draft.start} max={todayStr()} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))} />
          <label className={styles.dateLabel} htmlFor="tf-to">
            {copy.time.to}
          </label>
          <Input id="tf-to" type="date" value={draft.end} max={todayStr()} onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} />
          {error && (
            <p className={styles.fieldError} role="alert">
              {error}
            </p>
          )}
          <Button variant="secondary" size="sm" onClick={applyCustom}>
            {copy.time.apply}
          </Button>
        </div>
      )}
    </div>
  );
}
