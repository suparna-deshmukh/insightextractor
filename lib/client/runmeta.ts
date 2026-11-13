import { useSyncExternalStore } from 'react';

const KEY = 'ie:runmeta:v1';
const EVENT = 'ie:runmeta';

export type RunMetaMap = Record<string, { title?: string; removed?: boolean }>;

function readMeta(): RunMetaMap {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as RunMetaMap) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function writeMeta(meta: RunMetaMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT));
}

const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener(EVENT, () => listeners.forEach((l) => l()));
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) listeners.forEach((l) => l());
  });
}

let snapshotCache: { raw: string | null; meta: RunMetaMap } | null = null;

const EMPTY_META = {} as RunMetaMap;

function getSnapshot(): RunMetaMap {
  const raw = typeof window === 'undefined' ? null : localStorage.getItem(KEY);
  if (snapshotCache && snapshotCache.raw === raw) return snapshotCache.meta;
  snapshotCache = { raw, meta: readMeta() };
  return snapshotCache.meta;
}

export function renameRun(id: string, title: string): void {
  const meta = readMeta();
  const entry = { ...meta[id] };
  const t = title.trim();
  if (t) entry.title = t;
  else delete entry.title;
  if (entry.title || entry.removed) meta[id] = entry;
  else delete meta[id];
  writeMeta(meta);
}

export function removeRun(id: string): void {
  const meta = readMeta();
  meta[id] = { ...meta[id], removed: true };
  writeMeta(meta);
}

export function restoreRun(id: string): void {
  const meta = readMeta();
  const entry = { ...meta[id] };
  delete entry.removed;
  if (entry.title) meta[id] = entry;
  else delete meta[id];
  writeMeta(meta);
}

export function useRunMeta() {
  const meta = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot,
    () => EMPTY_META,
  );
  return {
    meta,
    titleFor: (run: { id: string; topic: string }): string => meta[run.id]?.title || run.topic,
    isRemoved: (id: string): boolean => Boolean(meta[id]?.removed),
    rename: renameRun,
    remove: removeRun,
    restore: restoreRun,
  };
}
