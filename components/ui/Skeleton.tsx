import styles from './Skeleton.module.css';

export function Skeleton({ width, height, className }: { width?: number | string; height?: number | string; className?: string }) {
  return <span className={[styles.skeleton, className].filter(Boolean).join(' ')} style={{ width, height }} aria-hidden="true" />;
}
