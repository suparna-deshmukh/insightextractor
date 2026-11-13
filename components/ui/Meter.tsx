import styles from './Meter.module.css';

export function Meter({ total, left }: { total: number; left: number }) {
  const segments = Math.max(0, total);
  return (
    <div
      className={styles.meter}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={left}
      aria-label={`${left} of ${total} left`}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={i < left ? styles.filled : styles.emptySeg} />
      ))}
    </div>
  );
}
