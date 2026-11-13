'use client';
import * as RCollapsible from '@radix-ui/react-collapsible';
import { ChevronRight } from 'lucide-react';
import styles from './Disclosure.module.css';

export function Disclosure({
  title,
  sub,
  open,
  onOpenChange,
  children,
  className,
  triggerClassName,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  triggerClassName?: string;
}) {
  return (
    <RCollapsible.Root open={open} onOpenChange={onOpenChange} className={className}>
      <RCollapsible.Trigger asChild>
        <button type="button" className={[styles.trigger, triggerClassName].filter(Boolean).join(' ')} aria-expanded={open}>
          <ChevronRight size={18} className={open ? styles.chevOpen : styles.chev} aria-hidden="true" />
          <span className={styles.title}>{title}</span>
          {sub && <span className={styles.sub}>{sub}</span>}
        </button>
      </RCollapsible.Trigger>
      <RCollapsible.Content className={styles.content}>
        <div className={styles.inner}>{children}</div>
      </RCollapsible.Content>
    </RCollapsible.Root>
  );
}
