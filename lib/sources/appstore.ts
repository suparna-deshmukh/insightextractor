import { EvidenceRecord, Plan, PipelineMode, TimeFrame, SourceId } from '../types';
import { httpJson, httpText, clampDate } from './http';
import { Provider, withTimeout } from './provider';
import { dedupe } from './hn';

export const META = { id: 'appstore' as SourceId, label: 'App Store Reviews', icon: '\u{1F34E}', tagline: 'Star ratings + written reviews for iOS apps in the space', keyless: true };

export const JOBS: (plan: Plan, _tf: TimeFrame, mode: PipelineMode) => string[] = (plan, _tf, mode) =>
  (plan.apps ?? []).filter((a) => a.stores.includes('appstore')).map((a) => a.name).slice(0, mode === 'rapid' ? 2 : 4);

async function resolveTrackId(name: string): Promise<string | null> {
  try {
    const data = await httpJson(`https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=software&country=us&limit=10`);
    const results: any[] = data.results ?? [];
    const exact = results.find((r) => (r.trackName ?? '').trim().toLowerCase() === name.trim().toLowerCase());
    return (exact ?? results[0])?.trackId ?? null;
  } catch {
    return null;
  }
}

function windowOk(date: string, tf: TimeFrame): boolean {
  if (!date) return true;
  if (tf.preset === 'all') return true;
  const days = tf.preset === '7d' ? 7 : tf.preset === '30d' ? 30 : tf.preset === '90d' ? 90 : 365;
  const start = tf.preset === 'custom' ? tf.start! : new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const end = (tf.preset === 'custom' ? tf.end : undefined) ?? new Date().toISOString().slice(0, 10);
  return date >= start && date <= end;
}

interface JEntry {
  'im:rating'?: { label: string };
  id?: { label: string };
  title?: { label: string };
  content?: { label: string };
  updated?: { label: string };
}

async function reviewsJson(shards: string[], tf: TimeFrame, mode: PipelineMode): Promise<EvidenceRecord[]> {
  const pages = mode === 'rapid' ? 1 : 2;
  const out: EvidenceRecord[] = [];
  let lastWarn: string | null = null;
  for (const app of shards) {
    const trackId = await resolveTrackId(app);
    if (!trackId) { lastWarn = `${app}: not found on App Store`; continue; }
    let n = 0;
    for (let page = 1; page <= pages; page++) {
      const url = `https://itunes.apple.com/us/rss/customerreviews/id=${trackId}/sortBy=mostRecent/json${page > 1 ? `&page=${page}` : ''}`;
      try {
        const feed = await httpJson(url, {}, 20_000);
        const entries: JEntry[] = feed?.feed?.entry ?? [];
        for (const e of entries) {
          const date = clampDate(e.updated?.label) ?? '';
          if (!windowOk(date, tf)) continue;
          const rating = e['im:rating']?.label;
          n++;
          out.push({
            id: `appstore-${e.id?.label ?? Math.random().toString(36).slice(2, 10)}`,
            source: 'appstore',
            title: e.title?.label || `${app} review`,
            body: (e.content?.label ?? '').slice(0, 1000),
            url: `https://apps.apple.com/us/app/id${trackId}`,
            author: app,
            date,
            score: rating ? Number(rating) * 10 : 50,
            rating: rating ? Number(rating) : undefined,
          });
        }
        if (!entries.length) break;
      } catch {
        break;
      }
    }
    if (n === 0) lastWarn = lastWarn ?? `${app}: review feed empty or unreachable`;
  }
  if (!out.length && lastWarn) throw new Error(lastWarn);
  return out;
}

async function reviewsAtom(shards: string[], tf: TimeFrame, _mode: PipelineMode): Promise<EvidenceRecord[]> {
  const out: EvidenceRecord[] = [];
  let lastWarn: string | null = null;
  for (const app of shards) {
    const trackId = await resolveTrackId(app);
    if (!trackId) { lastWarn = `${app}: not found on App Store`; continue; }
    let n = 0;
    try {
      const xml = await httpText(`https://itunes.apple.com/us/customerreviews/${trackId}`, {}, 20_000);
      for (const e of xml.split('<entry>').slice(1)) {
        const title = e.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
        const content = e.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ?? '';
        const published = e.match(/<published>([^<]+)<\/published>/)?.[1] ?? '';
        const rating = e.match(/<im:rating>(\d+)<\/im:rating>/)?.[1];
        const date = clampDate(published) ?? '';
        if (!windowOk(date, tf)) continue;
        n++;
        out.push({
          id: `appstore-atom-${trackId}-${n}`,
          source: 'appstore',
          title: title || `${app} review`,
          body: content.slice(0, 1000),
          url: `https://apps.apple.com/us/app/id${trackId}`,
          author: app,
          date,
          score: rating ? Number(rating) * 10 : 50,
          rating: rating ? Number(rating) : undefined,
        });
      }
    } catch (err) {
      lastWarn = lastWarn ?? `${app}: ${(err as Error).message}`;
    }
    if (n === 0) lastWarn = lastWarn ?? `${app}: no atom entries`;
  }
  if (!out.length && lastWarn) throw new Error(lastWarn);
  return out;
}

export const PROVIDERS: Provider[] = [
  { id: 'appstore-rss-json', name: 'iTunes JSON review feed', timeoutMs: 25_000, fetch: (sh, _p, t, m) => withTimeout(reviewsJson(sh, t, m), 25_000, 'appstore-rss-json').then(dedupe) },
  { id: 'appstore-rss-atom', name: 'iTunes Atom review feed', timeoutMs: 25_000, fetch: (sh, _p, t, m) => withTimeout(reviewsAtom(sh, t, m), 25_000, 'appstore-rss-atom').then(dedupe) },
];
