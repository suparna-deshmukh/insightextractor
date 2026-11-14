'use client';
import * as RToggleGroup from '@radix-ui/react-toggle-group';
import styles from './ToggleGroup.module.css';

export type ToggleOption<T extends string> = T | { value: T; label: string };

export function ToggleGroup<T extends string>({
  options,
  value,
  onValueChange,
  multiple = false,
  className,
  disabled,
  ariaLabel,
}: {
  options: readonly ToggleOption<T>[];
  value: T | T[];
  onValueChange: (value: T | T[]) => void;
  multiple?: boolean;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const norm = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const items = norm.map((o) => (
    <RToggleGroup.Item key={o.value} value={o.value} className={styles.item}>
      {o.label}
    </RToggleGroup.Item>
  ));
  const cls = [styles.group, className].filter(Boolean).join(' ');

  if (multiple) {
    return (
      <RToggleGroup.Root
        type="multiple"
        aria-label={ariaLabel}
        className={cls}
        value={(value as T[]) as string[]}
        onValueChange={(v) => onValueChange(v as unknown as T[])}
        disabled={disabled}
      >
        {items}
      </RToggleGroup.Root>
    );
  }
  return (
    <RToggleGroup.Root
      type="single"
      aria-label={ariaLabel}
      className={cls}
      value={(Array.isArray(value) ? value[0] : value) as string}
      onValueChange={(v) => {
        if (v === '') return;
        onValueChange(v as T);
      }}
      disabled={disabled}
    >
      {items}
    </RToggleGroup.Root>
  );
}
