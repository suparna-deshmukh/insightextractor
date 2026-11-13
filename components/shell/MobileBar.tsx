'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Menu as MenuIcon } from 'lucide-react';
import { copy } from '@/lib/copy';
import { IconButton } from '@/components/ui/IconButton';
import { Drawer } from '@/components/ui/Drawer';
import { SidebarContent } from './Sidebar';
import { getNavGuard } from '@/lib/client/navguard';
import { Wordmark } from './logo';
import styles from './shell.module.css';

export function MobileBar() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <header className={styles.mobileBar}>
        <IconButton label={copy.nav.openMenu} icon={<MenuIcon size={18} />} onClick={() => setOpen(true)} />
        <Link href="/" className={styles.mobileWordmark} aria-label={copy.app.name}>
          <Wordmark size={24} />
        </Link>
        <IconButton
          label={copy.nav.newResearch}
          icon={<Plus size={18} />}
          onClick={(e) => {
            const stop = { preventDefault: () => {} };
            const g = typeof getNavGuard === 'function' ? getNavGuard() : null;
            if (g) {
              (e as unknown as React.MouseEvent).preventDefault?.();
              g.onLeave('/');
              return;
            }
            void stop;
            setOpen(false);
            router.push('/');
          }}
        />
      </header>
      <Drawer open={open} onOpenChange={setOpen} title={copy.app.name} side="left" width={300}>
        <SidebarContent onNavigate={() => setOpen(false)} />
      </Drawer>
    </>
  );
}
