import { EvidenceRecord, Plan, PipelineMode, RedditAudit, SourceId, TimeFrame } from '../types';
import { META as HN_META, PROVIDERS as HN_PROVIDERS, JOBS as HN_JOBS } from './hn';
import { META as REDDIT_META, PROVIDERS as REDDIT_PROVIDERS, JOBS as REDDIT_JOBS, runRedditChannel } from './reddit';
import { META as APPSTORE_META, PROVIDERS as APPSTORE_PROVIDERS, JOBS as APPSTORE_JOBS } from './appstore';
import { META as PLAY_META, PROVIDERS as PLAY_PROVIDERS, JOBS as PLAY_JOBS } from './play';
import { META as GH_META, PROVIDERS as GH_PROVIDERS, JOBS as GH_JOBS } from './github';
import { META as GOOGLE_META, PROVIDERS as GOOGLE_PROVIDERS, JOBS as GOOGLE_JOBS } from './google';
import { META as PH_META, PROVIDERS as PH_PROVIDERS, JOBS as PH_JOBS } from './producthunt';
import { META as YT_META, PROVIDERS as YT_PROVIDERS, JOBS as YT_JOBS } from './youtube';
import { orderProviders, recordSuccess, recordFailure, loadHealth } from '../health';
import { providerError, withTimeout } from './provider';
import { getKey } from '../keys';
import { dedupe } from './hn';

export interface SourceMeta { id: SourceId; label: string; icon: string; tagline: string; keyless: boolean; keyHint?: string }

export interface SourceDef {
  meta: SourceMeta;
  providers: typeof HN_PROVIDERS;
  jobs: (plan: Plan, tf: TimeFrame, mode: PipelineMode) => string[];
  /** Optional full custom channel (e.g. the Gemini-driven Reddit channel). */
  run?: (
    plan: Plan,
    tf: TimeFrame,
    mode: PipelineMode,
    log: (text: string, tone?: 'info' | 'ok' | 'warn' | 'error') => void,
    fanOut: (shards: string[]) => Promise<{ records: EvidenceRecord[]; attempts: ProviderAttempt[] }>
  ) => Promise<PlatformFetch>;
}

export const SOURCES: Record<SourceId, SourceDef> = {
  hn: { meta: HN_META, providers: HN_PROVIDERS, jobs: HN_JOBS },
  reddit: {
    meta: REDDIT_META, providers: REDDIT_PROVIDERS, jobs: REDDIT_JOBS,
    run: (plan, tf, mode, log, fanOut) => runRedditChannel(plan, tf, mode, log, fanOut),
  },
  appstore: { meta: APPSTORE_META, providers: APPSTORE_PROVIDERS, jobs: APPSTORE_JOBS },
  play: { meta: PLAY_META, providers: PLAY_PROVIDERS, jobs: PLAY_JOBS },
  github: { meta: GH_META, providers: GH_PROVIDERS, jobs: GH_JOBS },
  google: { meta: GOOGLE_META, providers: GOOGLE_PROVIDERS, jobs: GOOGLE_JOBS },
  producthunt: { meta: PH_META, providers: PH_PROVIDERS, jobs: PH_JOBS },
  youtube: { meta: YT_META, providers: YT_PROVIDERS, jobs: YT_JOBS },
};

export const SOURCE_LIST = Object.values(SOURCES);

export interface ProviderAttempt {
  provider: string;
  name: string;
  ok: boolean;
  records?: number;
  error?: string;
  skipped?: string;
  ms: number;
}

export interface PlatformFetch {
  source: SourceId;
  records: EvidenceRecord[];
  provider: string | null;
  attempts: ProviderAttempt[];
  warning?: string;
  /** Optional channel-level accountability audit (e.g. the Reddit channel). */
  audit?: RedditAudit;
}

/**
 * Parallel query-sharded fan-out. The platform's work (search jobs / apps)
 * is split into shards and the top-K providers (in dynamic health order)
 * fire SIMULTANEOUSLY, each with its own fast timeout, each handling a
 * different shard. Results from every provider that succeeds are merged and
 * deduped — so if one API 429s or times out, only its slice is lost and
 * the other APIs keep flowing. Every outcome is written to the persistent
 * health ledger, which re-orders providers for the next run (2+ fails sink,
 * successes promote).
 */
export async function fetchPlatform(
  source: SourceId,
  plan: Plan,
  tf: TimeFrame,
  mode: PipelineMode,
  log: (text: string, tone?: 'info' | 'ok' | 'warn' | 'error') => void
): Promise<PlatformFetch> {
  const def = SOURCES[source];
  const shards = def.jobs(plan, tf, mode).filter(Boolean);
  const ordered = orderProviders(source, def.providers);
  const available = ordered.filter((p) => !p.requiresKey || getKey(p.requiresKey));
  const skipped: ProviderAttempt[] = ordered
    .filter((p) => p.requiresKey && !getKey(p.requiresKey))
    .map((p) => ({ provider: p.id, name: p.name, ok: false, skipped: `missing ${p.requiresKey}`, ms: 0 }));

  if (!available.length) {
    return { source, records: [], provider: null, attempts: skipped, warning: `all providers need a key (${skipped.map((x) => x.skipped).join(', ')})` };
  }
  if (def.run) {
    const runFanOut = (shards: string[]) => fanOut(source, def, shards, plan, tf, mode, log);
    return def.run(plan, tf, mode, log, runFanOut);
  }
  if (!shards.length) {
    return { source, records: [], provider: null, attempts: [], warning: 'plan produced no jobs for this platform' };
  }

  const fo = await fanOut(source, def, shards, plan, tf, mode, log);
  const top = [...fo.attempts].sort((a, b) => (b.records ?? 0) - (a.records ?? 0))[0];
  const failures = fo.attempts.filter((a) => a.error).map((a) => `${a.name}: ${a.error}`);
  const allFailed = fo.attempts.length > 0 && fo.attempts.every((a) => !a.ok);
  return {
    source,
    records: fo.records,
    provider: top && (top.records ?? 0) > 0 ? top.name : fo.attempts.some((a) => a.ok) ? top?.name ?? null : null,
    attempts: fo.attempts,
    warning: allFailed
      ? `all providers failed — ${failures.join(' | ')}`
      : failures.length
        ? `${failures.length} of ${fo.attempts.length} routes failed (merged survivors)`
        : fo.records.length
          ? undefined
          : '0 records',
  };
}

/**
 * Shared parallel shard fan-out across a source's health-ordered providers.
 */
export async function fanOut(
  source: SourceId,
  def: SourceDef,
  shards: string[],
  plan: Plan,
  tf: TimeFrame,
  mode: PipelineMode,
  log: (text: string, tone?: 'info' | 'ok' | 'warn' | 'error') => void
): Promise<{ records: EvidenceRecord[]; attempts: ProviderAttempt[] }> {
  const ordered = orderProviders(source, def.providers);
  const available = ordered.filter((p) => !p.requiresKey || getKey(p.requiresKey));
  const K = Math.min(available.length, Math.max(1, shards.length));
  const active = available.slice(0, K);
  const groups: string[][] = Array.from({ length: K }, () => []);
  shards.forEach((s, i) => groups[i % K].push(s));
  log(`${def.meta.label}: firing ${K} API${K > 1 ? 's' : ''} in parallel over ${shards.length} shard${shards.length > 1 ? 's' : ''}…`);

  const tasks = active.map((p, i) => {
    const t0 = Date.now();
    return (async () => {
      try {
        const recs = await withTimeout(p.fetch(groups[i], plan, tf, mode), p.timeoutMs ?? 20_000, p.name);
        return { p, ms: Date.now() - t0, recs, error: undefined as string | undefined };
      } catch (err) {
        return { p, ms: Date.now() - t0, recs: [] as EvidenceRecord[], error: providerError(err) };
      }
    })();
  });
  const results = await Promise.all(tasks);

  const attempts: ProviderAttempt[] = [];
  const merged: EvidenceRecord[] = [];
  for (const r of results) {
    if (r.error) {
      recordFailure(source, r.p.id, r.error);
      attempts.push({ provider: r.p.id, name: r.p.name, ok: false, error: r.error, ms: r.ms });
      log(`${def.meta.label}: ✗ ${r.p.name} failed (${r.error}, ${r.ms}ms) — other routes cover this`, 'warn');
    } else {
      recordSuccess(source, r.p.id);
      attempts.push({ provider: r.p.id, name: r.p.name, ok: true, records: r.recs.length, ms: r.ms });
      merged.push(...r.recs);
      log(`${def.meta.label}: ✓ ${r.p.name} → ${r.recs.length} records (${r.ms}ms)`, r.recs.length ? 'ok' : 'warn');
    }
  }

  return { records: dedupe(merged), attempts };
}

export function sourceReadiness(): { id: SourceId; ready: boolean; keyHint?: string }[] {
  return SOURCE_LIST.map((s) => {
    const needsKey = s.providers.some((p) => p.requiresKey);
    const hasAnyKey = s.providers.every((p) => !p.requiresKey || getKey(p.requiresKey));
    return { id: s.meta.id, ready: !needsKey || hasAnyKey, keyHint: s.meta.keyHint };
  });
}

export function healthMap() {
  return loadHealth();
}
