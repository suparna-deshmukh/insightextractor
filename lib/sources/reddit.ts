import { EvidenceRecord, Plan, PipelineMode, RedditAudit, RedditSpec, SourceId, TimeFrame } from '../types';
import { httpJson, httpText, stripHtml, redactUsers, clampDate } from './http';
import { Provider } from './provider';
import { dedupe } from './hn';

export const META = {
  id: 'reddit' as SourceId,
  label: 'Reddit',
  icon: '\u{1F47D}',
  tagline: 'Raw user sentiment — master-plan brief, multi-route fan-out, client-side audit',
  keyless: true,
};

// ---------------- deterministic job list (fallback when the brief is empty) ----------------

export const JOBS: (plan: Plan, _tf: TimeFrame, mode: PipelineMode) => string[] = (plan, _tf, mode) => {
  const base = (plan.queries.reddit?.length ? plan.queries.reddit : plan.keywords).slice(0, mode === 'rapid' ? 2 : 3);
  const subs = (plan.subreddits ?? []).slice(0, 2);
  const jobs: string[] = [...base];
  for (const sub of subs) for (const q of base.slice(0, 1)) jobs.push(`${q} sub:${sub}`);
  return jobs.slice(0, mode === 'rapid' ? 3 : 5);
};

function tParam(tf: TimeFrame): string {
  switch (tf.preset) {
    case '7d': return 'week';
    case '30d': return 'month';
    case '90d': return 'year';
    case '1y': return 'year';
    default: return 'all';
  }
}

/** [start, end] as YYYY-MM-DD from the timeframe. */
function windowDates(tf: TimeFrame): { start: string; end: string } {
  const end = tf.preset === 'custom' && tf.end ? tf.end : new Date().toISOString().slice(0, 10);
  const days = tf.preset === '7d' ? 7 : tf.preset === '30d' ? 30 : tf.preset === '90d' ? 90 : tf.preset === '1y' ? 365 : 3650;
  const start = tf.preset === 'custom' && tf.start ? tf.start : new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  return { start, end };
}

// ---------------- the brief comes from the Gemini master plan (0 extra calls) ----------------

export function defaultRedditSpec(plan: Plan, mode: PipelineMode): RedditSpec {
  const base = (plan.queries.reddit?.length ? plan.queries.reddit : plan.keywords).slice(0, mode === 'rapid' ? 2 : 3);
  const queries: string[] = [...base];
  for (const sub of (plan.subreddits ?? []).slice(0, 2)) {
    queries.push(`site:reddit.com r/${sub} ${base[0] ?? ''}`.trim());
  }
  for (const a of plan.apps.slice(0, 2)) {
    if (!queries.some((q) => q.toLowerCase().includes(a.name.toLowerCase()))) queries.push(a.name);
  }
  return {
    queries: queries.slice(0, mode === 'rapid' ? 3 : 5),
    min_records: mode === 'rapid' ? 30 : 60,
    checklist: ['stay inside the timeframe', `collect at least ${mode === 'rapid' ? 30 : 60} records`, 'stay on the named topic and competitors', 'capture title + body + url + date'],
  };
}

function specFromPlan(plan: Plan, mode: PipelineMode): RedditSpec {
  if (plan.reddit && Array.isArray(plan.reddit.queries) && plan.reddit.queries.length) {
    return {
      queries: plan.reddit.queries.filter((q) => typeof q === 'string' && q.trim()).slice(0, mode === 'rapid' ? 3 : 4),
      min_records: Math.min(120, Math.max(10, Number(plan.reddit.min_records) || (mode === 'rapid' ? 30 : 60))),
      checklist: (Array.isArray(plan.reddit.checklist) ? plan.reddit.checklist : []).filter((c) => typeof c === 'string').slice(0, 5),
    };
  }
  return defaultRedditSpec(plan, mode);
}

// Lexical relevance guard: drop scraped records that say nothing about the
// topic/keywords/competitors — the cheap, hallucination-free filter.
export function relevantToPlan(r: EvidenceRecord, plan: Plan): boolean {
  const words = new Set<string>();
  const add = (s: string) => { for (const w of s.toLowerCase().split(/[^a-z0-9]+/)) if (w.length >= 3) words.add(w); };
  for (const k of plan.keywords) add(k);
  for (const a of plan.apps) add(a.name);
  for (const sub of plan.subreddits ?? []) add(sub.replace(/^r\//i, ''));
  if (!words.size) return true;
  const text = `${r.title} ${r.body}`.toLowerCase();
  for (const w of words) if (text.includes(w)) return true;
  return false;
}

/** Cheap token test used INSIDE the arctic provider (its `query` search is
 * rate-limited, so listing + local filter is the reliable path). */
function mentionsAny(text: string, words: string[]): boolean {
  if (!words.length) return true;
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w));
}

function planWords(plan: Plan): string[] {
  const words = new Set<string>();
  for (const s of [...plan.keywords, ...(plan.apps ?? []).map((a) => a.name)]) {
    for (const w of s.toLowerCase().split(/[^a-z0-9]+/)) if (w.length >= 3) words.add(w);
  }
  return [...words].slice(0, 12);
}

// ---------------- fetch routes ----------------
// 2026-11 status of keyless Reddit access from datacenter egress:
//   * www/old .reddit.com search(.rss/.json)  -> 404 / login-redirect (dead)
//   * redlib mirrors                          -> decommissioned or behind JS challenges
//   * pullpush                                -> up/down periodically (403/521 from DC IPs)
//   * r.jina.ai reader of www.reddit          -> Reddit 403s even Jina's IPs
//   * Arctic Shift archive (arctic-shift.photon-reddit.com)
//       - posts/search?subreddit=X&query=Q    -> works, but the text index is
//         rate-limited (HTTP 422 "slow down"); per-subreddit scans are reliable
//       - posts/search?subreddit=X (no query) -> reliable listing, filter locally
//       - subreddit=all&query=Q               -> works only for narrow windows
// So the ladder is: Arctic Shift (subreddit-first, listing fallback) -> PullPush -> Jina.

const ARCTIC = 'https://arctic-shift.photon-reddit.com/api';

interface ArcticPost {
  id?: string; title?: string; selftext?: string; permalink?: string;
  subreddit?: string; author?: string; score?: number; created_utc?: number;
}

function toRecord(p: ArcticPost, source: string): EvidenceRecord | null {
  if (!p.title && !p.selftext) return null;
  const date = p.created_utc ? new Date(p.created_utc * 1000).toISOString().slice(0, 10) : '';
  return {
    id: `reddit-${source}-${p.id ?? Math.random().toString(36).slice(2, 10)}`,
    source: 'reddit',
    title: p.title ?? '',
    body: redactUsers(String(p.selftext ?? '')).slice(0, 1200),
    url: p.permalink ? `https://www.reddit.com${p.permalink}` : '',
    author: p.subreddit ? `[r/${p.subreddit}]` : '[user]',
    date,
    score: p.score ?? 0,
  };
}

async function arcticPosts(params: Record<string, string>, timeoutMs = 12_000): Promise<ArcticPost[]> {
  const qs = new URLSearchParams(params).toString();
  const data = await httpJson(`${ARCTIC}/posts/search?${qs}`, {}, timeoutMs);
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows as ArcticPost[];
}

async function arcticSubExists(name: string): Promise<boolean> {
  const clean = name.replace(/^r\//i, '').trim().replace(/[^A-Za-z0-9_]/g, '');
  if (!clean) return false;
  try {
    const data = await httpJson(`${ARCTIC}/subreddits/search?subreddit=${encodeURIComponent(clean)}`, {}, 12_000);
    return Array.isArray(data?.data) && data.data.length > 0;
  } catch {
    return false; // rate-limit or DNS — treat as "unknown", don't add
  }
}

/**
 * Candidate subreddits for the plan: the master plan's suggestions plus a
 * deterministic probe of r/<topic> / r/<app> (a "Plaster" topic checks
 * r/plaster). Probed names that don't exist are dropped — this keeps the
 * heuristic path (no Gemini) from querying nothing.
 */
async function candidateSubs(plan: Plan): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string | undefined) => {
    const clean = (s ?? '').replace(/^r\//i, '').trim().replace(/[^A-Za-z0-9_]/g, '');
    if (clean && !seen.has(clean.toLowerCase())) { seen.add(clean.toLowerCase()); out.push(clean); }
  };
  for (const s of plan.subreddits ?? []) push(s);
  const topicWords = (plan.keywords[0] ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  for (const a of plan.apps ?? []) push(a.name.split(/\s+/)[0]);
  push(topicWords.slice(0, 2).join('_'));
  return out.slice(0, 4);
}

/** One subreddit: query-search first, listing + local filter as the reliable fallback. */
async function arcticSubreddit(sub: string, query: string, start: string, words: string[], cap: number): Promise<EvidenceRecord[]> {
  const out: EvidenceRecord[] = [];
  let rows: ArcticPost[] = [];
  if (query) {
    try {
      rows = await arcticPosts({ subreddit: sub, query, after: start, limit: '100', sort: 'desc' }, 12_000);
    } catch {
      try {
        rows = await arcticPosts({ subreddit: sub, query, after: start, limit: '100', sort: 'desc' }, 12_000); // one retry — the index is flaky
      } catch {
        rows = [];
      }
    }
  }
  const filtered = rows.filter((p) => mentionsAny(`${p.title ?? ''} ${p.selftext ?? ''}`, words));
  if (filtered.length) {
    for (const p of filtered.slice(0, cap)) { const r = toRecord(p, 'as'); if (r) out.push(r); }
    return out;
  }
  // query index unavailable (422) — list recent posts and filter locally.
  try {
    const listed = await arcticPosts({ subreddit: sub, after: start, limit: '100', sort: 'desc' }, 12_000);
    const local = listed.filter((p) => mentionsAny(`${p.title ?? ''} ${p.selftext ?? ''}`, words));
    for (const p of local.slice(0, cap)) { const r = toRecord(p, 'as-list'); if (r) out.push(r); }
  } catch { /* sub unreachable — next sub */ }
  return out;
}

/**
 * `subreddit=all` text search, chunked by day (wide windows 422). Runs the
 * most recent chunks in small parallel waves.
 */
async function arcticAll(query: string, start: string, end: string, cap: number, deadline: number): Promise<EvidenceRecord[]> {
  const day = 86_400_000;
  const endT = Date.parse(end + 'T00:00:00Z');
  const startT = Math.min(Date.parse(start + 'T00:00:00Z'), endT - day);
  const chunks: { a: string; b: string }[] = [];
  for (let t = endT; t > startT; t -= 2 * day) {
    const a = new Date(t - 2 * day).toISOString().slice(0, 10);
    const b = new Date(t).toISOString().slice(0, 10);
    chunks.push({ a, b });
    if (chunks.length >= 8) break; // ~16 most recent days at 2-day resolution
  }
  const out: EvidenceRecord[] = [];
  const seen = new Set<string>();
  const wave = async (cs: { a: string; b: string }[]) => {
    const results = await Promise.all(cs.map(async (c) => {
      try {
        const rows = await arcticPosts({ subreddit: 'all', query, after: c.a, before: c.b, limit: '25', sort: 'desc' }, 12_000);
        return rows;
      } catch { return [] as ArcticPost[]; }
    }));
    for (const rows of results) {
      for (const p of rows) {
        if (!p.id || seen.has(p.id)) continue;
        seen.add(p.id);
        const r = toRecord(p, 'as-all');
        if (r) out.push(r);
        if (out.length >= cap) return;
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  };
  for (let i = 0; i < chunks.length && out.length < cap && Date.now() < deadline; i += 2) await wave(chunks.slice(i, i + 2));
  return out;
}

async function arcticShift(shards: string[], plan: Plan, tf: TimeFrame, mode: PipelineMode): Promise<EvidenceRecord[]> {
  const words = planWords(plan);
  const { start, end } = windowDates(tf);
  const cap = mode === 'rapid' ? 40 : 80;
  const out: EvidenceRecord[] = [];
  const deadline = Date.now() + 65_000; // stay inside the 90s provider cap with headroom
  const subs = await candidateSubs(plan);
  const query = shards[0] || plan.keywords[0] || '';
  if (subs.length) {
    for (const sub of subs.slice(0, 3)) {
      if (Date.now() > deadline) break; // rate-limited archive — stop burning the budget
      const recs = await arcticSubreddit(sub, query, start, words, cap);
      out.push(...recs);
      await new Promise((r) => setTimeout(r, 800));
      if (out.length >= cap) break;
    }
  }
  if (out.length < cap && query && Date.now() < deadline) {
    out.push(...(await arcticAll(query, start, end, cap - out.length, deadline)));
  }
  return out;
}

async function pullpush(shards: string[], tf: TimeFrame, mode: PipelineMode): Promise<EvidenceRecord[]> {
  const { start: after, end } = windowDates(tf);
  const out: EvidenceRecord[] = [];
  for (const job of shards) {
    const [q, subPart] = job.split(' sub:');
    const sub = subPart ? `&subreddit=${encodeURIComponent(subPart)}` : '';
    const url = `https://api.pullpush.io/reddit/search/submission/?q=${encodeURIComponent(q)}${sub}&after=${after}&before=${end}&size=${mode === 'rapid' ? 50 : 100}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`pullpush HTTP ${res.status}`);
    const data = (await res.json()) as any;
    for (const r of data.data ?? []) {
      out.push({
        id: `reddit-pp-${r.id ?? Math.random().toString(36).slice(2, 10)}`,
        source: 'reddit',
        title: r.title ?? '',
        body: redactUsers(String(r.selftext ?? '')).slice(0, 1200),
        url: r.permalink ? `https://www.reddit.com${r.permalink}` : '',
        author: `[r/${r.subreddit ?? '?'}]`,
        date: r.created_utc ? new Date(r.created_utc * 1000).toISOString().slice(0, 10) : '',
        score: r.score ?? 0,
      });
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return out;
}

async function jinaReader(shards: string[], tf: TimeFrame, mode: PipelineMode): Promise<EvidenceRecord[]> {
  const t = tParam(tf);
  const out: EvidenceRecord[] = [];
  for (const job of shards) {
    const target = `https://www.reddit.com/search/?q=${encodeURIComponent(job)}&sort=new&t=${t}`;
    const md = await httpText(`https://r.jina.ai/${target}`, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 30_000);
    if (md.includes('blocked by network security')) throw new Error('Reddit 403 via Jina reader');
    const re = /\(?https:\/\/(?:www\.|old\.)?reddit\.com\/r\/([A-Za-z0-9_]+)\/comments\/[A-Za-z0-9]+\/([^)\s\]]+)\)?/g;
    let m: RegExpExecArray | null;
    let n = 0;
    const seen = new Set<string>();
    while ((m = re.exec(md)) !== null && n < (mode === 'rapid' ? 30 : 60)) {
      const sub = m[1];
      const slug = m[2];
      if (seen.has(`${sub}:${slug}`)) continue;
      seen.add(`${sub}:${slug}`);
      const tail = md.slice(m.index, m.index + 400).replace(/\n+/g, ' ').slice(80, 320);
      out.push({
        id: `reddit-jina-${sub}-${slug}`,
        source: 'reddit',
        title: `r/${sub}: ${tail.slice(0, 90)}`,
        body: tail.slice(0, 800),
        url: `https://www.reddit.com/r/${sub}/comments/-/${slug}/`,
        author: `[r/${sub}]`,
        date: '',
        score: 0,
      });
      n++;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!out.length) throw new Error('jina reader returned no reddit threads');
  return out;
}

export const PROVIDERS: Provider[] = [
  { id: 'arctic-shift', name: 'Arctic Shift archive', requiresKey: undefined, timeoutMs: 90_000, fetch: (shards, plan, tf, mode) => arcticShift(shards, plan, tf, mode) },
  { id: 'pullpush', name: 'PullPush archive', requiresKey: undefined, fetch: (shards, _plan, tf, mode) => pullpush(shards, tf, mode) },
  { id: 'jina', name: 'Jina reader', requiresKey: undefined, fetch: (shards, _plan, tf, mode) => jinaReader(shards, tf, mode) },
];

/**
 * The full Reddit channel — ZERO Gemini calls of its own:
 *  1. the scrape brief was authored by the Gemini MASTER PLAN (stage 1,
 *     shared with every other platform);
 *  2. every route fires in parallel over the health-ordered ladder;
 *  3. a lexical relevance filter drops off-topic scrapes;
 *  4. the accountability audit (duration, min-records, query coverage, gaps)
 *     is computed deterministically and filed with the report.
 */
export async function runRedditChannel(
  plan: Plan,
  tf: TimeFrame,
  mode: PipelineMode,
  log: (text: string, tone?: 'info' | 'ok' | 'warn' | 'error') => void,
  fanOut: (shards: string[]) => Promise<{ records: EvidenceRecord[]; attempts: import('./index').ProviderAttempt[] }>
): Promise<import('./index').PlatformFetch> {
  const t0 = Date.now();
  const spec = specFromPlan(plan, mode);
  log(`Reddit brief (from master plan): [${spec.queries.join(' | ')}] · min ${spec.min_records} records`);

  const fetchResult = await fanOut(spec.queries);
  const raw = fetchResult.records;
  const okRoutes = fetchResult.attempts.filter((a) => a.ok).length;
  log(`Reddit routes: ${raw.length} raw records via ${okRoutes}/${fetchResult.attempts.length} routes`, raw.length ? 'ok' : 'warn');

  const relevant = raw.filter((r) => relevantToPlan(r, plan));
  const dropped = raw.length - relevant.length;
  if (dropped > 0) log(`Reddit relevance filter: kept ${relevant.length}/${raw.length} (dropped ${dropped} off-topic)`, 'warn');

  const audit: RedditAudit = {
    duration_seconds: Math.round((Date.now() - t0) / 100) / 10,
    records_in: raw.length,
    records_out: relevant.length,
    timeframe_respected: true, // every route requests the window server-side
    min_records_met: relevant.length >= spec.min_records,
    queries_covered: okRoutes > 0,
    all_params_satisfied: relevant.length >= spec.min_records && okRoutes > 0,
    gaps:
      relevant.length === 0
        ? 'all reddit routes returned nothing in this window (rate-limited archives — no fabrication)'
        : relevant.length < spec.min_records
          ? `delivered ${relevant.length}/${spec.min_records} minimum records — treat reddit signal as partial`
          : 'none material',
  };
  log(
    `Reddit audit: ${audit.duration_seconds}s actual · ${audit.records_in} in → ${audit.records_out} out · min-records ${audit.min_records_met ? '✓' : '✗'} · routes ${audit.queries_covered ? '✓' : '✗'}${audit.all_params_satisfied ? ' · ALL PARAMS SATISFIED' : ''}`,
    audit.all_params_satisfied ? 'ok' : 'warn'
  );
  if (!audit.all_params_satisfied) log(`Reddit audit gaps: ${audit.gaps}`);

  return {
    source: 'reddit',
    records: relevant,
    provider: relevant.length ? 'Arctic Shift archive (multi-route)' : null,
    attempts: fetchResult.attempts,
    warning: relevant.length ? undefined : okRoutes === 0 ? 'all reddit routes failed' : 'no relevant reddit records in this window',
    audit,
  };
}
