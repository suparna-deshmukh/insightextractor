'use client';
import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import Link from 'next/link';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Disclosure';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { useToast } from '@/components/ui/Toast';
import { copy } from '@/lib/copy';
import { useHealth } from '@/lib/client/health';
import { clearDraft } from '@/lib/client/draft';
import { getUid } from '@/lib/client/uid';
import { useTheme, type ThemeMode } from '@/components/shell/ThemeProvider';
import { KeyField, fetchSettings } from '@/components/settings/KeyField';
import { SourceStatus } from '@/components/settings/SourceStatus';
import { UsageBlock } from '@/components/settings/UsageBlock';
import styles from '@/components/settings/settings.module.css';


const NAME_RE = /^[A-Z][A-Z0-9_]{2,63}$/;

function OtherKeys() {
  const toast = useToast();
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!NAME_RE.test(name)) {
      setError(copy.settings.key.badName);
      return;
    }
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-insight-extractor-user': getUid() },
        body: JSON.stringify({ [name]: value.trim() }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) {
        setError(j.error ?? copy.settings.key.failed);
        return;
      }
      setName('');
      setValue('');
      toast({ message: copy.settings.key.justSaved });
      void mutate('/api/settings');
    } catch {
      setError(copy.settings.key.failed);
    }
  };

  return (
    <div className={styles.otherKeys}>
      <p className={styles.sectionBody}>{copy.settings.advanced.otherKeysBody}</p>
      <div className={styles.otherKeysRow}>
        <input
          className={styles.otherName}
          placeholder={copy.settings.advanced.keyName}
          aria-label={copy.settings.advanced.keyName}
          value={name}
          onChange={(e) => {
            setName(e.target.value.toUpperCase());
            setError(null);
          }}
        />
        <input
          className={styles.otherValue}
          type="password"
          placeholder={copy.settings.advanced.keyValue}
          aria-label={copy.settings.advanced.keyValue}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
        <Button variant="primary" size="md" disabled={!value.trim()} onClick={() => void save()}>
          {copy.settings.key.save}
        </Button>
      </div>
      {error && (
        <p className={styles.keyError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const toast = useToast();
  const { data: settings } = useSWR('/api/settings', fetchSettings, { shouldRetryOnError: false });
  const { data: health } = useHealth();
  const { mode, setMode } = useTheme();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const masked = (env: string) => settings?.keys.find((k) => k.key === env)?.masked;

  return (
    <AppShell>
      <div className={styles.page}>
        <h1 className={styles.h1} tabIndex={-1}>
          {copy.settings.title}
        </h1>

        <section id="keys" className={`${styles.section} ${styles.sectionFirst}`}>
          <h2>{copy.settings.ai.title}</h2>
          <p className={styles.sectionBody}>
            {copy.settings.ai.body}{' '}
            <a className={styles.link} href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
              {copy.settings.ai.getKey}
            </a>
          </p>
          <KeyField envName="GEMINI_API_KEY" label={copy.settings.ai.keyLabel} body={copy.settings.ai.body} masked={masked('GEMINI_API_KEY')} />
          <Disclosure title={copy.settings.ai.backupTitle} open={backupOpen} onOpenChange={setBackupOpen}>
            <p className={styles.sectionBody}>{copy.settings.ai.backupBody}</p>
            <KeyField envName="GEMINI_API_KEY_2" label={copy.settings.ai.backup2} body={copy.settings.ai.backupBody} masked={masked('GEMINI_API_KEY_2')} />
            <KeyField envName="GEMINI_API_KEY_3" label={copy.settings.ai.backup3} body={copy.settings.ai.backupBody} masked={masked('GEMINI_API_KEY_3')} />
          </Disclosure>
        </section>

        <section className={styles.section}>
          <h2>{copy.settings.optional.title}</h2>
          <KeyField envName="PRODUCTHUNT_API_TOKEN" label={copy.settings.optional.producthunt.label} body={copy.settings.optional.producthunt.body} masked={masked('PRODUCTHUNT_API_TOKEN')} />
          <KeyField envName="YOUTUBE_API_KEY" label={copy.settings.optional.youtube.label} body={copy.settings.optional.youtube.body} masked={masked('YOUTUBE_API_KEY')} />
        </section>

        <section id="usage" className={styles.section}>
          <h2>{copy.settings.usage.title}</h2>
          <UsageBlock health={health ?? null} />
        </section>

        <section className={styles.section}>
          <h2>{copy.settings.appearance.title}</h2>
          <ToggleGroup<ThemeMode>
            ariaLabel={copy.settings.appearance.title}
            options={[
              { value: 'system', label: copy.settings.appearance.system },
              { value: 'light', label: copy.settings.appearance.light },
              { value: 'dark', label: copy.settings.appearance.dark },
            ]}
            value={mode}
            onValueChange={(v) => setMode(v as ThemeMode)}
          />
        </section>

        <section className={styles.section}>
          <h2>{copy.settings.data.title}</h2>
          <p className={styles.sectionBody}>{copy.settings.data.body}</p>
          <Button
            variant="secondary"
            onClick={() => {
              clearDraft();
              toast({ message: copy.settings.data.draftCleared });
            }}
          >
            {copy.settings.data.clearDrafts}
          </Button>
        </section>

        <section className={styles.section}>
          <Disclosure title={copy.settings.advanced.title} open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <h3 className={styles.subHeading}>{copy.settings.advanced.sourceStatus}</h3>
            <p className={styles.sectionBody}>{copy.settings.advanced.sourceStatusBody}</p>
            {health && <SourceStatus health={health} />}
            <h3 className={styles.subHeading}>{copy.settings.advanced.otherKeys}</h3>
            <OtherKeys />
          </Disclosure>
        </section>
      </div>
    </AppShell>
  );
}
