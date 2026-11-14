import styles from './EmptyState.module.css';

export function EmptyState({
  icon,
  title,
  body,
  action,
  heading,
}: {
  icon: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  heading?: 'h1' | 'h2';
}) {
  const Title = heading ?? ('p' as const);
  return (
    <div className={styles.empty}>
      <div className={styles.circle}>{icon}</div>
      <Title className={styles.title}>{title}</Title>
      {body && <p className={styles.body}>{body}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
