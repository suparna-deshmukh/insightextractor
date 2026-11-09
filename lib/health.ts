import { SourceId } from './types';
import { storeGetJson, storeSetJson } from './store';

export interface ProviderHealth {
  fails: number;
  successes: number;
  lastFailAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
}

export type HealthMap = Record<string, ProviderHealth>;

const KEY = 'ie:health';

function keyOf(source: SourceId, provider: string) {
  return `${source}:${provider}`;
}

/**
 * Provider health ledger in the shared KV store: one small JSON map for
 * every source:provider pair, shared across all instances. Fail-open — an
 * unreadable store simply looks like a fresh ledger.
 */
export async function loadHealth(): Promise<HealthMap> {
  const data = await storeGetJson<HealthMap>(KEY);
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

async function record(source: SourceId, provider: string, patch: (h: ProviderHealth) => void): Promise<void> {
  const map = await loadHealth();
  const k = keyOf(source, provider);
  const h = map[k] ?? { fails: 0, successes: 0 };
  patch(h);
  map[k] = h;
  await storeSetJson(KEY, map);
}

export async function recordSuccess(source: SourceId, provider: string): Promise<void> {
  return record(source, provider, (h) => {
    h.successes += 1;
    h.lastSuccessAt = Date.now();
    h.lastError = undefined;
  });
}

export async function recordFailure(source: SourceId, provider: string, error: string): Promise<void> {
  return record(source, provider, (h) => {
    h.fails += 1;
    h.lastFailAt = Date.now();
    h.lastError = error.slice(0, 200);
  });
}

/**
 * Dynamic ordering: providers are ranked by (successes - 3*fails) desc,
 * ties keep static order. A provider that fails twice sinks below providers
 * that work; a success promotes it again.
 */
export async function orderProviders<T extends { id: string }>(source: SourceId, providers: T[]): Promise<T[]> {
  const map = await loadHealth();
  const scored = providers.map((p, i) => {
    const h = map[keyOf(source, p.id)];
    const score = (h?.successes ?? 0) - (h?.fails ?? 0) * 3;
    return { p, i, score };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((x) => x.p);
}

export async function healthSnapshot(sources: { source: SourceId; providers: { id: string; name: string; requiresKey?: string }[] }[]) {
  const map = await loadHealth();
  return sources.map((s) => ({
    source: s.source,
    providers: s.providers.map((p) => {
      const h = map[keyOf(s.source, p.id)] ?? { fails: 0, successes: 0 };
      return { id: p.id, name: p.name, requiresKey: p.requiresKey, ...h };
    }),
  }));
}
