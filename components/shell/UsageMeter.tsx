'use client';
import Link from 'next/link';
import { useHealth, useUsage } from '@/lib/client/health';
import { formatClock } from '@/lib/client/time';
import { copy } from '@/lib/copy';
import { Meter } from '@/components/ui/Meter';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip } from '@/components/ui/Tooltip';
import styles from './shell.module.css';

export function UsageMeter() {
  const { data, error } = useHealth();
  const usage = useUsage();
  if (!data || error) return null;
  if (!usage) return <Skeleton width={120} height={20} />;
  const showNext = usage.runsLeft === 0 || usage.runsTotal - usage.runsLeft >= 1;
  const meter = (
    <span className={styles.usageBlock}>
      <Meter total={usage.runsTotal} left={usage.runsLeft} />
      <span className={styles.usageText}>{copy.nav.researchesLeft(usage.runsLeft, usage.runsTotal)}</span>
    </span>
  );
  return (
    <Link href="/settings#usage" className={styles.usageLink}>
      {showNext && usage.resetsAt > 0 ? (
        <Tooltip label={copy.nav.nextOpens(formatClock(usage.resetsAt))}>{meter}</Tooltip>
      ) : (
        meter
      )}
    </Link>
  );
}
