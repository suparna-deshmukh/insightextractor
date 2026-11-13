'use client';
import * as RTooltip from '@radix-ui/react-tooltip';
import styles from './Tooltip.module.css';

export const TooltipProvider = RTooltip.Provider;

export function Tooltip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <RTooltip.Root delayDuration={400}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content sideOffset={6} className={styles.tooltip}>
          {label}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
