import { EvidenceRecord, Plan, PipelineMode, TimeFrame, SourceId } from '../types';
import { httpJson, httpText, stripHtml } from './http';
import { getKey } from '../keys';
import { Provider, withTimeout } from './provider';
import { dedupe } from './hn';

export const META = { id: 'producthunt' as SourceId, label: 'Product Hunt', icon: '\u{1F984}', tagline: 'Launch-day feedback, hunter notes and maker Q&A', keyless: false, keyHint: 'PH developer API token (v2)' };

export const JOBS: (plan: Plan, _tf: TimeFrame, _mode: PipelineMode) => string[] = (plan) => [plan.keywords[0] ?? ''];

function windowStart(tf: TimeFrame): string {
  if (tf.preset === 'custom' && tf.start) return tf.start;
  if (tf.preset === 'all') return '';
  const days = tf.preset === '7d' ? 7 : tf.preset === '30d' ? 30 : tf.preset === '90d' ? 90 : 365;
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

async function graphql(shards: string[], tf: TimeFrame, mode: PipelineMode): Promise<EvidenceRecord[]> {
  const token = getKey('PRODUCTHUNT_API_TOKEN');
  if (!token) throw new Error('missing PRODUCTHUNT_API_TOKEN');
  const first = mode === 'rapid' ? 15 : 30;
  const q = shards[0] ?? '';
  const postedAfter = windowStart(tf);
  const gql = `query { posts(first: ${first}, order: VOTES${postedAfter ? `, posted_after: "${postedAfter}"` : ''}${q ? `, where: { search: "${q.replace(/"/g, '\\"')}"}` : ''}) { edges { node { id name tagline votesCount createdAt url comments(first: 5) { edges { node { id commentField { text } } } } } } } }`;
  const data = await httpJson('https://api.producthunt.com/v2/api/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: gql }),
  }, 20_000);
  const out: EvidenceRecord[] = [];
  for (const e of data?.data?.posts?.edges ?? []) {
    const n = e.node;
    const comments = (n.comments?.edges ?? []).map((c: any) => c.node?.commentField?.text ?? '').filter(Boolean).join(' | ');
    out.push({
      id: `ph-${n.id}`,
      source: 'producthunt',
      title: n.name,
      body: [n.tagline, comments.slice(0, 800)].filter(Boolean).join(' \u2014 '),
      url: n.url ?? '',
      author: 'Product Hunt',
      date: (n.createdAt ?? '').slice(0, 10),
      score: n.votesCount ?? 0,
    });
  }
  return out;
}

async function webScrape(shards: string[], _tf: TimeFrame, mode: PipelineMode): Promise<EvidenceRecord[]> {
  const q = shards[0] ?? '';
  const html = await httpText(`https://www.producthunt.com/search?q=${encodeURIComponent(q)}&page=1`, {}, 20_000);
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no embedded data (layout changed or bot-blocked)');
  const data = JSON.parse(m[1]);
  const out: EvidenceRecord[] = [];
  const posts: any[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const n of node) walk(n); return; }
    if (node.__typename === 'Post' && node.name && node.id) { posts.push(node); return; }
    for (const k of Object.keys(node)) walk(node[k]);
  };
  walk(data);
  for (const p of posts.slice(0, mode === 'rapid' ? 10 : 20)) {
    out.push({
      id: `ph-web-${p.id}`,
      source: 'producthunt',
      title: p.name,
      body: [p.tagline ?? '', p.description ? stripHtml(String(p.description)).slice(0, 400) : ''].filter(Boolean).join(' \u2014 '),
      url: `https://www.producthunt.com/posts/${p.slug ?? p.id}`,
      author: 'Product Hunt',
      date: (p.createdAt ?? '').slice(0, 10),
      score: p.votesCount ?? 0,
    });
  }
  if (!out.length) throw new Error('no posts parsed');
  return out;
}

export const PROVIDERS: Provider[] = [
  { id: 'ph-graphql', name: 'PH GraphQL API (token)', timeoutMs: 20_000, requiresKey: 'PRODUCTHUNT_API_TOKEN', fetch: (sh, _p, t, m) => withTimeout(graphql(sh, t, m), 20_000, 'ph-graphql').then(dedupe) },
  { id: 'ph-web', name: 'PH frontend data', timeoutMs: 25_000, fetch: (sh, _p, _t, m) => withTimeout(webScrape(sh, _t, m), 25_000, 'ph-web').then(dedupe) },
];
