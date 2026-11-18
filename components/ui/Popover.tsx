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
        <RPopover.Content
          sideOffset={8}
          collisionPadding={16}
          align={align}
          style={{ width: `min(${width}px, calc(100vw - 32px))` }}
          className={styles.panel}
          tabIndex={-1}
          onOpenAutoFocus={(e) => {
            // Radix focuses the panel on open; on small screens the panel can
            // flip above the trigger and the browser then scrolls the page to
            // the top. Focus the panel ourselves WITHOUT scrolling.
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus({ preventScroll: true });
          }}
        >
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}
