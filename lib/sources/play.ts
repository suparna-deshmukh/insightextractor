import { EvidenceRecord, Plan, PipelineMode, TimeFrame, SourceId } from '../types';
import { httpText, httpJson, UA, clampDate } from './http';
import { Provider, withTimeout } from './provider';
import { dedupe } from './hn';

export const META = { id: 'play' as SourceId, label: 'Play Store Reviews', icon: '\u{1F916}', tagline: 'Star ratings + written reviews for Android apps in the space', keyless: true };

export const JOBS: (plan: Plan, _tf: TimeFrame, mode: PipelineMode) => string[] = (plan, _tf, mode) =>
  (plan.apps ?? []).filter((a) => a.stores.includes('play')).map((a) => a.name).slice(0, mode === 'rapid' ? 2 : 4);

async function resolvePackage(name: string): Promise<string | null> {
  try {
    const html = await httpText(`https://play.google.com/store/search?q=${encodeURIComponent(name)}&c=apps&hl=en&gl=us`, {}, 20_000);
    const m = html.match(/\/store\/apps\/details\?id=([A-Za-z0-9._]+)[^"']*/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function findReviewObjects(node: any, out: any[]): void {
  if (!node) return;
  if (Array.isArray(node)) { for (const n of node) findReviewObjects(n, out); return; }
  if (typeof node === 'string') {
    try { findReviewObjects(JSON.parse(node), out); } catch { /* not json */ }
    return;
  }
  if (typeof node === 'object') {
    const keys = Object.keys(node);
    if (keys.includes('score') && keys.some((k) => k === 'content' || k === 'reviewText')) out.push(node);
    for (const k of keys) findReviewObjects(node[k], out);
  }
}

function toRecord(pkg: string, app: string, r: any, tf: TimeFrame): EvidenceRecord | null {
  const at = r.at ?? r.timestamp;
  let date = '';
  if (typeof at === 'number') date = new Date(at * 1000).toISOString().slice(0, 10);
  else if (typeof at === 'string' && at.length >= 10) date = at.slice(0, 10);
  if (tf.preset !== 'all' && date) {
    const days = tf.preset === '7d' ? 7 : tf.preset === '30d' ? 30 : tf.preset === '90d' ? 90 : 365;
    if (date < new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)) return null;
  }
  return {
    id: `play-${pkg}-${r.reviewId ?? Math.random().toString(36).slice(2, 10)}`,
    source: 'play',
    title: `${app} review (${r.score ?? '?'}\u2605)`,
    body: String(r.content ?? r.reviewText ?? '').slice(0, 1000),
    url: `https://play.google.com/store/apps/details?id=${pkg}`,
    author: app,
    date: clampDate(date) ?? '',
    score: (r.score ?? 0) * 10,
    rating: r.score ? Number(r.score) : undefined,
  };
}

async function batchexecute(shards: string[], tf: TimeFrame, mode: PipelineMode): Promise<EvidenceRecord[]> {
  const out: EvidenceRecord[] = [];
  let lastWarn: string | null = null;
  for (const app of shards) {
    const pkg = await resolvePackage(app);
    if (!pkg) { lastWarn = `${app}: not found on Play Store`; continue; }
    try {
      const count = mode === 'rapid' ? 40 : 80;
      const freq = JSON.stringify([[[`xdSrCf`, JSON.stringify([pkg, count, 1, 0, 0, 15]), null, 'generic']]]);
      const res = await fetch('https://play.google.com/_/PlayStoreUi/data/batchexecute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': UA },
        body: `f.req=${encodeURIComponent(freq)}`,
        signal: AbortSignal.timeout(20_000),
      });
      const raw = (await res.text()).replace(/^[\s\)]}'\n?/, '');
      const found: any[] = [];
      findReviewObjects(JSON.parse(raw), found);
      let n = 0;
      for (const r of found.slice(0, count)) {
        const rec = toRecord(pkg, app, r, tf);
        if (rec) { out.push(rec); n++; }
      }
      if (n === 0) lastWarn = `${app}: no reviews parsed (Google internals may have changed)`;
    } catch (err) {
      lastWarn = lastWarn ?? `${app}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  if (!out.length && lastWarn) throw new Error(lastWarn);
  return out;
}

async function htmlScrape(shards: string[], _tf: TimeFrame, _mode: PipelineMode): Promise<EvidenceRecord[]> {
  const out: EvidenceRecord[] = [];
  let lastWarn: string | null = null;
  for (const app of shards) {
    const pkg = await resolvePackage(app);
    if (!pkg) { lastWarn = `${app}: not found on Play Store`; continue; }
    const html = await httpText(`https://play.google.com/store/apps/details?id=${pkg}&hl=en&gl=us`, {}, 20_000);
    const re = /data-review-content="([^"]{30,})"/g;
    let n = 0;
    let cm: RegExpExecArray | null;
    while ((cm = re.exec(html)) !== null && n < 20) {
      const text = cm[1].replace(/\u0026quot;/g, '"').replace(/\u0026#39;/g, "'").replace(/\u0026lt;/g, '\u003c').replace(/\u0026gt;/g, '\u003e').replace(/\u0026amp;/g, '\u0026');
      const stars = html.slice(Math.max(0, cm.index - 4000), cm.index + 4000).match(/data-star-value="(\d)"/);
      out.push({
        id: `play-html-${pkg}-${n}`,
        source: 'play',
        title: `${app} review${stars ? ` (${stars[1]}\u2605)` : ''}`,
        body: text.slice(0, 1000),
        url: `https://play.google.com/store/apps/details?id=${pkg}`,
        author: app,
        date: new Date().toISOString().slice(0, 10),
        score: stars ? Number(stars[1]) * 10 : 50,
      });
      n++;
    }
    if (n === 0) lastWarn = lastWarn ?? `${app}: no review cards parsed`;
  }
  if (!out.length && lastWarn) throw new Error(lastWarn);
  return out;
}

export const PROVIDERS: Provider[] = [
  { id: 'play-batchexecute', name: 'Play Store RPC (batchexecute)', timeoutMs: 25_000, fetch: (sh, _p, t, m) => withTimeout(batchexecute(sh, t, m), 25_000, 'play-batchexecute').then(dedupe) },
  { id: 'play-html', name: 'Play Store page scrape', timeoutMs: 25_000, fetch: (sh, _p, t, m) => withTimeout(htmlScrape(sh, t, m), 25_000, 'play-html').then(dedupe) },
];
