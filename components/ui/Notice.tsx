import { Info, TriangleAlert, X } from 'lucide-react';
import styles from './Notice.module.css';

export function Notice({
  tone = 'info',
  title,
  children,
  actions,
  onDismiss,
  className,
}: {
  tone?: 'info' | 'warn';
  title?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const Icon = tone === 'warn' ? TriangleAlert : Info;
  return (
    <div className={[styles.notice, styles[tone], className].filter(Boolean).join(' ')} role={tone === 'warn' ? 'alert' : 'status'}>
      <Icon size={18} className={styles.icon} aria-hidden="true" />
      <div className={styles.body}>
        {title && <p className={styles.title}>{title}</p>}
        {children && <div className={styles.text}>{children}</div>}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {onDismiss && (
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss notice">
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
