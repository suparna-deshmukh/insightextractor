import { copy } from '@/lib/copy';
import styles from './shell.module.css';

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={styles.mark}>
      <rect width="32" height="32" rx="8" className={styles.logoTile} />
      <circle cx="16" cy="9.5" r="2.3" className={styles.logoGlyph} />
      <rect x="14.2" y="13.5" width="3.6" height="11" rx="1.2" className={styles.logoGlyph} />
    </svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className={styles.logoRow}>
      <LogoMark size={size} />
      <span className={styles.wordmark}>{copy.app.name}</span>
    </span>
  );
}
