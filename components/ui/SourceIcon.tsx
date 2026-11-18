'use client';

import { Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import styles from './SourceIcon.module.css';

const Glyph = dynamic(() => import('./SourceIconGlyphs'));

/** Warm the icon chunk in the background so the first popover open is
 * synchronous — without this the lazy chunk suspends the page-level
 * Suspense boundary and the whole form remounts (layout jump). */
let prefetched = false;

export function SourceIcon({ id, size = 36 }: { id: string; size?: number }) {
  useEffect(() => {
    if (!prefetched) {
      prefetched = true;
      void import('./SourceIconGlyphs');
    }
  }, []);
  const inner = Math.round(size * 0.55);
  return (
    <span className={styles.tile} style={{ width: size, height: size }} aria-hidden="true">
      <Suspense fallback={<span style={{ display: 'block', width: inner, height: inner }} />}>
        <Glyph id={id} size={inner} />
      </Suspense>
    </span>
  );
}
