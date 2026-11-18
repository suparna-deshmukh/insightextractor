'use client';
import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  // SSR always renders the false branch — start from the same value so
  // hydration matches, then sync the real match on mount.
  const [matches, setMatches] = useState<boolean>(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
