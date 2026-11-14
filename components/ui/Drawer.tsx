'use client';
import * as RDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import { copy } from '@/lib/copy';
import styles from './Drawer.module.css';

export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  side = 'right',
  width = 480,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  side?: 'right' | 'left';
  width?: number;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className={styles.scrim} />
        <RDialog.Content className={`${styles.drawer} ${side === 'left' ? styles.left : ''}`} style={{ width: `min(${width}px, 100vw)` }}>
          <header className={styles.header}>
            <RDialog.Title className={styles.title}>{title}</RDialog.Title>
            <RDialog.Close asChild>
              <IconButton label={copy.common.close} icon={<X size={18} />} />
            </RDialog.Close>
          </header>
          <RDialog.Description className="sr-only">{copy.common.panel(title)}</RDialog.Description>
          <div className={styles.body}>{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
