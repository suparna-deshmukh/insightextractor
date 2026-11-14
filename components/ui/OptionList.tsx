'use client';
import * as RRadio from '@radix-ui/react-radio-group';
import { Check } from 'lucide-react';
import { Badge } from './Badge';
import styles from './OptionList.module.css';

export interface OptionRow<T extends string> {
  value: T;
  label: string;
  description?: string;
  badge?: string;
}

export function OptionList<T extends string>({
  options,
  value,
  onValueChange,
  ariaLabel,
  className,
}: {
  options: readonly OptionRow<T>[];
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <RRadio.Root
      className={[styles.list, className].filter(Boolean).join(' ')}
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <RRadio.Item key={o.value} value={o.value} className={styles.row}>
          <span className={styles.dot}>
            <RRadio.Indicator>
              <span className={styles.dotFill} />
            </RRadio.Indicator>
          </span>
          <span className={styles.text}>
            <span className={styles.titleLine}>
              <span className={styles.title}>{o.label}</span>
              {o.badge && <Badge tone="neutral">{o.badge}</Badge>}
            </span>
            {o.description && <span className={styles.desc}>{o.description}</span>}
          </span>
          <span className={styles.check} aria-hidden="true">
            <RRadio.Indicator>
              <Check size={16} />
            </RRadio.Indicator>
          </span>
        </RRadio.Item>
      ))}
    </RRadio.Root>
  );
}
