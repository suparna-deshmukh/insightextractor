'use client';
import { useEffect } from 'react';

/**
 * Set document.title. Next applies the layout metadata after the hydration
 * commit and overwrites a plain assignment, so also re-assert whenever the
 * <head> changes. The comparison prevents a mutation loop.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return;
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const raf = window.requestAnimationFrame(apply);
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [title]);
}
