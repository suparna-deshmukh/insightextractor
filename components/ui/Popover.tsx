'use client';
import * as RPopover from '@radix-ui/react-popover';
import styles from './Popover.module.css';

export function Popover({
  trigger,
  children,
  width = 380,
  align = 'start',
}: {
  trigger: React.ReactElement;
  children: React.ReactNode;
  width?: number;
  align?: 'start' | 'end';
}) {
  return (
    <RPopover.Root>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content sideOffset={8} collisionPadding={16} align={align} style={{ width: `min(${width}px, calc(100vw - 32px))` }} className={styles.panel}>
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}
