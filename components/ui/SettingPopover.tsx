'use client';
import { useState } from 'react';
import * as RPopover from '@radix-ui/react-popover';
import * as RDialog from '@radix-ui/react-dialog';
import { ChevronDown } from 'lucide-react';
import { useMediaQuery } from './useMediaQuery';
import styles from './SettingPopover.module.css';

export function SettingPopover({
  icon,
  label,
  value,
  children,
  width = 380,
  open: controlledOpen,
  onOpenChange: controlledChange,
  triggerRef,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerRef?: React.RefObject<HTMLButtonElement>;
}) {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledChange ?? setInternalOpen;

  const trigger = (
    <button
      type="button"
      ref={triggerRef}
      className={[styles.trigger, open && styles.triggerOpen].filter(Boolean).join(' ')}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      <span className={styles.icon} aria-hidden="true">{icon}</span>
      <span className={styles.textBlock}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{value}</span>
      </span>
      <ChevronDown size={16} className={styles.chev} aria-hidden="true" />
    </button>
  );

  if (isMobile) {
    return (
      <RDialog.Root open={open} onOpenChange={setOpen}>
        {trigger}
        <RDialog.Portal>
          <RDialog.Overlay className={styles.scrim} />
          <RDialog.Content aria-label={label} className={styles.sheet}>
            <div className={styles.grab} aria-hidden="true" />
            <RDialog.Title className="sr-only">{label}</RDialog.Title>
            {children}
          </RDialog.Content>
        </RDialog.Portal>
      </RDialog.Root>
    );
  }

  return (
    <RPopover.Root open={open} onOpenChange={setOpen}>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content
          sideOffset={8}
          collisionPadding={16}
          align="start"
          style={{ width: `min(${width}px, calc(100vw - 32px))` }}
          className={styles.panel}
        >
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}
