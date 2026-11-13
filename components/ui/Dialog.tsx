'use client';
import * as RDialog from '@radix-ui/react-dialog';
import styles from './Dialog.module.css';

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  actions,
  safeActionRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  safeActionRef?: React.RefObject<HTMLElement | null>;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className={styles.scrim} />
        <RDialog.Content
          className={styles.dialog}
          onOpenAutoFocus={() => {
            safeActionRef?.current?.focus();
          }}
        >
          <RDialog.Title className={styles.title}>{title}</RDialog.Title>
          {children && <RDialog.Description asChild><div className={styles.body}>{children}</div></RDialog.Description>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
