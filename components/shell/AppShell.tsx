'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { copy } from '@/lib/copy';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { ToastProvider } from '@/components/ui/Toast';
import { ThemeProvider } from './ThemeProvider';
import { SidebarContent } from './Sidebar';
import { MobileBar } from './MobileBar';
import styles from './shell.module.css';

function FocusOnRouteChange() {
  const pathname = usePathname();
  useEffect(() => {
    const h1 = document.querySelector<HTMLElement>('main h1');
    if (h1) {
      h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
    }
  }, [pathname]);
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <TooltipProvider>
          <a href="#main" className={styles.skipLink}>
            {copy.nav.skipToContent}
          </a>
          <div className={styles.layout}>
            <aside className={styles.desktopSidebar} aria-label="Sidebar">
              <SidebarContent />
            </aside>
            <MobileBar />
            <main id="main" className={styles.main}>
              {children}
            </main>
          </div>
          <FocusOnRouteChange />
        </TooltipProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
