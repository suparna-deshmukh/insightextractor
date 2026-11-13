'use client';
import { CheckCircle2, CircleAlert, KeyRound, TriangleAlert } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { copy } from '@/lib/copy';
import type { HealthView } from '@/lib/client/types';
import styles from './settings.module.css';

type RouteStatus = { label: string; tone: BadgeTone; icon: React.ReactNode };

function statusOf(p: { fails: number; successes: number; requiresKey?: string; keySet: boolean }): RouteStatus {
  if (p.requiresKey && !p.keySet)
    return { label: copy.settings.advanced.noKey, tone: 'neutral', icon: <KeyRound size={12} aria-hidden="true" /> };
  if (p.fails >= 2)
    return { label: copy.settings.advanced.down, tone: 'negative', icon: <CircleAlert size={12} aria-hidden="true" /> };
  if (p.fails === 1)
    return { label: copy.settings.advanced.slow, tone: 'warn', icon: <TriangleAlert size={12} aria-hidden="true" /> };
  return { label: copy.settings.advanced.ok, tone: 'positive', icon: <CheckCircle2 size={12} aria-hidden="true" /> };
}

export function SourceStatus({ health }: { health: HealthView }) {
  return (
    <div className={styles.sources}>
      {health.sources.map((s) => (
        <div key={s.id} className={styles.sourceBlock}>
          <p className={styles.sourceName}>
            <SourceIcon id={s.id} size={20} />
            {copy.sources.items[s.id].label}
          </p>
          <ul className={styles.routeList}>
            {s.providers.map((p) => {
              const st = statusOf(p);
              return (
                <li key={p.id}>
                  <span className={styles.routeName}>{p.name}</span>
                  <Badge tone={st.tone} icon={st.icon}>
                    {st.label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
