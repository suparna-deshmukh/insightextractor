import { EvidenceRecord, Plan, PipelineMode, TimeFrame, SourceId } from '../types';
import { httpJson, httpText, stripHtml } from './http';
import { Provider, withTimeout } from './provider';

export const META = { id: 'hn' as SourceId, label: 'Hacker News', icon: '\u{1F7E0}', tagline: 'Dev & product discourse — stories, arguments, launch feedback', keyless: true };

export const JOBS: (plan: Plan, _tf: TimeFrame, mode: PipelineMode) => string[] = (plan, _tf, mode) =>
  (plan.queries.hn?.length ? plan.queries.hn : plan.keywords).slice(0, mode === 'rapid' ? 2 : 3);

function windowFilter(tf: TimeFrame): string {
  if (tf.preset === 'all') return '';
  const end = tf.preset === 'custom' && tf.end ? Math.floor(new Date(tf.end + 'T23:59:59Z').getTime() / 1000) : Math.floor(Date.now() / 1000);
  const days = tf.preset === '7d' ? 7 : tf.preset === '30d' ? 30 : tf.preset === '90d' ? 90 : tf.preset === '1y' ? 365 : 3650;
  const start = tf.preset === 'custom' && tf.start ? Math.floor(new Date(tf.start + 'T00:00:00Z').getTime() / 1000) : Math.floor(Date.now() / 1000) - days * 86400;
  if (start <= 0) return `created_at_i<=${end}`;
  return `created_at_i>=${start},created_at_i<=${end}`;
}

export function dedupe(rows: EvidenceRecord[]): EvidenceRecord[] {
  const seen = new Set<string>();
  const out: EvidenceRecord[] = [];
  for (const r of rows) {
    const key = (r.title || r.url).toLowerCase().slice(0, 80);
    if (!key || seen.has(`${r.source}:${key}`)) continue;
    seen.add(`${r.source}:${key}`);
    out.push(r);
  }
  return out;
}

async function algolia(shards: string[], tf: TimeFrame, mode: PipelineMode, tags: string): Promise<EvidenceRecord[]> {
  const perPage = mode === 'rapid' ? 25 : 50;
  const filter = windowFilter(tf);
  const out: EvidenceRecord[] = [];
  for (const q of shards) {
    const url = `https://hn.algolia.com/api/v1/search?tags=${tags}&hitsPerPage=${perPage}&query=${encodeURIComponent(q)}` + (filter ? `&numericFilters=${encodeURIComponent(filter)}` : '');
    const data = await httpJson(url);
    for (const h of data.hits ?? []) {
      const isComment = tags.includes('comment') && !h.title;
      const storyUrl = `https://news.ycombinator.com/item?id=${h.story_id ?? h.objectID}`;
      out.push({
        id: `hn-${h.objectID}`,
        source: 'hn',
        title: h.title ?? h.story_title ?? (isComment ? 'HN comment' : ''),
        body: [isComment ? stripHtml(h.comment_text ?? '').slice(0, 600) : '', h.url, h.num_comments ? `${h.num_comments} comments` : ''].filter(Boolean).join(' · '),
        url: isComment ? storyUrl : (h.url && !String(h.url).startsWith('https://news.ycombinator') ? h.url : storyUrl),
        author: h.author ?? '',
        date: (h.created_at ?? '').slice(0, 10),
        score: h.points ?? 0,
      });
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return out;
}

async function ddgWeb(shards: string[], _plan: Plan, _tf: TimeFrame, mode: PipelineMode): Promise<EvidenceRecord[]> {
  const out: EvidenceRecord[] = [];
  for (const q of shards) {
    const html = await httpText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:news.ycombinator.com "${q}"`)}`, {}, 15_000);
    const re = /class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    let n = 0;
    while ((m = re.exec(html)) !== null && n < (mode === 'rapid' ? 10 : 20)) {
      let href = m[1];
      const uddg = href.match(/[?&]uddg=([^&]+)/);
      if (uddg) href = decodeURIComponent(uddg[1]);
      if (!href.includes('news.ycombinator.com')) continue;
      out.push({
        id: `hn-web-${encodeURIComponent(q)}-${n++}`,
        source: 'hn',
        title: stripHtml(m[2]),
        body: stripHtml(m[3]).slice(0, 500),
        url: href,
        author: 'web',
        date: new Date().toISOString().slice(0, 10),
        score: 1,
      });
    }
  }
  if (!out.length) throw new Error('no parseable results (DDG may be throttling)');
  return out;
}

export const PROVIDERS: Provider[] = [
  { id: 'hn-algolia', name: 'Algolia (stories)', timeoutMs: 15_000, fetch: (sh, p, t, m) => withTimeout(algolia(sh, t, m, 'story'), 15_000, 'hn-algolia').then(dedupe) },
  { id: 'hn-algolia-comments', name: 'Algolia (stories+comments)', timeoutMs: 15_000, fetch: (sh, p, t, m) => withTimeout(algolia(sh, t, m, 'story,comment'), 15_000, 'hn-algolia-comments').then(dedupe) },
  { id: 'hn-web', name: 'Web search (site: filter)', timeoutMs: 18_000, fetch: (sh, p, t, m) => withTimeout(ddgWeb(sh, p, t, m), 18_000, 'hn-web').then(dedupe) },
];
