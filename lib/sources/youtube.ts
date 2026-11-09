import { EvidenceRecord, Plan, PipelineMode, TimeFrame, SourceId } from '../types';
import { httpJson } from './http';
import { getKey } from '../keys';
import { Provider, withTimeout } from './provider';

export const META = { id: 'youtube' as SourceId, label: 'YouTube', icon: '\u25B6\uFE0F', tagline: 'Video reviews, comparisons and comment sentiment', keyless: false, keyHint: 'YouTube Data API v3 key' };

export const JOBS: (plan: Plan, _tf: TimeFrame, _mode: PipelineMode) => string[] = (plan) => [plan.keywords[0] ?? ''];

function windowParams(tf: TimeFrame): string {
  if (tf.preset === 'custom' && tf.start && tf.end) return `publishedAfter=${tf.start}T00:00:00Z&publishedBefore=${tf.end}T23:59:59Z&`;
  if (tf.preset === 'all') return '';
  const days = tf.preset === '7d' ? 7 : tf.preset === '30d' ? 30 : tf.preset === '90d' ? 90 : 365;
  return `publishedAfter=${new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)}T00:00:00Z&`;
}

async function dataApi(shards: string[], tf: TimeFrame, mode: PipelineMode): Promise<EvidenceRecord[]> {
  const key = getKey('YOUTUBE_API_KEY');
  if (!key) throw new Error('missing YOUTUBE_API_KEY');
  const q = shards[0] ?? '';
  const pub = windowParams(tf);
  const search = await httpJson(`https://www.googleapis.com/youtube/v3/search?part=snippet&key=${key}&type=video&maxResults=${mode === 'rapid' ? 5 : 10}&q=${encodeURIComponent(q)}&${pub}order=viewCount`, {}, 20_000);
  const out: EvidenceRecord[] = [];
  for (const v of (search.items ?? []) as any[]) {
    const vid = v.id?.videoId;
    if (!vid) continue;
    out.push({
      id: `yt-${vid}`,
      source: 'youtube',
      title: v.snippet?.title ?? '',
      body: `YouTube video by ${v.snippet?.channelTitle ?? ''} \u2014 review/comparison of ${q}.`,
      url: `https://www.youtube.com/watch?v=${vid}`,
      author: v.snippet?.channelTitle ?? '',
      date: (v.snippet?.publishedAt ?? '').slice(0, 10),
      score: 0,
    });
    try {
      const comments = await httpJson(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&key=${key}&videoId=${vid}&maxResults=10&order=relevance`, {}, 20_000);
      for (const c of (comments.items ?? []) as any[]) {
        const txt = c?.snippet?.topLevelComment?.snippet?.textDisplay ?? '';
        if (!txt) continue;
        out.push({
          id: `yt-${vid}-${c.id}`,
          source: 'youtube',
          title: `Comment: ${txt.slice(0, 110)}`,
          body: txt.slice(0, 600),
          url: `https://www.youtube.com/watch?v=${vid}`,
          author: c?.snippet?.topLevelComment?.snippet?.authorDisplayName ?? '',
          date: (c?.snippet?.topLevelComment?.snippet?.publishedAt ?? '').slice(0, 10),
          score: 1,
        });
      }
    } catch { /* comments optional */ }
  }
  return out;
}

const INVIDIOUS_INSTANCES = ['https://inv.nadeko.net', 'https://yewtu.be', 'https://invidious.nerdvpn.de'];

async function invidious(shards: string[], _tf: TimeFrame, mode: PipelineMode): Promise<EvidenceRecord[]> {
  const q = shards[0] ?? '';
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const data = await httpJson(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video&sort_by=relevance`, {}, 15_000);
      const out: EvidenceRecord[] = [];
      for (const v of (data ?? []).slice(0, mode === 'rapid' ? 5 : 10)) {
        out.push({
          id: `yt-iv-${v.videoId}`,
          source: 'youtube',
          title: v.title ?? '',
          body: `YouTube video by ${v.author ?? ''} \u2014 review/comparison of ${q}.`,
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
          author: v.author ?? '',
          date: v.published ? new Date(v.published * 1000).toISOString().slice(0, 10) : '',
          score: 0,
        });
      }
      if (out.length) return out;
    } catch { /* try next instance */ }
  }
  throw new Error('all Invidious instances unreachable');
}

export const PROVIDERS: Provider[] = [
  { id: 'yt-data-api', name: 'YouTube Data API v3 (key)', timeoutMs: 30_000, requiresKey: 'YOUTUBE_API_KEY', fetch: (sh, _p, t, m) => withTimeout(dataApi(sh, t, m), 30_000, 'yt-data-api') },
  { id: 'yt-invidious', name: 'Invidious public instances', timeoutMs: 45_000, fetch: (sh, _p, _t, m) => withTimeout(invidious(sh, _t, m), 45_000, 'yt-invidious') },
];
