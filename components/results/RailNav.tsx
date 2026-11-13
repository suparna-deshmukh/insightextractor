'use client';
import { useEffect, useState } from 'react';
import { copy } from '@/lib/copy';
import styles from './insights.module.css';

export function RailNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? '');

  useEffect(() => {
    const els = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    if (!els.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-96px 0px -60% 0px' },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    window.history.replaceState(null, '', '#' + id);
  };

  return (
    <nav className={`${styles.rail} no-print`} aria-label={copy.results.onThisPage}>
      <p className={styles.railTitle}>{copy.results.onThisPage}</p>
      <ul className={styles.railList}>
        {items.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              className={i.id === active ? `${styles.railLink} ${styles.railActive}` : styles.railLink}
              onClick={() => go(i.id)}
            >
              {i.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
