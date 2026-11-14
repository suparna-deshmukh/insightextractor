import { Tooltip } from './Tooltip';
import styles from './IconButton.module.css';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: React.ReactNode;
  variant?: 'ghost' | 'secondary';
}

export function IconButton({ label, icon, variant = 'ghost', className, ...rest }: IconButtonProps) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        className={[styles.iconBtn, variant === 'secondary' && styles.secondary, className].filter(Boolean).join(' ')}
        aria-label={label}
        {...rest}
      >
        {icon}
      </button>
    </Tooltip>
  );
}
