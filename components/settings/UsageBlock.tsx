'use client';
import { useState } from 'react';
import { Disclosure } from '@/components/ui/Disclosure';
import { Meter } from '@/components/ui/Meter';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { copy } from '@/lib/copy';
import { useUsage } from '@/lib/client/health';
import { countdown, formatClock, nextPacificMidnight, useNow } from '@/lib/client/time';
import type { HealthView } from '@/lib/client/types';
import styles from './settings.module.css';

export function UsageBlock({ health }: { health: HealthView | null }) {
  const usage = useUsage();
  const [keysOpen, setKeysOpen] = useState(false);
  const now = useNow(30_000);
  if (!usage || !health) return null;

  const used = usage.runsTotal - usage.runsLeft;
  const keys = health.usage?.keys ?? [];

  return (
    <div className={styles.usage}>
      <div className={styles.usageBlock}>
        <Meter total={usage.runsTotal} left={usage.runsLeft} />
        <p className={styles.usageLine}>
          {copy.settings.usage.researches(usage.runsLeft, usage.runsTotal)}
        </p>
        {used >= 1 ? (
          <p className={styles.usageSub}>{copy.settings.usage.nextOpens(formatClock(usage.resetsAt), countdown(usage.resetsAt - now))}</p>
        ) : (
          <p className={styles.usageSub}>{copy.settings.usage.allAvailable}</p>
        )}
      </div>
      <div className={styles.usageBlock}>
        <ProgressBar
          value={usage.capacityUsed}
          max={Math.max(usage.capacityTotal, 1)}
          label={copy.settings.usage.capacity}
        />
        <p className={styles.usageLine}>{copy.settings.usage.capacityLine(usage.capacityUsed, usage.capacityTotal)}</p>
        <p className={styles.usageSub}>
          {copy.settings.usage.capacityNote(formatClock(nextPacificMidnight().getTime()))}
        </p>
        {keys.length > 0 && (
          <Disclosure title={copy.settings.usage.perKey} open={keysOpen} onOpenChange={setKeysOpen}>
            <table className={styles.perKeyTable}>
              <thead>
                <tr>
                  <th>{copy.settings.usage.cols.key}</th>
                  <th>{copy.settings.usage.cols.used}</th>
                  <th>{copy.settings.usage.cols.left}</th>
                  <th>{copy.settings.usage.cols.status}</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k, i) => (
                  <tr key={k.name}>
                    <td>{copy.settings.usage.keyName(i + 1)}</td>
                    <td className={styles.num}>{k.used}</td>
                    <td className={styles.num}>{k.remaining}</td>
                    <td>
                      {k.exhausted
                        ? copy.settings.usage.statusExhausted
                        : k.cooldownUntil
                          ? copy.settings.usage.statusRetry(Math.max(1, Math.ceil((k.cooldownUntil - now) / 60_000)))
                          : copy.settings.usage.statusLive}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Disclosure>
        )}
      </div>
    </div>
  );
}
