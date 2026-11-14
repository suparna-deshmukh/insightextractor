'use client';
import * as RMenu from '@radix-ui/react-dropdown-menu';
import styles from './Menu.module.css';

export function Menu({ trigger, children, align = 'start' }: { trigger: React.ReactElement; children: React.ReactNode; align?: 'start' | 'end' }) {
  return (
    <RMenu.Root>
      <RMenu.Trigger asChild>{trigger}</RMenu.Trigger>
      <RMenu.Portal>
        <RMenu.Content sideOffset={8} collisionPadding={16} align={align} className={styles.menu}>
          {children}
        </RMenu.Content>
      </RMenu.Portal>
    </RMenu.Root>
  );
}

export function MenuItem({
  icon,
  children,
  destructive,
  onSelect,
  ...rest
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  destructive?: boolean;
  onSelect?: () => void;
} & Omit<React.ComponentProps<typeof RMenu.Item>, 'onSelect'>) {
  return (
    <RMenu.Item className={[styles.item, destructive && styles.destructive].filter(Boolean).join(' ')} onSelect={onSelect} {...rest}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.label}>{children}</span>
    </RMenu.Item>
  );
}
