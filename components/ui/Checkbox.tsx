'use client';
import * as RCheckbox from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import styles from './Checkbox.module.css';

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  id,
  className,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: React.ReactNode;
  id?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label className={[styles.row, className].filter(Boolean).join(' ')}>
      <RCheckbox.Root
        id={id}
        checked={checked}
        onCheckedChange={(c) => onCheckedChange(c === true)}
        disabled={disabled}
        className={styles.box}
      >
        <RCheckbox.Indicator>
          <Check size={14} aria-hidden="true" />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      <span className={styles.text}>{label}</span>
    </label>
  );
}
