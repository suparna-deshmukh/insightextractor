'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { copy } from '@/lib/copy';
import type { SourceId } from '@/lib/client/types';
import { useHealth, revalidateAfterRun } from '@/lib/client/health';
import { recommendSources } from '@/lib/client/signals';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { SOURCE_LABELS } from './sourceLabels';
import styles from './ask.module.css';

const GROUPS: { id: string; label: string; sources: SourceId[] }[] = [
  { id: 'everyday', label: copy.sources.groups.everyday, sources: ['reddit', 'google'] },
  { id: 'tech', label: copy.sources.groups.tech, sources: ['hn', 'github', 'producthunt'] },
  { id: 'reviews', label: copy.sources.groups.reviews, sources: ['appstore', 'play', 'youtube'] },
];

const OPTIONAL_KEY: Partial<Record<SourceId, { label: string; env: string }>> = {
  producthunt: { label: copy.settings.optional.producthunt.label, env: 'PRODUCTHUNT_API_TOKEN' },
  youtube: { label: copy.settings.optional.youtube.label, env: 'YOUTUBE_API_KEY' },
};

export function SourcesPopover({
  selected,
  onChange,
  apps,
  onAppsChange,
  description,
  onClose,
}: {
  selected: SourceId[];
  onChange: (sources: SourceId[]) => void;
  apps: string;
  onAppsChange: (value: string) => void;
  description: string;
  onClose: () => void;
}) {
  const { data: health } = useHealth();
  const toast = useToast();
  const [keyEditing, setKeyEditing] = useState<SourceId | null>(null);
  const [keyValue, setKeyValue] = useState('');
  const [keySaved, setKeySaved] = useState<SourceId | null>(null);
  const [keyError, setKeyError] = useState('');
  const keySavedTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (keySavedTimer.current) window.clearTimeout(keySavedTimer.current);
  }, []);

  const hasKey = (env: string) => Boolean(health?.sources.find((s) => s.providers.some((p) => p.requiresKey === env && p.keySet)));
  const isTroubled = (id: SourceId) => {
    const info = health?.sources.find((s) => s.id === id);
    if (!info || info.keyless === false) return false;
    const failing = info.providers.filter((p) => p.fails >= 2);
    return info.providers.length > 0 && failing.length === info.providers.length;
  };

  const toggle = (id: SourceId) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const saveKey = async (id: SourceId) => {
    const val = keyValue.trim();
    if (!val) return;
    const env = OPTIONAL_KEY[id]?.env;
    if (!env) return;
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [env]: val }),
    });
    const j = await res.json();
    if (j.ok) {
      setKeyError('');
      setKeySaved(id);
      toast({ message: copy.sources.keySaved });
      revalidateAfterRun();
      setKeyEditing(null);
      setKeyValue('');
      if (keySavedTimer.current) window.clearTimeout(keySavedTimer.current);
      keySavedTimer.current = window.setTimeout(() => setKeySaved(null), 2000);
    } else {
      setKeyError(copy.settings.key.failed);
    }
  };

  const showApps = selected.includes('appstore') || selected.includes('play');
  const appCount = apps.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).length;

  return (
    <div className={styles.popPanel}>
      <p className={styles.popTitle}>{copy.sources.title}</p>
      <p className={styles.popSub}>{copy.sources.sub}</p>
      {GROUPS.map((g) => (
        <div key={g.id} className={styles.popGroup}>
          <p className={styles.popGroupLabel}>{g.label}</p>
          <div className={styles.popRows}>
            {g.sources.map((id) => {
              const on = selected.includes(id);
              const opt = OPTIONAL_KEY[id];
              return (
                <button key={id} type="button" className={[styles.srcRow, on && styles.srcRowOn].filter(Boolean).join(' ')} aria-pressed={on} onClick={() => toggle(id)}>
                  <SourceIcon id={id} />
                  <span className={styles.srcText}>
                    <span className={styles.srcTitle}>{SOURCE_LABELS[id]}</span>
                    <span className={styles.srcDesc}>{copy.sources.items[id].desc}</span>
                    {isTroubled(id) && (
                      <span className={styles.srcWarn}>
                        <TriangleAlert size={14} aria-hidden="true" />
                        {copy.sources.troubled}
                      </span>
                    )}
                    {opt && on && !hasKey(opt.env) && keySaved !== id && (
                      <span className={styles.srcKeyNote}>
                        {copy.sources.keyNote}
                        {keyEditing === id ? (
                          <span className={styles.keyRow}>
                            <Input
                              type="password"
                              className={styles.keyInput}
                              value={keyValue}
                              onChange={(e) => {
                                setKeyValue(e.target.value);
                                setKeyError('');
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void saveKey(id);
                                }
                              }}
                              placeholder={copy.sources.keyPlaceholder}
                              aria-label={`${opt.label} ${copy.sources.addKey}`}
                            />
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={!keyValue.trim()}
                              onClick={(e) => {
                                e.stopPropagation();
                                void saveKey(id);
                              }}
                            >
                              {copy.sources.keySave}
                            </Button>
                            {keyError && (
                              <span className={styles.srcWarn} role="alert">
                                {keyError}
                              </span>
                            )}
                          </span>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            className={styles.addKeyBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              setKeyEditing(id);
                            }}
                          >
                            {copy.sources.addKey}
                          </Button>
                        )}
                      </span>
                    )}
                    {opt && on && keySaved === id && (
                      <span className={styles.srcSaved}>{copy.sources.keySaved}</span>
                    )}
                  </span>
                  <span className={styles.srcCheck} aria-hidden="true">
                    {on && <Check size={14} />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {showApps && (
        <div className={styles.popApps}>
          <label className={styles.fieldLabel} htmlFor="ask-apps">
            {copy.sources.appsLabel}
          </label>
          <Input
            id="ask-apps"
            value={apps}
            onChange={(e) => onAppsChange(e.target.value)}
            placeholder={copy.sources.appsPlaceholder}
            invalid={appCount > 6}
          />
          <p className={appCount > 6 ? styles.fieldError : styles.popSub}>{copy.sources.appsHelper}</p>
        </div>
      )}
      <div className={styles.popFooter}>
        <button
          type="button"
          className={styles.textBtn}
          onClick={() => {
            onChange(recommendSources(description));
          }}
        >
          {copy.sources.reset}
        </button>
        <Button variant="secondary" size="sm" onClick={onClose} autoFocus>
          {copy.sources.done}
        </Button>
      </div>
    </div>
  );
}
