import { EvidenceRecord, Plan, PipelineMode, TimeFrame, SourceId } from '../types';
import { httpJson } from './http';
import { Provider, withTimeout } from './provider';
import { dedupe } from './hn';

export const META = { id: 'github' as SourceId, label: 'GitHub Issues', icon: '\u{1F419}', tagline: 'Bug reports, feature requests and dev complaints for open-source tooling', keyless: true };

export const JOBS: (plan: Plan, _tf: TimeFrame, mode: PipelineMode) => string[] = (plan, _tf, mode) =>
  (plan.queries.github?.length ? plan.queries.github : plan.keywords).slice(0, mode === 'rapid' ? 2 : 3);

function createdFilter(tf: TimeFrame): string {
  if (tf.preset === 'all') return '';
  const days = tf.preset === '7d' ? 7 : tf.preset === '30d' ? 30 : tf.preset === '90d' ? 90 : 365;
  const start = tf.preset === 'custom' && tf.start ? tf.start : new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const end = (tf.preset === 'custom' ? tf.end : undefined) ?? new Date().toISOString().slice(0, 10);
  return `created:${start}..${end}`;
}

function mapIssue(it: any): EvidenceRecord {
  return {
    id: `gh-${it.id}`,
    source: 'github',
    title: it.title ?? '',
    body: (it.body ?? '').slice(0, 1000),
    url: it.html_url ?? '',
    author: it.user?.login ?? '',
    date: (it.created_at ?? '').slice(0, 10),
    score: (it.comments ?? 0) + (it.reactions?.total_count ?? 0),
  };
}

async function searchIssues(shards: string[], tf: TimeFrame, mode: PipelineMode, useDateFilter: boolean): Promise<EvidenceRecord[]> {
  const perPage = mode === 'rapid' ? 30 : 50;
  const startQ = useDateFilter ? createdFilter(tf) : '';
  const out: EvidenceRecord[] = [];
  for (const q of shards) {
    const term = `${q} is:issue ${startQ}`.trim();
    const data = await httpJson(`https://api.github.com/search/issues?q=${encodeURIComponent(term)}&per_page=${perPage}&sort=comments&order=desc`, {}, 20_000);
    for (const it of data.items ?? []) out.push(mapIssue(it));
    await new Promise((r) => setTimeout(r, 400));
  }
  return out;
}

async function topRepoIssues(shards: string[], _tf: TimeFrame, mode: PipelineMode): Promise<EvidenceRecord[]> {
  const q = shards[0] ?? '';
  const data = await httpJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=${mode === 'rapid' ? 2 : 3}&sort=stars&order=desc`, {}, 20_000);
  const out: EvidenceRecord[] = [];
  for (const repo of data.items ?? []) {
    const issues = await httpJson(`https://api.github.com/repos/${repo.full_name}/issues?state=all&per_page=20&sort=comments&direction=desc`, {}, 20_000);
    for (const it of issues ?? []) {
      if (it.pull_request) continue;
      out.push(mapIssue(it));
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return out;
}

export const PROVIDERS: Provider[] = [
  { id: 'gh-search-issues', name: 'Search API (issues, date-filtered)', timeoutMs: 25_000, fetch: (sh, _p, t, m) => withTimeout(searchIssues(sh, t, m, true), 25_000, 'gh-search-issues').then(dedupe) },
  { id: 'gh-search-broad', name: 'Search API (issues, broad window)', timeoutMs: 25_000, fetch: (sh, _p, t, m) => withTimeout(searchIssues(sh, t, m, false), 25_000, 'gh-search-broad').then(dedupe) },
  { id: 'gh-top-repos', name: 'Top repos issue feed', timeoutMs: 30_000, fetch: (sh, _p, t, m) => withTimeout(topRepoIssues(sh, t, m), 30_000, 'gh-top-repos').then(dedupe) },
];
