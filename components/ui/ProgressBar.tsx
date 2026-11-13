import styles from './ProgressBar.module.css';

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={styles.track} role="progressbar" aria-valuemin={0} aria-valuenow={value} aria-valuemax={max} aria-label={label}>
      <div className={styles.fill} style={{ width: `${pct}%` }} />
    </div>
  );
}
