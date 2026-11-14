'use client';

import dynamic from 'next/dynamic';
import styles from './SourceIcon.module.css';

const Glyph = dynamic(() => import('./SourceIconGlyphs'));

export function SourceIcon({ id, size = 36 }: { id: string; size?: number }) {
  return (
    <span className={styles.tile} style={{ width: size, height: size }} aria-hidden="true">
      <Glyph id={id} size={Math.round(size * 0.55)} />
    </span>
  );
}
