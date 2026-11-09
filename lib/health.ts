import fs from 'fs';
import path from 'path';
import { SourceId } from './types';
import { ensureDataDir } from './store';

export interface ProviderHealth {
  fails: number;
  successes: number;
  lastFailAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
}

export type HealthMap = Record<string, ProviderHealth>;

const FILE = path.join(ensureDataDir(), 'health.json');
let cache: HealthMap = {};

function keyOf(source: SourceId, provider: string) {
  return `${source}:${provider}`;
}

let loaded = false;
export function loadHealth(): HealthMap {
  if (loaded) return cache;
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    cache = data && typeof data === 'object' ? data : {};
  } catch {
    cache = {};
  }
  loaded = true;
  return cache;
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cache ?? {}, null, 1));
  } catch {
    /* ephemeral filesystem (e.g. Vercel) — in-memory only */
  }
}

export function recordSuccess(source: SourceId, provider: string) {
  const map = loadHealth();
  const k = keyOf(source, provider);
  const h = map[k] ?? { fails: 0, successes: 0 };
  h.successes += 1;
  h.lastSuccessAt = Date.now();
  h.lastError = undefined;
  map[k] = h;
  cache = map;
  persist();
}

export function recordFailure(source: SourceId, provider: string, error: string) {
  const map = loadHealth();
  const k = keyOf(source, provider);
  const h = map[k] ?? { fails: 0, successes: 0 };
  h.fails += 1;
  h.lastFailAt = Date.now();
  h.lastError = error.slice(0, 200);
  map[k] = h;
  cache = map;
  persist();
}

/**
 * Dynamic ordering: providers are ranked by (successes - 3*fails) desc,
 * ties keep static order. A provider that fails twice sinks below providers
 * that work; a success promotes it again.
 */
export function orderProviders<T extends { id: string }>(source: SourceId, providers: T[]): T[] {
  const map = loadHealth();
  const scored = providers.map((p, i) => {
    const h = map[keyOf(source, p.id)];
    const score = (h?.successes ?? 0) - (h?.fails ?? 0) * 3;
    return { p, i, score };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((x) => x.p);
}

export function healthSnapshot(sources: { source: SourceId; providers: { id: string; name: string; requiresKey?: string }[] }[]) {
  const map = loadHealth();
  return sources.map((s) => ({
    source: s.source,
    providers: s.providers.map((p) => {
      const h = map[keyOf(s.source, p.id)] ?? { fails: 0, successes: 0 };
      return { id: p.id, name: p.name, requiresKey: p.requiresKey, ...h };
    }),
  }));
}
