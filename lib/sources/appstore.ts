import { EvidenceRecord, Plan, PipelineMode, TimeFrame, SourceId } from '../types';
import { httpJson, httpText } from './http';
import { Provider, withTimeout } from './provider';
import { dedupe } from './hn';

export const META = { id: 'appstore' as SourceId, label: 'App Store Reviews', icon: '\u{1F34E}', tagline: 'Star ratings + written reviews for iOS apps in the space', keyless: true };

export const JOBS: (plan: Plan, _tf: TimeFrame, mode: PipelineMode) => string[] = (plan, _tf, mode) =>
  (plan.apps ?? []).filter((a) => a.stores.includes('appstore')).map((a) => a.name).slice(0, mode === 'rapid' ? 2 : 4);

/** Resolves an app name to its iTunes track id. Prefers an exact title match,
 * then a prefix match, then the top search hit (labeled as such so the UI can
 * say WHICH app's reviews were read). */
async function resolveTrack(name: string): Promise<{ trackId: string; resolved: string; exact: boolean; hit: any } | null> {
  try {
    const data = await httpJson(`https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=software&country=us&limit=10`);
    const results: any[] = data.results ?? [];
    if (!results.length) return null;
    const exact = results.find((r) => (r.trackName ?? '').trim().toLowerCase() === name.trim().toLowerCase());
    if (exact) return { trackId: String(exact.trackId), resolved: String(exact.trackName), exact: true, hit: exact };
    const prefix = results.find((r) => String(r.trackName ?? '').trim().toLowerCase().startsWith(name.trim().toLowerCase()));
    if (prefix) return { trackId: String(prefix.trackId), resolved: String(prefix.trackName), exact: false, hit: prefix };
    const top = results[0];
    return { trackId: String(top.trackId), resolved: String(top.trackName), exact: false, hit: top };
  } catch {
    return null;
  }
}

/**
 * Rating-signal route — always works: the iTunes lookup itself carries the
 * average rating, the rating count and the per-star distribution. Apple
 * discontinued the public per-app review FEEDS in 2026, so this is the
 * reliable App Store signal; the RSS routes below stay as best-effort
 * bodies for the apps that still have feed entries.
 */
async function ratingSummary(shards: string[], _tf: TimeFrame, _mode: PipelineMode): Promise<EvidenceRecord[]> {
  const out: EvidenceRecord[] = [];
  const warns: string[] = [];
  for (const app of shards) {
    const hit = await resolveTrack(app);
    if (!hit) { warns.push(`${app}: not found on App Store`); continue; }
    const { trackId, resolved, exact, hit: h } = hit;
    const label = exact ? resolved : `${app} (matched “${resolved}”)`;
    const avg = Number(h.averageUserRating ?? 0);
    const count = Number(h.userRatingCount ?? 0);
    if (!count) { warns.push(`${label}: listed but has no App Store ratings yet`); continue; }
    out.push({
      id: `appstore-rating-${trackId}`,
      source: 'appstore',
      title: `${label} — App Store rating ${avg.toFixed(1)}★ (${count.toLocaleString('en-US')} ratings)`,
      body: `Average ${avg.toFixed(1)} out of 5 across ${count.toLocaleString('en-US')} App Store ratings. Star distribution: ${Array.from({ length: 5 }, (_, i) => `${i + 1}★:${h.userRatingCountByStar?.[String(i + 1)] ?? 0}`).join(' · ')}.`,
      url: `https://apps.apple.com/us/app/id${trackId}`,
      author: resolved,
      date: '',
      score: Math.min(100, avg * 10),
      rating: avg,
    });
    // A heavy 1-star tail is itself a finding — surface it as its own record.
    const oneStar = Number(h.userRatingCountByStar?.['1'] ?? 0);
    if (oneStar >= 100 && oneStar / count > 0.1) {
      out.push({
        id: `appstore-onestar-${trackId}`,
        source: 'appstore',
        title: `${label} — ${oneStar.toLocaleString('en-US')} one-star ratings (${Math.round((oneStar / count) * 100)}% of all ratings)`,
        body: `A material share of App Store raters give ${label} one star — a common signal of onboarding, sync or support pain (individual review text is not exposed by Apple anymore).`,
        url: `https://apps.apple.com/us/app/id${trackId}`,
        author: resolved,
        date: '',
        score: 20,
        rating: 1,
      });
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!out.length) throw new Error(warns.join(' | '));
  return out;
}

interface JEntry {
  'im:rating'?: { label: string };
  id?: { label: string };
  title?: { label: string };
  content?: { label: string };
  updated?: { label: string };
}

/** Best-effort review TEXT from the legacy iTunes feed (empty for most apps
 * since Apple discontinued per-app review feeds). */
async function reviewsFeed(shards: string[], tf: TimeFrame, mode: PipelineMode): Promise<EvidenceRecord[]> {
  const pages = mode === 'rapid' ? 1 : 2;
  const out: EvidenceRecord[] = [];
  const warns: string[] = [];
  for (const app of shards) {
    const hit = await resolveTrack(app);
    if (!hit) { warns.push(`${app}: not found on App Store`); continue; }
    const { trackId, resolved, exact } = hit;
    const label = exact ? resolved : `${app} (matched “${resolved}”)`;
    let all: JEntry[] = [];
    for (let page = 1; page <= pages; page++) {
      const url = `https://itunes.apple.com/us/rss/customerreviews/id=${trackId}/sortBy=mostRecent/json${page > 1 ? `&page=${page}` : ''}`;
      try {
        const feed = await httpJson(url, {}, 20_000);
        const entries: JEntry[] = feed?.feed?.entry ?? [];
        all = all.concat(entries);
        if (!entries.length) break;
      } catch (err) {
        warns.push(`${label}: review feed unreachable (${(err as Error).message.slice(0, 80)})`);
        break;
      }
    }
    if (!all.length) { warns.push(`${label}: no individual reviews exposed by Apple (rating summary still available)`); continue; }
    const days = tf.preset === '7d' ? 7 : tf.preset === '30d' ? 30 : tf.preset === '90d' ? 90 : tf.preset === '1y' ? 365 : 3650;
    const start = tf.preset === 'custom' ? tf.start ?? '' : new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const end = (tf.preset === 'custom' ? tf.end : undefined) ?? new Date().toISOString().slice(0, 10);
    const inWindow = all.filter((e) => {
      const d = (e.updated?.label ?? '').slice(0, 10);
      return !d || (d >= start && d <= end);
    });
    const use = inWindow.length ? inWindow : all;
    if (!inWindow.length && tf.preset !== 'all') warns.push(`${label}: 0 reviews in window — showing ${use.length} most recent instead`);
    for (const e of use) {
      const rating = e['im:rating']?.label;
      out.push({
        id: `appstore-${e.id?.label ?? `${trackId}-${Math.random().toString(36).slice(2, 8)}`}`,
        source: 'appstore',
        title: e.title?.label || `${label} review`,
        body: (e.content?.label ?? '').slice(0, 1000),
        url: `https://apps.apple.com/us/app/id${trackId}`,
        author: resolved,
        date: (e.updated?.label ?? '').slice(0, 10),
        score: rating ? Number(rating) * 10 : 50,
        rating: rating ? Number(rating) : undefined,
      });
    }
  }
  if (!out.length) throw new Error(warns.join(' | '));
  return out;
}

export const PROVIDERS: Provider[] = [
  { id: 'appstore-rating', name: 'iTunes rating summary', timeoutMs: 25_000, fetch: (sh, _p, _t, m) => withTimeout(ratingSummary(sh, { preset: 'all' }, m), 25_000, 'appstore-rating').then(dedupe) },
  { id: 'appstore-rss-json', name: 'iTunes review feed (best effort)', timeoutMs: 30_000, fetch: (sh, _p, t, m) => withTimeout(reviewsFeed(sh, t, m), 30_000, 'appstore-rss-json').then(dedupe) },
];
